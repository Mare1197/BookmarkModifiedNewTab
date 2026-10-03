import {useState} from 'react';
import type {RelationshipRecord, WorkspaceEntity} from '../../workspace/types';
import {createSourcedMemory, linkBrainObjects, setMemoryPolicy} from './brainRepository';
import {objectConnections} from './brainSelectors';
import type {BrainMode} from './BrainWorkspace';

interface Props {
    entity: WorkspaceEntity;
    entities: WorkspaceEntity[];
    relationships: RelationshipRecord[];
    onSelect: (entityId: string) => void;
    onCanvas: (entityId: string) => Promise<void>;
    onGraph: (entityId: string) => void;
    onAI: () => void;
    onEditor?: () => void;
    onBrain: (mode?: BrainMode) => void;
    onRefresh: () => Promise<void>;
    onStatus: (message: string) => void;
}

// Mounted with key=entity.id: drafts and pending actions cannot leak between selections.
export function BrainObjectTools({entity, entities, relationships, onSelect, onCanvas, onGraph,
    onAI, onEditor, onBrain, onRefresh, onStatus}: Props) {
    const [targetId, setTargetId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [linkType, setLinkType] = useState('related');
    const [memoryTitle, setMemoryTitle] = useState('');
    const [memoryBody, setMemoryBody] = useState('');
    const [busy, setBusy] = useState(false);
    const connected = objectConnections(entity.id, relationships);
    const byId = new Map(entities.map(item => [item.id, item]));
    const act = async (action: () => Promise<void>, success: string) => {
        if (busy) return;
        setBusy(true);
        try { await action(); await onRefresh(); onStatus(success); }
        catch (error) { onStatus(error instanceof Error ? error.message : 'Object action failed.'); }
        finally { setBusy(false); }
    };
    const group = (label: string, links: RelationshipRecord[]) => <details>
        <summary>{label} ({links.length})</summary><div className="brainConnections">
            {links.map(link => {
                const other = byId.get(link.fromEntityId === entity.id ? link.toEntityId : link.fromEntityId);
                return <p key={link.id}><button disabled={!other} onClick={() => other && onSelect(other.id)}>
                    {other?.title || 'Unavailable object'}</button><small>{link.type} · {link.origin}</small></p>;
            })}
        </div>
    </details>;
    const pending = relationships.filter(link => !link.confirmed && link.reviewStatus !== 'rejected' &&
        (link.fromEntityId === entity.id || link.toEntityId === entity.id));
    return <section className="brainObjectTools" aria-label="Connected object">
        <h3>Connected object</h3>
        <button disabled={busy} onClick={() => void act(() => onCanvas(entity.id), 'Opened in Canvas')}>Open in Canvas</button>
        <button onClick={() => onGraph(entity.id)}>Show in Graph</button>
        <button onClick={() => onBrain('Table')}>Open shared views</button>
        <button onClick={() => onBrain('Tiles')}>Show in Tiles</button>
        <button onClick={() => onBrain('Kanban')}>Show in Kanban</button>
        <button onClick={onAI}>Ask AI</button>
        {onEditor && <button onClick={onEditor}>Open in workspace</button>}
        {entity.source?.url && <a href={entity.source.url} target="_blank" rel="noreferrer">Open original</a>}
        <p><small>{entity.source ? entity.source.provider + ' · ' + entity.source.externalId : 'Local / browser source'}</small></p>
        <label>Add to Project<select value={projectId} onChange={event => setProjectId(event.target.value)}>
            <option value="">Choose project</option>{entities.filter(item => item.type === 'project' && item.id !== entity.id)
                .map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select></label>
        <button disabled={busy || !projectId} onClick={() => void act(async () => {
            await linkBrainObjects(entity.id, projectId, 'project-member'); setProjectId('');
        }, 'Project membership added')}>Add to project</button>
        <details><summary>Connect to…</summary>
            <label>Target object<select value={targetId} onChange={event => setTargetId(event.target.value)}>
                <option value="">Choose object</option>{entities.filter(item => item.id !== entity.id)
                    .map(item => <option key={item.id} value={item.id}>{item.title} ({item.type})</option>)}
            </select></label>
            <label>Link kind<select value={linkType} onChange={event => setLinkType(event.target.value)}>
                <option value="related">Related to</option><option value="mentions">Mentions</option>
                <option value="derived-from">Derived from</option>
                <option value="contradicts">Contradicts (requires memory review)</option>
            </select></label>
            <button disabled={busy || !targetId} onClick={() => void act(async () => {
                await linkBrainObjects(entity.id, targetId, linkType); setTargetId('');
            }, 'Objects connected')}>Connect objects</button>
        </details>
        {group('Related to', connected.related)}
        {group('Links to', connected.outgoing)}
        {group('Linked from', connected.incoming)}
        {group('Mentioned in', connected.mentionedIn)}
        {group('Source objects', connected.sources)}
        {group('Projects', connected.projects)}
        {entity.type === 'memory' && <fieldset disabled={busy}><legend>Memory controls</legend>
            <p>Edit the statement with the object's notes editor. Forgetting retains an audit record but excludes it from every AI request.</p>
            <p>Status: {entity.memory?.status || 'active'} · Reviewed: {entity.memory?.reviewedAt ? new Date(entity.memory.reviewedAt).toLocaleDateString() : 'Not recorded'}</p>
            <label><input type="checkbox" checked={entity.memory?.excludedFromAI || false}
                onChange={event => void act(() => setMemoryPolicy(entity.id, {excludedFromAI: event.target.checked}), 'AI exclusion updated')} /> Exclude from AI</label>
            <label>Recall scope<select value={entity.memory?.scope || 'project'} onChange={event => void act(() =>
                setMemoryPolicy(entity.id, {scope: event.target.value as 'project' | 'private'}), 'Recall scope updated')}>
                <option value="project">This project's related objects</option><option value="private">Only when explicitly selected</option>
            </select></label>
            <label>Review by<input type="date" value={entity.memory?.reviewBy ? new Date(entity.memory.reviewBy).toISOString().slice(0, 10) : ''}
                onChange={event => void act(() => setMemoryPolicy(entity.id, {reviewBy: event.target.value ? Date.parse(event.target.value) : undefined}), 'Review date updated')} /></label>
            <button onClick={() => void act(() => setMemoryPolicy(entity.id, {reviewedAt: Date.now(), reviewBy: undefined}), 'Memory reviewed')}>Mark reviewed</button>
            <button onClick={() => void act(() => setMemoryPolicy(entity.id, {status: entity.memory?.status === 'forgotten' ? 'active' : 'forgotten'}), 'Memory status updated')}>
                {entity.memory?.status === 'forgotten' ? 'Restore memory' : 'Forget memory'}</button>
            {connected.related.some(link => link.type === 'contradicts') && <p role="alert">Conflicting evidence linked. This memory is excluded from AI until the conflict is resolved.</p>}
        </fieldset>}
        {pending.length > 0 && <p>{pending.length} unconfirmed suggestions. <button onClick={() => onBrain('AI Inbox')}>Review in AI Inbox</button></p>}
        <details><summary>Object reference</summary><code>{'[[' + entity.id + ']]'}</code>
            <p>Paste this reference in another object's notes to create an automatic, explicit backlink when saved.</p></details>
        <details><summary>Save sourced memory</summary>
            <p>This stores your reviewed statement with a link to this object. It does not verify the statement or send it to a model.</p>
            <form onSubmit={event => {
                event.preventDefault();
                void act(async () => {
                    await createSourcedMemory(entity.id, memoryTitle, memoryBody); setMemoryTitle(''); setMemoryBody('');
                }, 'Memory saved with source and confirmed project scope');
            }}>
                <label>Memory title<input required value={memoryTitle} onChange={event => setMemoryTitle(event.target.value)} /></label>
                <label>Reviewed memory<textarea required value={memoryBody} onChange={event => setMemoryBody(event.target.value)} /></label>
                <button disabled={busy || !memoryTitle.trim() || !memoryBody.trim()}>Save memory</button>
            </form>
        </details>
    </section>;
}
