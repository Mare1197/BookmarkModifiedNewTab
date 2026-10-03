import {useRef, useState} from 'react';
import {parseChatExport} from './chatExportAdapters';
import type {PreparedConversation} from './chatExportAdapters';
import {applyConversationImport, previewConversationImport} from './chatImportService';
import type {ConflictPolicy, ConversationImportPreview} from './chatImportService';

interface Props {
    onImported: () => Promise<void>;
    onStatus: (message: string) => void;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Conversation import failed.';
}

export function ConversationImportPanel({onImported, onStatus}: Props) {
    const [json, setJson] = useState('');
    const [prepared, setPrepared] = useState<PreparedConversation[]>([]);
    const [preview, setPreview] = useState<ConversationImportPreview | null>(null);
    const [policy, setPolicy] = useState<ConflictPolicy>('preserve-local');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef(false);

    const invalidatePreview = () => {
        setPrepared([]);
        setPreview(null);
        setError('');
    };

    const readFile = async (file: File | undefined) => {
        if (!file || pending.current) return;
        pending.current = true;
        setBusy(true);
        setError('');
        try {
            const contents = await file.text();
            setJson(contents);
            setPrepared([]);
            setPreview(null);
            onStatus('Loaded ' + file.name + '. Review the JSON, then preview the import.');
        } catch (caught) {
            const message = errorMessage(caught);
            setError(message);
            onStatus(message);
        } finally {
            pending.current = false;
            setBusy(false);
        }
    };

    const buildPreview = async () => {
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        setError('');
        try {
            if (!json.trim()) throw new Error('Paste or choose a conversation export first.');
            const conversations = parseChatExport(JSON.parse(json) as unknown);
            if (!conversations.length) throw new Error('The export contains no conversations.');
            const nextPreview = await previewConversationImport(conversations);
            setPrepared(conversations);
            setPreview(nextPreview);
            onStatus('Import preview ready. No workspace data was changed.');
        } catch (caught) {
            const message = errorMessage(caught);
            setPrepared([]);
            setPreview(null);
            setError(message);
            onStatus(message);
        } finally {
            pending.current = false;
            setBusy(false);
        }
    };

    const applyImport = async () => {
        if (pending.current || !preview || !prepared.length) return;
        pending.current = true;
        setBusy(true);
        setError('');
        try {
            const result = await applyConversationImport(prepared, policy);
            await onImported();
            onStatus('Imported ' + result.imported + ' conversation' + (result.imported === 1 ? '' : 's') + '.');
            setPrepared([]);
            setPreview(null);
        } catch (caught) {
            const message = errorMessage(caught);
            setError(message);
            onStatus(message);
        } finally {
            pending.current = false;
            setBusy(false);
        }
    };

    return <section className="conversationImportPanel" aria-label="Conversation export import">
        <h3>Import conversation exports</h3>
        <p>Local JSON only. No provider account access or network calls are used.</p>
        <label>Conversation export file
            <input type="file" accept=".json,application/json" disabled={busy}
                onChange={event => void readFile(event.currentTarget.files?.[0])} />
        </label>
        <label>Paste conversation export JSON
            <textarea rows={7} value={json} disabled={busy} onChange={event => {
                setJson(event.target.value);
                invalidatePreview();
            }} />
        </label>
        <button type="button" disabled={busy || !json.trim()} onClick={() => void buildPreview()}>Preview import</button>
        {error ? <p role="alert">{error}</p> : null}
        {preview ? <div aria-live="polite">
            <p>{preview.conversationCount} conversations · {preview.newCount} new · {preview.updatedCount} updated · {' '}
                {preview.unchangedCount} unchanged · {preview.conflictCount} local-edit conflicts</p>
            {preview.warnings.length ? <details open><summary>Warnings ({preview.warnings.length})</summary>
                <ul>{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
            </details> : null}
        </div> : null}
        <label>Conflict policy
            <select value={policy} disabled={busy} onChange={event => setPolicy(event.target.value as ConflictPolicy)}>
                <option value="preserve-local">Preserve local changes (recommended)</option>
                <option value="take-source">Take source values</option>
            </select>
        </label>
        <button type="button" disabled={busy || !preview || !prepared.length}
            onClick={() => void applyImport()}>Import conversations</button>
    </section>;
}
