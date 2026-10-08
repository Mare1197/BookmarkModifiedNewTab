import {useState} from 'react';
import {loadWorkflowPage, type WorkflowKind} from './workspaceReads';
import {useWorkspaceQuery} from './useWorkspaceQuery';

export function useWorkflowPage(kind: WorkflowKind, filter = 'all') {
    const [position, setPosition] = useState({filter, index: 0});
    if (position.filter !== filter) setPosition({filter, index: 0});
    const index = position.filter === filter ? position.index : 0;
    const page = useWorkspaceQuery(JSON.stringify([kind, filter, index]), () => loadWorkflowPage(kind, index, filter));
    return {...page, index, next: () => {if (page.data?.hasMore) setPosition({filter, index: index + 1});},
        previous: () => setPosition({filter, index: Math.max(0, index - 1)})};
}
