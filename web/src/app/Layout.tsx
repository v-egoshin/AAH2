import { NavLink, Outlet } from 'react-router-dom';

const links = [
  ['/', 'Dashboard'],
  ['/assets', 'Assets'],
  ['/imports', 'Import History'],
  ['/candidates', 'Candidate Inbox'],
  ['/objects', 'Objects & Marks'],
  ['/cases', 'Cases'],
  ['/checks', 'Checks'],
  ['/findings', 'Findings'],
  ['/coverage', 'Coverage'],
];

export function Layout() {
  return <div className='app-shell'><aside className='sidebar'><h2>AppSec Workbench</h2>{links.map(([to,label]) => <NavLink key={to} to={to} end={to==='/'}>{label}</NavLink>)}</aside><section className='content'><Outlet/></section></div>;
}
