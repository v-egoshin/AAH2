import { createContext, useContext } from "react";

/** Maps mark kind keys (uppercased) → accent color `#rrggbb` for gutter/list icons */
export const MarkKindAccentContext = createContext<Record<string, string>>({});

export function useMarkKindAccentByKind(): Record<string, string> {
  return useContext(MarkKindAccentContext);
}
