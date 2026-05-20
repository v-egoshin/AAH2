import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './Layout';
import { DashboardPage } from '../pages/DashboardPage';
import { CandidateInboxPage } from '../pages/CandidateInboxPage';
import { CoveragePage } from '../pages/CoveragePage';
import { CasesPage } from '../pages/CasesPage';
import { FindingsPage } from '../pages/FindingsPage';
import { AssetsPage } from '../pages/AssetsPage';
import { ImportsPage } from '../pages/ImportsPage';
import { ObjectsPage } from '../pages/ObjectsPage';
import { ChecksPage } from '../pages/ChecksPage';

export const router = createBrowserRouter([{ path:'/', element:<Layout/>, children:[
  {index:true, element:<DashboardPage/>},
  {path:'assets', element:<AssetsPage/>},
  {path:'imports', element:<ImportsPage/>},
  {path:'candidates', element:<CandidateInboxPage/>},
  {path:'objects', element:<ObjectsPage/>},
  {path:'cases', element:<CasesPage/>},
  {path:'checks', element:<ChecksPage/>},
  {path:'findings', element:<FindingsPage/>},
  {path:'coverage', element:<CoveragePage/>},
]}]);
