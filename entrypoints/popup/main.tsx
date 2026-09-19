import React, {useState} from 'react';
import ReactDOM from 'react-dom/client';

import {
    captureVisibleTabAsset,
    ensureWorkspace
} from '../../src/react/workspace/workspaceRepository';
import './style.css';

function CapturePopup() {
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const capture = async () => {
        setBusy(true);
        setStatus('Capturing visible tab…');
        try {
            const board = await ensureWorkspace();
            await captureVisibleTabAsset(board.id);
            setStatus('Screenshot saved to Assets and ' + board.name + '.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Capture failed.');
        } finally {
            setBusy(false);
        }
    };
    return (
        <main>
            <h1>Browser OS capture</h1>
            <p>Save the visible tab to your local workspace. Nothing is uploaded.</p>
            <button type="button" disabled={busy} onClick={() => void capture()}>
                {busy ? 'Capturing…' : 'Capture visible tab'}
            </button>
            <p className="status" role="status">{status}</p>
        </main>
    );
}

const root = document.getElementById('root');
if (!root) {
    throw new Error('Capture popup root was not found.');
}
ReactDOM.createRoot(root).render(
    <React.StrictMode>
        <CapturePopup />
    </React.StrictMode>
);
