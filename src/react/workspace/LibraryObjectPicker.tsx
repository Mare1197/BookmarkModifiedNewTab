import {useState} from 'react';
import type {WorkspaceEntity} from '../../workspace/types';
import {workspaceClient as db} from './workspaceClient';
import {useLibraryPage} from './useLibraryPage';
import {useWorkspaceQuery} from './useWorkspaceQuery';
import {LibraryPager} from './LibraryPager';

/** Selection is a canonical ID, independent of the visible result page. */
export function LibraryObjectPicker({label, value, onChange, type, excludeId, eligible, emptyLabel = 'Choose object'}: {
    label: string; value: string; onChange: (id: string) => void; type?: string;
    excludeId?: string; eligible?: (entity: WorkspaceEntity) => boolean; emptyLabel?: string;
}) {
    const [text, setText] = useState('');
    const page = useLibraryPage({dialect: 'explorer', text, type, sort: 'id'});
    const selected = useWorkspaceQuery('picker:' + value, async () => value ? db.entities.get(value) : undefined);
    const items = (page.data?.items || []).filter(item => item.id !== excludeId && (!eligible || eligible(item)));
    const selectedOutsidePage = selected.data && selected.data.id !== excludeId &&
        (!eligible || eligible(selected.data)) && !items.some(item => item.id === value) ? selected.data : undefined;
    return <div className="libraryObjectPicker">
        <label>Search {label}<input value={text} onChange={event => setText(event.target.value)} /></label>
        <label>{label}<select value={value} onChange={event => onChange(event.target.value)}>
            <option value="">{emptyLabel}</option>
            {selectedOutsidePage && <option value={selectedOutsidePage.id}>{selectedOutsidePage.title}</option>}
            {items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <LibraryPager page={page} label={label + ' choices'} />
    </div>;
}
