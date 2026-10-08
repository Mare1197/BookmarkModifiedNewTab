import {useState} from 'react';
import {browser} from 'wxt/browser';
import {brainStatus, projectMembers, projectResumePreview} from './brainSelectors';
import {loadProject} from './workspaceReads';
import {useWorkspaceQuery} from './useWorkspaceQuery';

export function ProjectHome({projectId, onSelect, onCanvas, onWorkspace, onStatus}: {
    projectId: string; onSelect: (id: string) => void;
    onCanvas: (id: string) => Promise<void>; onStatus: (text: string) => void;
    onWorkspace?: (id: string) => Promise<void>;
}) {
    const [preview, setPreview] = useState<ReturnType<typeof projectResumePreview>>();
    const [chosen, setChosen] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const projectQuery = useWorkspaceQuery('project:' + projectId, () => loadProject(projectId));
    const snapshot = projectQuery.data || {entities: [], relationships: [], tasks: []};
    const members = projectMembers(snapshot.entities, snapshot.relationships, projectId);
    const project = snapshot.entities.find(entity => entity.id === projectId);
    const groups = [
        {name: 'Chats', types: ['conversation']},
        {name: 'Research', types: ['website', 'page', 'bookmark', 'tab', 'repository', 'file', 'image', 'document', 'clip', 'screenshot', 'browser-visit', 'search']},
        {name: 'Tasks', types: ['task']},
        {name: 'Memory', types: ['memory']},
        {name: 'Notes and ideas', types: ['note', 'idea', 'prompt']}
    ];
    const previewResume = async () => {
        try {
            const tabs = await browser.tabs.query({});
            const fresh = await loadProject(projectId);
            const next = projectResumePreview(projectId, fresh.entities, fresh.relationships, tabs.flatMap(tab => tab.url ? [tab.url] : []));
            setPreview(next); setChosen(new Set(next.slice(0, 10).map(item => item.url)));
        } catch (error) { onStatus(String(error)); }
    };
    const resume = async () => {
        if (busy || !preview) return;
        setBusy(true);
        let opened = 0;
        try {
            const tabs = await browser.tabs.query({});
            const {entities, relationships} = await loadProject(projectId);
            const allowed = new Set(projectResumePreview(projectId, entities, relationships, tabs.flatMap(tab => tab.url ? [tab.url] : [])).map(item => item.url));
            for (const item of preview.filter(item => chosen.has(item.url) && allowed.has(item.url)).slice(0, 20)) {
                await browser.tabs.create({url: item.url, active: false}); opened++;
            }
            setPreview(undefined); onStatus('Resumed project: opened ' + opened + ' tabs. Existing tabs were kept.');
        } catch (error) { onStatus('Opened ' + opened + ' tabs before stopping: ' + String(error)); }
        finally { setBusy(false); }
    };
    return <section aria-label="Project homepage" className="brainCapture">
        <h3>{project?.title} · Project home</h3>
        {projectQuery.loading && <p role="status">Loading project…</p>}
        {projectQuery.error && <p role="alert">{projectQuery.error.message} <button onClick={projectQuery.retry}>Retry project</button></p>}
        <p>{members.length} connected objects · {members.filter(item => item.type === 'task' && brainStatus(item, snapshot.tasks) !== 'done').length} open tasks · {members.filter(item => item.type === 'memory').length} memories</p>
        <button onClick={() => void onCanvas(projectId).catch(error => onStatus(String(error)))}>Open project canvas</button>
        {onWorkspace && <button onClick={() => void onWorkspace(projectId).catch(error => onStatus(String(error)))}>Open project workspace</button>}
        <button disabled={busy} onClick={() => void previewResume()}>Preview resume work</button>
        {preview && <fieldset disabled={busy}><legend>Review tabs before opening (maximum 20)</legend>
            <p>Already-open and duplicate URLs are excluded. No tabs open until you confirm.</p>
            {preview.slice(0, 100).map(item => <label key={item.url} style={{display: 'block'}}><input type="checkbox" checked={chosen.has(item.url)}
                onChange={event => setChosen(current => { const next = new Set(current); if (event.target.checked) next.add(item.url); else next.delete(item.url); return next; })} />{item.title} — {item.url}</label>)}
            {!preview.length && <p>No unopened project web pages.</p>}
            {preview.length > 100 && <p>Showing the 100 most recent pages.</p>}
            <button disabled={!chosen.size || chosen.size > 20} onClick={() => void resume()}>Open {chosen.size} selected tabs</button>
            <button onClick={() => setPreview(undefined)}>Cancel</button>
        </fieldset>}
        <h4>Recent project objects</h4>{[...members].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map(item => <button key={item.id} onClick={() => onSelect(item.id)}>{item.title}</button>)}
        {groups.map(group => {
            const items = members.filter(item => group.types.includes(item.type)).sort((a, b) => b.updatedAt - a.updatedAt);
            return <details key={group.name}><summary>{group.name + ' (' + items.length + ')'}</summary>
                {items.slice(0, 6).map(item => <button key={item.id} onClick={() => onSelect(item.id)}>{item.title}</button>)}
                {!items.length && <p>No confirmed members yet.</p>}
                {items.length > 6 && <p>Showing the six most recent. Use the shared views below for all objects.</p>}
            </details>;
        })}
    </section>;
}
