import { FormEvent, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useWorkbench } from "./workbench";

const NAV_ITEMS = [
  ["/", "Dashboard"],
  ["/assets", "Assets"],
  ["/imports", "Imports"],
  ["/candidates", "Candidates"],
  ["/objects", "Objects"],
  ["/marks", "Marks"],
  ["/checks", "Checks"],
  ["/cases", "Cases"],
  ["/findings", "Findings"],
  ["/relations", "Relations"],
  ["/coverage", "Coverage"],
  ["/review-context", "Review Context"],
  ["/settings", "Settings"],
] as const;

export function Layout() {
  const {
    api,
    baseUrl,
    setBaseUrl,
    assets,
    selectedAssetId,
    setSelectedAssetId,
    assessments,
    selectedAssessmentId,
    setSelectedAssessmentId,
    refreshAssessments,
  } = useWorkbench();
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      if (!title.trim()) {
        throw new Error("Title is required");
      }
      await api.createAssessment({ title: title.trim() });
      setTitle("");
      await refreshAssessments();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-row">
          <h2>AppSec Workbench</h2>
          <span className="topbar-note">Operator console</span>
        </div>

        <nav className="top-nav">
          {NAV_ITEMS.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>
          ))}
        </nav>

        <div className="control-row">
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="API base URL" />
          <select value={selectedAssessmentId} onChange={(event) => setSelectedAssessmentId(event.target.value)}>
            <option value="">Select assessment</option>
            {assessments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <select value={selectedAssetId} onChange={(event) => setSelectedAssetId(event.target.value)} disabled={!assets.length}>
            <option value="">{assets.length ? "Select asset" : "No assets"}</option>
            {assets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="btn btn-subtle" onClick={() => void refreshAssessments()}>Refresh</button>
          <form className="inline-create" onSubmit={onCreate}>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New assessment" />
            <button className="btn btn-accent" type="submit">Create</button>
          </form>
        </div>
        {error ? <div className="error-text topbar-error">{error}</div> : null}
      </header>

      <section className="content">
        <Outlet />
      </section>
    </div>
  );
}
