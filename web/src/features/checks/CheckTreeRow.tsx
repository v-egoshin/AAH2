import { DragEvent, memo, type MutableRefObject } from "react";

import { CheckRecord } from "../../api/client";
import { InlineEditableText } from "../../components/common";
import { TreeExpander } from "../../components/tree";

function DropZone({
  active,
  onDragOver,
  onDrop,
  compact = false,
}: {
  active: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  compact?: boolean;
}) {
  return <div className={`tree-dropzone ${active ? "is-active" : ""} ${compact ? "is-compact" : ""}`} onDragOver={onDragOver} onDrop={onDrop} />;
}

export type CheckTreeRowActions = {
  selectRow: (row: CheckRecord, shiftKey: boolean) => void;
  toggleChecked: (row: CheckRecord, checked: boolean) => void | Promise<void>;
  saveInlineTitle: (row: CheckRecord, value: string) => void | Promise<void>;
  setInlineEditingId: (id: string) => void;
  toggleAddingChild: (rowId: string) => void;
  toggleCollapsed: (nodeKey: string) => void;
  openContextMenuFromPointer: (row: CheckRecord, event: React.MouseEvent<HTMLElement>) => void;
  openContextMenuFromKeyboard: (row: CheckRecord, target: HTMLElement) => void;
  handleDragOver: (target: string) => (event: DragEvent<HTMLDivElement>) => void;
  handleDropBefore: (row: CheckRecord, movedId: string) => void;
  handleDropInside: (row: CheckRecord, movedId: string, childCount: number) => void;
  handleDragStart: (rowId: string, isEditing: boolean, event: DragEvent<HTMLDivElement>) => void;
  handleDragEnd: () => void;
};

export type CheckTreeRowProps = {
  row: CheckRecord;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  isSelected: boolean;
  isDropInside: boolean;
  isEditing: boolean;
  showAddChild: boolean;
  dropBeforeActive: boolean;
  linkedCasesLabel: string;
  linkedCasesTitle: string;
  childCount: number;
  statusMarkerClass?: string;
  statusMarkerGlyph?: string | number;
  statusLabel: string;
  actionsRef: MutableRefObject<CheckTreeRowActions>;
};

function CheckTreeRowComponent({
  row,
  depth,
  hasChildren,
  isCollapsed,
  isSelected,
  isDropInside,
  isEditing,
  showAddChild,
  dropBeforeActive,
  linkedCasesLabel,
  linkedCasesTitle,
  childCount,
  statusMarkerClass,
  statusMarkerGlyph,
  statusLabel,
  actionsRef,
}: CheckTreeRowProps) {
  return (
    <>
      <DropZone
        active={dropBeforeActive}
        compact
        onDragOver={(event) => actionsRef.current.handleDragOver(`before:${row.id}`)(event)}
        onDrop={(event) => {
          event.preventDefault();
          actionsRef.current.handleDropBefore(row, event.dataTransfer.getData("text/plain"));
        }}
      />
      <div
        className={`tree-node ${depth ? "has-parent" : ""} ${isSelected ? "is-selected" : ""} ${isDropInside ? "is-drop-inside" : ""}`}
        onClick={(event) => actionsRef.current.selectRow(row, event.shiftKey)}
        onContextMenu={(event) => actionsRef.current.openContextMenuFromPointer(row, event)}
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
            event.preventDefault();
            actionsRef.current.openContextMenuFromKeyboard(row, event.currentTarget);
          }
        }}
        data-selected={isSelected ? "true" : "false"}
        draggable={!isEditing}
        onDragStart={(event) => actionsRef.current.handleDragStart(row.id, isEditing, event)}
        onDragEnd={() => actionsRef.current.handleDragEnd()}
        onDragOver={(event) => actionsRef.current.handleDragOver(`inside:${row.id}`)(event)}
        onDrop={(event) => {
          event.preventDefault();
          actionsRef.current.handleDropInside(row, event.dataTransfer.getData("text/plain"), childCount);
        }}
      >
        <TreeExpander
          hasChildren={hasChildren}
          isCollapsed={isCollapsed}
          onToggle={() => actionsRef.current.toggleCollapsed(row.id)}
        />
        {row.is_group ? (
          <span className="tree-checkbox-placeholder" aria-hidden="true" />
        ) : (
          <label className="tree-checkbox" onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              checked={Boolean(row.is_checked)}
              onChange={(event) => { void actionsRef.current.toggleChecked(row, event.target.checked); }}
              onClick={(event) => event.stopPropagation()}
            />
          </label>
        )}
        <div className="tree-node-main">
          <div className="tree-title-row">
            <button
              className={`tree-add-icon ${showAddChild ? "is-visible" : ""}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                actionsRef.current.toggleAddingChild(row.id);
              }}
              title="Add child"
              aria-label="Add child"
            >
              ⊕
            </button>
            {!row.is_group && statusMarkerClass ? (
              <span className={`tree-problem-marker tree-status-icon ${statusMarkerClass}`} title={statusLabel} aria-label={statusLabel}>
                {statusMarkerGlyph}
              </span>
            ) : null}
            {row.is_group ? (
              isEditing ? (
                <InlineEditableText
                  editing
                  selectOnFocus={false}
                  value={row.title}
                  onSave={(value) => { void actionsRef.current.saveInlineTitle(row, value); }}
                  onCancel={() => actionsRef.current.setInlineEditingId("")}
                  className="tree-inline-editor"
                />
              ) : (
                <span className={`tree-group-title-button ${isSelected ? "is-active" : ""}`} onDoubleClick={() => actionsRef.current.setInlineEditingId(row.id)}>
                  {row.title}
                </span>
              )
            ) : (
              isEditing ? (
                <InlineEditableText
                  editing
                  selectOnFocus={false}
                  value={row.title}
                  onSave={(value) => { void actionsRef.current.saveInlineTitle(row, value); }}
                  onCancel={() => actionsRef.current.setInlineEditingId("")}
                  className="tree-inline-editor"
                />
              ) : (
                <span className={`link-button ${isSelected ? "is-active" : ""}`} onDoubleClick={() => actionsRef.current.setInlineEditingId(row.id)}>
                  {row.title}
                </span>
              )
            )}
            {linkedCasesLabel ? (
              <span className="tree-linked-cases" title={linkedCasesTitle}>
                Cases: {linkedCasesLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function propsEqual(prev: CheckTreeRowProps, next: CheckTreeRowProps) {
  return (
    prev.row.id === next.row.id
    && prev.row.title === next.row.title
    && prev.row.status === next.row.status
    && prev.row.is_checked === next.row.is_checked
    && prev.row.is_group === next.row.is_group
    && prev.depth === next.depth
    && prev.hasChildren === next.hasChildren
    && prev.isCollapsed === next.isCollapsed
    && prev.isSelected === next.isSelected
    && prev.isDropInside === next.isDropInside
    && prev.isEditing === next.isEditing
    && prev.showAddChild === next.showAddChild
    && prev.dropBeforeActive === next.dropBeforeActive
    && prev.linkedCasesLabel === next.linkedCasesLabel
    && prev.linkedCasesTitle === next.linkedCasesTitle
    && prev.childCount === next.childCount
    && prev.statusMarkerClass === next.statusMarkerClass
    && prev.statusMarkerGlyph === next.statusMarkerGlyph
    && prev.statusLabel === next.statusLabel
    && prev.actionsRef === next.actionsRef
  );
}

export const CheckTreeRow = memo(CheckTreeRowComponent, propsEqual);
