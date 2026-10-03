import {useEffect, useMemo, useState} from 'react';
import {liveQuery} from 'dexie';
import {loadPageNavigation, type PageNavigationItem} from './pageNavigation';

export function WorkspacePages({boardId, busy, onOpen}: {boardId: string; busy: boolean; onOpen: (id: string) => void}) {
    const [items, setItems] = useState<PageNavigationItem[]>([]), [query, setQuery] = useState(''), [error, setError] = useState('');
    useEffect(() => {
        const subscription = liveQuery(loadPageNavigation).subscribe({next: next => {setItems(next); setError('');}, error: e => setError(String(e))});
        return () => subscription.unsubscribe();
    }, []);
    const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
    const current = items.find(item => item.boardId === boardId), crumbs: PageNavigationItem[] = [];
    let ancestor = current; const seen = new Set<string>();
    while (ancestor && !seen.has(ancestor.id)) {seen.add(ancestor.id); crumbs.unshift(ancestor); ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;}
    const term = query.trim().toLocaleLowerCase(), visible = new Set<string>();
    for (const item of items) if (!term || item.title.toLocaleLowerCase().includes(term)) {
        let parent: PageNavigationItem | undefined = item;
        while (parent && !visible.has(parent.id)) {visible.add(parent.id); parent = parent.parentId ? byId.get(parent.parentId) : undefined;}
    }
    return <div className="workspacePages">
        <nav aria-label="Page breadcrumbs"><ol>{crumbs.map(item => <li key={item.id}>
            <button disabled={busy || item.boardId === boardId} aria-current={item.boardId === boardId ? 'page' : undefined} onClick={() => onOpen(item.boardId)}>{item.title}</button>
        </li>)}</ol></nav>
        <details><summary>Page outline</summary><label>Find page<input value={query} onChange={event => setQuery(event.target.value)} /></label>
            <nav aria-label="Workspace pages"><ul>{items.filter(item => visible.has(item.id)).map(item => <li key={item.id} style={{paddingInlineStart: Math.min(item.depth, 8) * 14}}>
                <button disabled={busy || item.boardId === boardId} aria-current={item.boardId === boardId ? 'page' : undefined} onClick={() => onOpen(item.boardId)}>{item.title}</button>
            </li>)}</ul>{visible.size === 0 && <p>No matching pages.</p>}</nav>
        </details>
        {error && <p role="status">{error}</p>}
    </div>;
}
