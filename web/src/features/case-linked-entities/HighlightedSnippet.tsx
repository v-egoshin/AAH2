import { Fragment } from "react";

export function HighlightedSnippet({
  snippet,
  selectedText,
  highlightStartOffset,
  highlightEndOffset,
}: {
  snippet?: string;
  selectedText?: string;
  highlightStartOffset?: number;
  highlightEndOffset?: number;
}) {
  if (!snippet) {
    return null;
  }
  if (
    typeof highlightStartOffset === "number"
    && typeof highlightEndOffset === "number"
    && highlightStartOffset >= 0
    && highlightEndOffset > highlightStartOffset
    && highlightEndOffset <= snippet.length
  ) {
    const before = snippet.slice(0, highlightStartOffset);
    const highlighted = snippet.slice(highlightStartOffset, highlightEndOffset);
    const after = snippet.slice(highlightEndOffset);
    return (
      <pre className="code-block case-tree-code">
        <Fragment>{before}</Fragment>
        <mark>{highlighted}</mark>
        <Fragment>{after}</Fragment>
      </pre>
    );
  }
  if (!selectedText) {
    return <pre className="code-block case-tree-code">{snippet}</pre>;
  }
  const firstIndex = snippet.indexOf(selectedText);
  if (firstIndex < 0) {
    return <pre className="code-block case-tree-code">{snippet}</pre>;
  }
  const before = snippet.slice(0, firstIndex);
  const after = snippet.slice(firstIndex + selectedText.length);
  return (
    <pre className="code-block case-tree-code">
      <Fragment>{before}</Fragment>
      <mark>{selectedText}</mark>
      <Fragment>{after}</Fragment>
    </pre>
  );
}
