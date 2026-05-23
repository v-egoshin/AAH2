export type TreeFilterNode<T> = T & {
  children?: Array<TreeFilterNode<T>>;
};

export type FlatTreeNode = {
  id: string;
  parentId?: string | null;
  sortOrder?: number | null;
};

export function filterTree<T extends { children?: T[] }>(
  nodes: T[],
  predicate: (node: T) => boolean,
): T[] {
  return nodes.reduce<T[]>((acc, node) => {
    const nextChildren = node.children ? filterTree(node.children, predicate) : [];
    if (predicate(node) || nextChildren.length) {
      acc.push({
        ...node,
        ...(node.children ? { children: nextChildren } : {}),
      });
    }
    return acc;
  }, []);
}

export function parseBulkChecksInput(input: string) {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildTreeFromFlatRows<T extends FlatTreeNode>(rows: T[]): Array<TreeFilterNode<T>> {
  const byParent = new Map<string | null, T[]>();
  const ids = new Set(rows.map((row) => row.id));
  for (const row of rows) {
    const parentId = row.parentId && ids.has(row.parentId) ? row.parentId : null;
    const bucket = byParent.get(parentId) ?? [];
    bucket.push(row);
    byParent.set(parentId, bucket);
  }
  for (const bucket of byParent.values()) {
    bucket.sort((left, right) => {
      const sortDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (sortDelta !== 0) {
        return sortDelta;
      }
      return left.id.localeCompare(right.id);
    });
  }
  const build = (parentId: string | null): Array<TreeFilterNode<T>> => (
    (byParent.get(parentId) ?? []).map((row) => ({
      ...row,
      children: build(row.id),
    }))
  );
  return build(null);
}

export function collectTreeIds<T extends { id: string; children?: T[] }>(nodes: T[]): Set<string> {
  const ids = new Set<string>();
  const visit = (items: T[]) => {
    for (const item of items) {
      ids.add(item.id);
      if (item.children?.length) {
        visit(item.children);
      }
    }
  };
  visit(nodes);
  return ids;
}
