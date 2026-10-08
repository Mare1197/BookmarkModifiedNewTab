import {useEffect, useState} from 'react';
import {workspaceClient} from './workspaceDatabase';
export {WorkspaceClient, workspaceClient} from './workspaceDatabase';

export interface WorkspaceSummary {entities: number; boards: number; relationships: number}
export async function getWorkspaceSummary(): Promise<WorkspaceSummary> {
    const [entities, boards, relationships] = await Promise.all([
        workspaceClient.entities.count(), workspaceClient.boards.count(), workspaceClient.relationships.count()
    ]);
    return {entities, boards, relationships};
}
export function useWorkspaceSummary(enabled: boolean): WorkspaceSummary | null {
    const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        getWorkspaceSummary().then(next => {if (!cancelled) setSummary(next);});
        return () => {cancelled = true;};
    }, [enabled]);
    return summary;
}
