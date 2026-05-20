import { NavLink, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>AppSec Workbench</h2>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/candidates">Candidate Inbox</NavLink>
        <NavLink to="/coverage">Coverage</NavLink>
        <NavLink to="/cases">Cases</NavLink>
        <NavLink to="/findings">Findings</NavLink>
      </aside>
      <section className="content">
        <Outlet />
      </section>
    </div>
  );
}
