import {useEffect, useRef, useState} from 'react';

export function BlockSuitePrototype({entityId}: {entityId?: string}) {
    const host = useRef<HTMLDivElement>(null);
    const [mode, setMode] = useState<'document' | 'edgeless'>('document');
    const [status, setStatus] = useState('Loading local editor…');
    useEffect(() => {
        if (!entityId || !host.current) return;
        let cancelled = false;
        let dispose: (() => void) | undefined;
        const container = host.current;
        setStatus('Loading local editor…');
        import('./blocksuiteAdapter').then(({mountBrainEditor}) => {
            if (cancelled) return;
            dispose = mountBrainEditor(container, entityId, mode);
            setStatus('Reference-only prototype · local edits save to Brain');
        }).catch(error => { if (!cancelled) setStatus('Editor could not load: ' + String(error)); });
        return () => { cancelled = true; dispose?.(); };
    }, [entityId, mode]);
    return <section aria-label="BlockSuite reference prototype" style={{height: '100%', overflow: 'auto', padding: 16}}>
        <h2>BlockSuite prototype</h2>
        <p>Real BlockSuite document and edgeless renderers, one canonical object. This bounded prototype does not enable native block creation, attachment import or collaboration. Use the existing Canvas for full board layout.</p>
        <button aria-pressed={mode === 'document'} onClick={() => setMode('document')}>Document</button>
        <button aria-pressed={mode === 'edgeless'} onClick={() => setMode('edgeless')}>Edgeless</button>
        <p role="status">{entityId ? status : 'Select an object to open a reference.'}</p>
        <div ref={host} style={{height: 560, position: 'relative', overflow: 'auto', background: 'white', color: '#17212c'}} />
    </section>;
}
