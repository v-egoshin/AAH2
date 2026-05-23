import {
  ReactElement,
  ReactNode,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, MutableRefObject, Ref } from "react";
import { createPortal } from "react-dom";

type OpenReason = "mouse" | "keyboard";

type AnchorPoint = {
  x: number;
  y: number;
};

type ContextMenuItemRecord = {
  id: string;
  disabled: boolean;
  closeOnSelect: boolean;
  onSelect: () => void | Promise<void>;
};

type ContextMenuContextValue = {
  open: boolean;
  anchor: AnchorPoint;
  activeItemId: string | null;
  contentRef: MutableRefObject<HTMLDivElement | null>;
  triggerRef: MutableRefObject<HTMLElement | null>;
  setActiveItemId: (id: string | null) => void;
  registerItem: (item: ContextMenuItemRecord) => () => void;
  closeMenu: () => void;
  handleItemSelect: (id: string) => void;
  requestPointerOpen: (event: ReactMouseEvent<HTMLElement>) => void;
  requestKeyboardOpen: (target: HTMLElement) => void;
};

const VIEWPORT_MARGIN = 8;

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T) => {
    for (const ref of refs) {
      if (!ref) {
        continue;
      }
      if (typeof ref === "function") {
        ref(value);
      } else {
        (ref as MutableRefObject<T | null>).current = value;
      }
    }
  };
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  const tagName = element.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || element.isContentEditable;
}

function clampPosition(anchor: AnchorPoint, menu: DOMRect) {
  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - menu.width - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - menu.height - VIEWPORT_MARGIN);
  return {
    left: Math.min(Math.max(anchor.x, VIEWPORT_MARGIN), maxLeft),
    top: Math.min(Math.max(anchor.y, VIEWPORT_MARGIN), maxTop),
  };
}

function useContextMenu() {
  const value = useContext(ContextMenuContext);
  if (!value) {
    throw new Error("ContextMenu components must be used inside ContextMenu");
  }
  return value;
}

export function ContextMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorPoint>({ x: 0, y: 0 });
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [openReason, setOpenReason] = useState<OpenReason>("mouse");
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef(new Map<string, ContextMenuItemRecord>());

  const getOrderedItems = () => {
    const content = contentRef.current;
    if (!content) {
      return [] as ContextMenuItemRecord[];
    }
    const orderedIds = [...content.querySelectorAll<HTMLElement>("[data-context-menu-item-id]")]
      .map((node) => node.dataset.contextMenuItemId ?? "")
      .filter(Boolean);
    return orderedIds
      .map((id) => itemsRef.current.get(id))
      .filter((item): item is ContextMenuItemRecord => Boolean(item));
  };

  const getEnabledItems = () => getOrderedItems().filter((item) => !item.disabled);

  const closeMenu = () => {
    setOpen(false);
    setActiveItemId(null);
  };

  const requestPointerOpen = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    setAnchor({ x: event.clientX, y: event.clientY });
    setOpenReason("mouse");
    setOpen(true);
  };

  const requestKeyboardOpen = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setAnchor({ x: rect.left, y: rect.bottom + 4 });
    setOpenReason("keyboard");
    setOpen(true);
  };

  const registerItem = (item: ContextMenuItemRecord) => {
    itemsRef.current.set(item.id, item);
    return () => {
      itemsRef.current.delete(item.id);
    };
  };

  const handleItemSelect = (id: string) => {
    const item = itemsRef.current.get(id);
    if (!item || item.disabled) {
      return;
    }
    if (item.closeOnSelect) {
      closeMenu();
    }
    void item.onSelect();
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const enabledItems = getEnabledItems();
    if (!enabledItems.length) {
      setActiveItemId(null);
      return;
    }
    setActiveItemId((current) => {
      if (current && enabledItems.some((item) => item.id === current)) {
        return current;
      }
      return enabledItems[0].id;
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (contentRef.current?.contains(target) || triggerRef.current?.contains(target))) {
        return;
      }
      closeMenu();
    };

    const moveActive = (direction: 1 | -1) => {
      const enabledItems = getEnabledItems();
      if (!enabledItems.length) {
        return;
      }
      const currentIndex = enabledItems.findIndex((item) => item.id === activeItemId);
      const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + enabledItems.length) % enabledItems.length;
      setActiveItemId(enabledItems[nextIndex].id);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActive(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActive(-1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        const first = getEnabledItems()[0];
        setActiveItemId(first?.id ?? null);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        const enabledItems = getEnabledItems();
        setActiveItemId(enabledItems.at(-1)?.id ?? null);
        return;
      }
      if ((event.key === "Enter" || event.key === " ") && activeItemId) {
        event.preventDefault();
        handleItemSelect(activeItemId);
      }
    };

    const closeFromViewportChange = () => {
      closeMenu();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeFromViewportChange);
    window.addEventListener("scroll", closeFromViewportChange, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeFromViewportChange);
      window.removeEventListener("scroll", closeFromViewportChange, true);
    };
  }, [activeItemId, open]);

  useEffect(() => {
    if (!open || openReason !== "keyboard") {
      return;
    }
    contentRef.current?.focus();
  }, [open, openReason]);

  const value = useMemo<ContextMenuContextValue>(() => ({
    open,
    anchor,
    activeItemId,
    contentRef,
    triggerRef,
    setActiveItemId,
    registerItem,
    closeMenu,
    handleItemSelect,
    requestPointerOpen,
    requestKeyboardOpen,
  }), [activeItemId, anchor, open]);

  return <ContextMenuContext.Provider value={value}>{children}</ContextMenuContext.Provider>;
}

export function ContextMenuTrigger({ children }: { children: ReactElement }) {
  const {
    open,
    triggerRef,
    requestPointerOpen,
    requestKeyboardOpen,
  } = useContextMenu();

  if (!isValidElement(children)) {
    throw new Error("ContextMenuTrigger expects a single React element child");
  }

  const child = children as ReactElement<{
    onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
    onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
    "aria-haspopup"?: string;
    "aria-expanded"?: boolean;
  }>;

  return cloneElement(child, {
    ref: mergeRefs((child as ReactElement & { ref?: Ref<HTMLElement> }).ref, triggerRef),
    "aria-haspopup": "menu",
    "aria-expanded": open,
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
      child.props.onContextMenu?.(event);
      if (!event.defaultPrevented) {
        requestPointerOpen(event);
      }
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      child.props.onKeyDown?.(event);
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
        event.preventDefault();
        requestKeyboardOpen(event.currentTarget);
      }
    },
  });
}

export function ContextMenuContent({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { open, anchor, contentRef } = useContextMenu();
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !contentRef.current) {
      return;
    }
    setPosition(clampPosition(anchor, contentRef.current.getBoundingClientRect()));
  }, [anchor, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={contentRef}
      className={["context-menu", className].filter(Boolean).join(" ")}
      role="menu"
      tabIndex={-1}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

type ContextMenuItemProps = {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  closeOnSelect?: boolean;
  danger?: boolean;
  icon?: ReactNode;
  onSelect: () => void | Promise<void>;
};

export function ContextMenuItem({
  children,
  active = false,
  disabled = false,
  closeOnSelect = true,
  danger = false,
  icon,
  onSelect,
}: ContextMenuItemProps) {
  const {
    activeItemId,
    registerItem,
    setActiveItemId,
    handleItemSelect,
  } = useContextMenu();
  const itemId = useId();

  useEffect(() => registerItem({
    id: itemId,
    disabled,
    closeOnSelect,
    onSelect,
  }), [closeOnSelect, disabled, itemId, onSelect, registerItem]);

  return (
    <button
      data-context-menu-item-id={itemId}
      className={[
        "context-menu-item",
        icon ? "context-menu-item-with-icon" : "",
        activeItemId === itemId || active ? "is-active" : "",
        danger ? "is-danger" : "",
      ].filter(Boolean).join(" ")}
      type="button"
      role="menuitem"
      aria-disabled={disabled ? "true" : undefined}
      disabled={disabled}
      onMouseEnter={() => {
        if (!disabled) {
          setActiveItemId(itemId);
        }
      }}
      onClick={() => handleItemSelect(itemId)}
    >
      {icon ? (
        <span className="context-menu-item-label">
          <span className="context-menu-item-icon" aria-hidden="true">{icon}</span>
          <span>{children}</span>
        </span>
      ) : children}
    </button>
  );
}

export function ContextMenuSeparator() {
  return <div className="context-menu-separator" role="separator" />;
}

export function ContextMenuSubmenu({
  label,
  children,
  icon,
}: {
  label: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="context-submenu">
      <button
        className="context-menu-item context-menu-item-with-icon context-submenu-trigger"
        type="button"
        aria-haspopup="menu"
      >
        <span className="context-menu-item-label">
          {icon ? <span className="context-menu-item-icon" aria-hidden="true">{icon}</span> : null}
          <span>{label}</span>
        </span>
        <span className="context-submenu-caret" aria-hidden="true">›</span>
      </button>
      <div className="context-submenu-panel" role="menu">
        {children}
      </div>
    </div>
  );
}
