import React from 'react';
import ReactDOM from 'react-dom/client';
import '@xyflow/react/dist/style.css';

import {App} from '../../src/react/App';
import '../../src/react/shell.css';
import '../../src/react/workspace/workspace.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('New-tab root element was not found.');
}

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
