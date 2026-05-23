import { ReactNode } from "react";

export type TreeVariant = "check" | "relation";

export type TreeRenderArgs<T> = {
  node: T;
  depth: number;
  nodeKey: string;
  hasChildren: boolean;
  isCollapsed: boolean;
  toggle: () => void;
};

export function TreeExpander({
  hasChildren,
  isCollapsed,
  onToggle,
}: {
  hasChildren: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={`tree-expander ${hasChildren ? "is-visible" : "is-placeholder"}`}
      type="button"
      onClick={onToggle}
      aria-label={hasChildren ? (isCollapsed ? "Expand node" : "Collapse node") : "Leaf node"}
      title={hasChildren ? (isCollapsed ? "Expand" : "Collapse") : ""}
    >
      {hasChildren ? (isCollapsed ? "+" : "−") : ""}
    </button>
  );
}

export function TreeView<T>({
  roots,
  getId,
  getChildren,
  collapsedIds,
  onToggle,
  renderLine,
  renderAfterLine,
  variant,
}: {
  roots: T[];
  getId: (node: T) => string;
  getChildren: (node: T) => T[];
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
  renderLine: (args: TreeRenderArgs<T>) => ReactNode;
  renderAfterLine?: (args: TreeRenderArgs<T>) => ReactNode;
  variant: TreeVariant;
}) {
  const renderNode = (node: T, depth: number): ReactNode => {
    const nodeKey = getId(node);
    const children = getChildren(node);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedIds.has(nodeKey);
    const args: TreeRenderArgs<T> = {
      node,
      depth,
      nodeKey,
      hasChildren,
      isCollapsed,
      toggle: () => {
        if (hasChildren) {
          onToggle(nodeKey);
        }
      },
    };
    return (
      <div
        key={`${nodeKey}:${depth}`}
        className={variant === "check" ? "tree-node-shell" : "relation-tree-node"}
        style={variant === "relation" ? { marginLeft: depth * 14 } : undefined}
      >
        {renderLine(args)}
        {renderAfterLine ? renderAfterLine(args) : null}
        {hasChildren && !isCollapsed ? (
          <div className={variant === "check" ? "tree-children" : "relation-tree-children"}>
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return <>{roots.map((node) => renderNode(node, 0))}</>;
}
