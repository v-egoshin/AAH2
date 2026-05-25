import type { ReactNode } from "react";
import type { CaseRecord, CheckRecord } from "../../api/client";
import { ContextMenuItem, ContextMenuSeparator, ContextMenuSubmenu } from "../../components/context-menu";
import { CHECK_STATUSES, statusMarker } from "./checks-tree-utils";

type MenuGlyphProps = { children: ReactNode; className?: string };

function MenuGlyph({ children, className }: MenuGlyphProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

function folderMenuIcon() {
  return (
    <MenuGlyph>
      <path d="M2.75 4.75h3l1.1 1.5h6.4v4.9a1.1 1.1 0 0 1-1.1 1.1H3.85a1.1 1.1 0 0 1-1.1-1.1z" />
      <path d="M2.75 5.4v-.6a1.1 1.1 0 0 1 1.1-1.1h2.05l1.05 1.3" />
    </MenuGlyph>
  );
}

function switchMenuIcon() {
  return (
    <MenuGlyph>
      <path d="M3 5.25h7.5" />
      <path d="m8.75 3.5 1.75 1.75L8.75 7" />
      <path d="M13 10.75H5.5" />
      <path d="m7.25 9 1.75 1.75L7.25 12.5" />
    </MenuGlyph>
  );
}

function checkMenuIcon() {
  return (
    <MenuGlyph>
      <path d="m4.25 8.2 2.1 2.1 5.4-5.1" />
    </MenuGlyph>
  );
}

function plusMenuIcon() {
  return (
    <MenuGlyph>
      <path d="M8 3.25v9.5" />
      <path d="M3.25 8h9.5" />
    </MenuGlyph>
  );
}

export type CheckRowContextMenuContentProps = {
  row: CheckRecord;
  linkedCases: CaseRecord[];
  selectedCheckIdsCount: number;
  isRowSelected: boolean;
  onEditDescription: () => void;
  onRename: () => void;
  onMapCases: () => void;
  onAddChildCheck: () => void;
  onBulkAdd: () => void;
  onDelete: () => void;
  onSetStatus: (status: string) => void;
  onToggleGroup: () => void;
  onAddChildGroup: () => void;
  onRenameGroup: () => void;
};

export function CheckRowContextMenuContent({
  row,
  linkedCases,
  selectedCheckIdsCount,
  isRowSelected,
  onEditDescription,
  onRename,
  onMapCases,
  onAddChildCheck,
  onBulkAdd,
  onDelete,
  onSetStatus,
  onToggleGroup,
  onAddChildGroup,
  onRenameGroup,
}: CheckRowContextMenuContentProps) {
  return (
    <>
      <ContextMenuItem onSelect={onEditDescription}>
        Edit
      </ContextMenuItem>
      <ContextMenuItem onSelect={onMapCases}>
        {linkedCases.length ? "Edit case mapping" : "Map to cases"}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem icon={plusMenuIcon()} onSelect={onAddChildCheck}>
        + Check
      </ContextMenuItem>
      <ContextMenuItem icon={plusMenuIcon()} onSelect={onAddChildGroup}>
        + Group
      </ContextMenuItem>
      <ContextMenuItem onSelect={onBulkAdd}>
        Add checks in bulk
      </ContextMenuItem>
      <ContextMenuSeparator />
      {!row.is_group ? (
        <>
          {CHECK_STATUSES.map((status) => (
            <ContextMenuItem key={status} active={row.status === status} onSelect={() => onSetStatus(status)}>
              <span className="context-menu-item-label">
                {statusMarker(status) ? (
                  <span className={`tree-problem-marker context-menu-status-marker ${statusMarker(status)?.className}`} aria-hidden="true">
                    {statusMarker(status)?.glyph}
                  </span>
                ) : (
                  <span className="context-menu-status-marker is-empty" aria-hidden="true" />
                )}
                <span>{status}</span>
              </span>
            </ContextMenuItem>
          ))}
          <ContextMenuSeparator />
        </>
      ) : null}
      <ContextMenuSubmenu label="Group" icon={folderMenuIcon()}>
        {row.is_group ? (
          <ContextMenuItem icon={checkMenuIcon()} closeOnSelect={false} onSelect={onRenameGroup}>
            Rename group
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem icon={row.is_group ? checkMenuIcon() : switchMenuIcon()} onSelect={onToggleGroup}>
          {row.is_group ? "Convert to check" : "Convert to group"}
        </ContextMenuItem>
      </ContextMenuSubmenu>
      <ContextMenuSeparator />
      <ContextMenuItem danger onSelect={onDelete}>
        {isRowSelected && selectedCheckIdsCount > 1 ? `Delete selected (${selectedCheckIdsCount})` : (row.is_group ? "Delete group" : "Delete check")}
      </ContextMenuItem>
    </>
  );
}
