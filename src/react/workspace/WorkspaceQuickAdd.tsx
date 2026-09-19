import {useEffect, useMemo, useRef, useState, type FormEvent} from 'react';

import type {BoardRecord, WorkspaceEntity, WorkspaceFolder} from '../../workspace/types';
import {prepareClipFromRecentTab, quickAdd, type QuickAddInput} from './workspaceRepository';

export interface WorkspaceCommand {
    id: string;
    label: string;
    detail: string;
    run: () => Promise<void> | void;
}

interface WorkspaceQuickAddProps {
    activeBoardId: string;
    boards: BoardRecord[];
    commands: WorkspaceCommand[];
    folders: WorkspaceFolder[];
    initialKind?: QuickAddInput['kind'];
    onClose: () => void;
    onSaved: (entity: WorkspaceEntity) => Promise<void>;
    open: boolean;
    selectedEntity?: WorkspaceEntity;
}

const labels: Record<QuickAddInput['kind'], string> = {
    web: 'Web link',
    note: 'Note',
    clip: 'Clip',
    task: 'Task'
};

function toTimestamp(value: string): number | undefined {
    if (!value) {
        return undefined;
    }
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function WorkspaceQuickAdd({
    activeBoardId,
    boards,
    commands,
    folders,
    initialKind = 'web',
    onClose,
    onSaved,
    open,
    selectedEntity
}: WorkspaceQuickAddProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLElement>(null);
    const [mode, setMode] = useState<'capture' | 'commands'>('capture');
    const [kind, setKind] = useState<QuickAddInput['kind']>(initialKind);
    const [query, setQuery] = useState('');
    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [inbox, setInbox] = useState(true);
    const [boardIds, setBoardIds] = useState<string[]>(activeBoardId ? [activeBoardId] : []);
    const [folderIds, setFolderIds] = useState<string[]>([]);
    const [linkSelected, setLinkSelected] = useState(false);
    const [dueAt, setDueAt] = useState('');
    const [reminderAt, setReminderAt] = useState('');
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }
        setMode('capture');
        setKind(initialKind);
        setQuery('');
        setUrl('');
        setTitle('');
        setBody('');
        setInbox(true);
        setBoardIds(activeBoardId ? [activeBoardId] : []);
        setFolderIds([]);
        setLinkSelected(false);
        setDueAt('');
        setReminderAt('');
        setStatus('');
    }, [activeBoardId, initialKind, open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const previousFocus = document.activeElement;
        inputRef.current?.focus();
        return () => {
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
                previousFocus.focus();
            }
        };
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (!busy) {
                    onClose();
                }
            }
            if (event.key === 'Tab') {
                const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'
                ) || []).filter(control => control.getClientRects().length > 0);
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && (document.activeElement === first ||
                    !dialogRef.current?.contains(document.activeElement))) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && (document.activeElement === last ||
                    !dialogRef.current?.contains(document.activeElement))) {
                    event.preventDefault();
                    first?.focus();
                }
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [busy, onClose, open]);

    const filteredCommands = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase();
        return commands.filter(command => !normalized ||
            (command.label + ' ' + command.detail).toLocaleLowerCase().includes(normalized));
    }, [commands, query]);
    const destinationCount = boardIds.length + folderIds.length + (inbox ? 1 : 0) + (linkSelected ? 1 : 0);

    if (!open) {
        return null;
    }

    const toggle = (value: string, current: string[], update: (next: string[]) => void) => {
        update(current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
    };
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) {
            return;
        }
        if (destinationCount === 0) {
            setStatus('Choose at least one destination.');
            return;
        }
        setBusy(true);
        setStatus('');
        try {
            const entity = await quickAdd({
                kind,
                title,
                url,
                body,
                boardIds,
                folderIds,
                inbox,
                linkEntityId: linkSelected ? selectedEntity?.id : undefined,
                dueAt: toTimestamp(dueAt),
                reminderAt: toTimestamp(reminderAt)
            });
            await onSaved(entity);
            onClose();
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Quick Add failed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="workspaceCommandBackdrop" role="presentation" onMouseDown={event => {
            if (!busy && event.target === event.currentTarget) {
                onClose();
            }
        }}>
            <section ref={dialogRef} className="workspaceCommand" role="dialog" aria-modal="true" aria-label="Quick Add or run a command">
                <header className="workspaceCommand__header">
                    <input
                        ref={inputRef}
                        value={query}
                        aria-label="Quick Add or run a command"
                        placeholder="Quick Add or run a command"
                        onChange={event => setQuery(event.target.value)}
                    />
                    <kbd>Ctrl K</kbd>
                    <button type="button" aria-label="Close Quick Add" disabled={busy} onClick={onClose}>×</button>
                </header>
                <nav className="workspaceCommand__modes" aria-label="Command palette modes">
                    <button type="button" className={mode === 'capture' ? 'selected' : ''} onClick={() => setMode('capture')}>
                        Capture
                    </button>
                    <button type="button" className={mode === 'commands' ? 'selected' : ''} onClick={() => setMode('commands')}>
                        Commands
                    </button>
                </nav>
                {mode === 'commands' ? (
                    <div className="workspaceCommand__commands">
                        {filteredCommands.map(command => (
                            <button type="button" key={command.id} disabled={busy} onClick={() => {
                                setBusy(true);
                                Promise.resolve().then(command.run).then(onClose).catch(error => {
                                    setStatus(error instanceof Error ? error.message : 'Command failed.');
                                }).finally(() => setBusy(false));
                            }}>
                                <strong>{command.label}</strong>
                                <span>{command.detail}</span>
                            </button>
                        ))}
                        {filteredCommands.length === 0 && <p>No matching commands.</p>}
                    </div>
                ) : (
                    <form onSubmit={event => void submit(event)}>
                        <div className="workspaceCommand__types" aria-label="Capture type">
                            {(Object.keys(labels) as QuickAddInput['kind'][]).map(item => (
                                <button
                                    type="button"
                                    key={item}
                                    className={kind === item ? 'selected' : ''}
                                    onClick={() => setKind(item)}
                                >
                                    {labels[item]}
                                </button>
                            ))}
                        </div>
                        <div className="workspaceCommand__form">
                            {(kind === 'web' || kind === 'clip') && (
                                <label>
                                    URL
                                    <input value={url} placeholder="https://example.com/article" onChange={event => setUrl(event.target.value)} />
                                </label>
                            )}
                            <label>
                                Title {kind === 'web' ? '(optional)' : ''}
                                <input value={title} placeholder={kind === 'task' ? 'What needs to be done?' : 'Optional title'} onChange={event => setTitle(event.target.value)} />
                            </label>
                            {kind !== 'web' && (
                                <label>
                                    {kind === 'clip' ? 'Clipped text' : kind === 'task' ? 'Task notes' : 'Note'}
                                    <textarea value={body} rows={kind === 'clip' ? 6 : 4} placeholder="Add text or context…" onChange={event => setBody(event.target.value)} />
                                </label>
                            )}
                            {kind === 'clip' && (
                                <button
                                    type="button"
                                    className="workspaceCommand__prepare"
                                    disabled={busy}
                                    onClick={() => {
                                        setBusy(true);
                                        setStatus('Requesting access to the recent page…');
                                        void prepareClipFromRecentTab().then(clip => {
                                            setUrl(clip.url);
                                            setTitle(clip.title);
                                            setBody(clip.body);
                                            setStatus('Page text captured locally. Review it before adding.');
                                        }).catch(error => {
                                            setStatus(error instanceof Error ? error.message : 'Page clip failed.');
                                        }).finally(() => setBusy(false));
                                    }}
                                >
                                    Clip recent page
                                </button>
                            )}
                            {kind === 'task' && (
                                <div className="workspaceCommand__dates">
                                    <label>Due date<input type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
                                    <label>Reminder<input type="datetime-local" value={reminderAt} onChange={event => setReminderAt(event.target.value)} /></label>
                                </div>
                            )}
                        </div>
                        <fieldset className="workspaceCommand__destinations">
                            <legend>Add to</legend>
                            <label><input type="checkbox" checked={inbox} onChange={event => setInbox(event.target.checked)} /> Quick Inbox</label>
                            {boards.map(board => (
                                <label key={board.id}>
                                    <input type="checkbox" checked={boardIds.includes(board.id)} onChange={() => toggle(board.id, boardIds, setBoardIds)} />
                                    {board.name}<small>Board</small>
                                </label>
                            ))}
                            {folders.map(folder => (
                                <label key={folder.id}>
                                    <input type="checkbox" checked={folderIds.includes(folder.id)} onChange={() => toggle(folder.id, folderIds, setFolderIds)} />
                                    {folder.title}<small>Folder</small>
                                </label>
                            ))}
                            {selectedEntity && (
                                <label>
                                    <input type="checkbox" checked={linkSelected} onChange={event => setLinkSelected(event.target.checked)} />
                                    Link to “{selectedEntity.title}”<small>Relationship</small>
                                </label>
                            )}
                        </fieldset>
                        <footer className="workspaceCommand__footer">
                            <span role="status">{status}</span>
                            <button type="submit" className="primaryButton" disabled={busy || destinationCount === 0}>
                                {busy ? 'Adding…' : 'Add to ' + destinationCount + ' destination' + (destinationCount === 1 ? '' : 's')}
                            </button>
                        </footer>
                    </form>
                )}
                {mode === 'commands' && <p className="workspaceCommand__status" role="status">{status}</p>}
            </section>
        </div>
    );
}
