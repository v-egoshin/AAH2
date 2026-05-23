import { ReactNode } from "react";

export function ResourceCard({ title, children, tone = "default", actions }: { title: string; children: ReactNode; tone?: "default" | "compact"; actions?: ReactNode }) {
  return (
    <section className={`card resource-card ${tone === "compact" ? "resource-card-compact" : ""}`}>
      <div className="resource-card-header">
        <h2>{title}</h2>
        {actions ? <div className="resource-card-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function ResourceTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>{row.map((cell, cellIdx) => <td key={cellIdx}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SplitWorkbench({ table, drawer }: { table: ReactNode; drawer: ReactNode }) {
  return (
    <div className="workbench-split">
      <div className="workbench-main">{table}</div>
      <aside className="workbench-drawer card">{drawer}</aside>
    </div>
  );
}
