import {useEffect, useState} from 'react';

import {LegacyDesktopFrame} from './legacy/LegacyDesktopFrame';
import {WorkspaceApp} from './workspace/WorkspaceApp';

export function App() {
    const [workspaceOpen, setWorkspaceOpen] = useState(false);
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin === window.location.origin && event.data?.type === 'browser-os:open-workspace') {
                setWorkspaceOpen(true);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);
    return (
        <main className="typedShell" aria-label="Browser OS workspace">
            {workspaceOpen ?
                <WorkspaceApp onClose={() => setWorkspaceOpen(false)} /> :
                <LegacyDesktopFrame />}
        </main>
    );
}
