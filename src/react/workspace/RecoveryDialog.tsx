import {useEffect, useRef, useState} from 'react';
import type {DraftPreview, Target} from '../../workspace/recoveryTypes';
import {RecoveryPanel} from './RecoveryPanel';
import {HistoryPanel} from './HistoryPanel';
import {ConflictPanel} from './ConflictPanel';
import './recovery.css';
export function RecoveryDialog({target, onClose, onChanged}: {target?: Target; onClose: () => void; onChanged: () => Promise<void>}) {
    const dialog = useRef<HTMLDialogElement>(null), [preview, setPreview] = useState<DraftPreview>();
    useEffect(() => {const prior = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => prior?.focus();}, []);
    return <dialog ref={dialog} className="recoveryDialog" aria-label="Workspace recovery and history" onCancel={e => {e.preventDefault(); onClose();}}>
        <button className="recoveryClose" onClick={onClose}>Close recovery</button>
        {preview ? <ConflictPanel key={preview.record.id + ':' + preview.record.generation} preview={preview} onClose={() => setPreview(undefined)} onResolved={async () => {await onChanged(); setPreview(undefined);}} /> :
            target ? <HistoryPanel target={target} onRestored={onChanged} /> : <RecoveryPanel onOpenConflict={setPreview} onChanged={onChanged} />}
    </dialog>;
}
