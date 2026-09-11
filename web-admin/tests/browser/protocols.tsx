// Standalone harness for real admin navigation; Playwright mocks backend requests.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminDashboard } from '../../src/admin/AdminDashboard';
import '../../src/styles.css';
createRoot(document.getElementById('root')!).render(<main><AdminDashboard session={{user:{email:'test@example.invalid',role:'admin'}}}/></main>);
