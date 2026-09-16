import React from 'react';
import {createRoot} from 'react-dom/client';
import {YoutubeRecordingSettings} from '../../src/admin/YoutubeRecordingSettings';
import '../../src/styles.css';
createRoot(document.getElementById('root')!).render(<main style={{maxWidth:400,padding:16}}><YoutubeRecordingSettings tournamentId="00000000-0000-0000-0000-000000000001" url="https://www.youtube.com/watch?v=abcdefghijk"/></main>);
