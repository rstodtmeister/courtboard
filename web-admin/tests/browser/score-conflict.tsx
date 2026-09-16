import React from 'react';
import { createRoot } from 'react-dom/client';
import { ScoreEntryApp } from '../../src/ScoreEntryApp';
import '../../src/styles.css';
createRoot(document.getElementById('root')!).render(<ScoreEntryApp token="conflict-test" />);
