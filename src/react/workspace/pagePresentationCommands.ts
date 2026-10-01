import type {PageCommand} from '../../workspace/pageTypes';
import type {LayoutSnapshot} from '../../workspace/recoveryTypes';
import {validateCommand, validateSnapshot} from './recoveryValidation';
export class SemanticCommandError extends Error {}
export function projectPresentation(base: LayoutSnapshot, commands: PageCommand[]): LayoutSnapshot {
    validateSnapshot(base); const state = structuredClone(base), p = state.presentation;
    const placement = (id: string) => {const item = state.placements.find(p => p.id === id); if (!item) throw new Error('Missing placement in this page.'); return item;};
    const connector = (id: string) => {const c = p.connectors.find(c => c.id === id); if (!c) throw new Error('Missing page connector.'); return c;};
    for (const command of commands) {
        validateCommand(command);
        switch (command.type) {
            case 'move-resize': command.placements.forEach(change => Object.assign(placement(change.id), change)); break;
            case 'reorder':
                if (command.placementIds.length !== state.placements.length) throw new Error('Order must contain each placement exactly once.');
                command.placementIds.forEach((id, order) => {placement(id).page.order = order;}); break;
            case 'group':
                p.groups = [...p.groups.filter(g => g.id !== command.group.id), structuredClone(command.group)];
                command.placementIds.forEach(id => {placement(id).page.groupId = command.group.id;}); break;
            case 'ungroup': {
                const group = p.groups.find(g => g.id === command.groupId); if (!group) throw new Error('Missing group.');
                p.groups = p.groups.filter(g => g.id !== group.id).map(g => g.parentId === group.id ? {...g, parentId: group.parentId} : g);
                state.placements.forEach(item => {if (item.page.groupId === group.id) item.page.groupId = group.parentId;}); break;
            }
            case 'collapse':
                if (command.placementId) placement(command.placementId).page.collapsed = command.collapsed;
                else {const group = p.groups.find(g => g.id === command.groupId); if (!group) throw new Error('Missing group.'); group.collapsed = command.collapsed;} break;
            case 'style': command.placementIds.forEach(id => {placement(id).page.color = command.color;}); break;
            case 'view': p.mode = command.mode; p.viewport = structuredClone(command.viewport); break;
            case 'remove-reference': {
                command.placementIds.forEach(placement); const removed = new Set(command.placementIds);
                state.placements = state.placements.filter(item => !removed.has(item.id));
                p.connectors = p.connectors.filter(c => !removed.has(c.fromPlacementId) && !removed.has(c.toPlacementId)); break;
            }
            case 'connector-style': Object.assign(connector(command.connectorId), {points: structuredClone(command.points), color: command.color, dashed: command.dashed, mode: command.mode}); break;
            case 'remove-connector':
                if (command.scope === 'everywhere') throw new SemanticCommandError('This operation deletes a shared relationship.');
                connector(command.connectorId); p.connectors = p.connectors.filter(c => c.id !== command.connectorId); break;
            case 'connect': throw new SemanticCommandError('This operation creates a shared relationship.');
        }
        validateSnapshot(state);
    }
    return state;
}
