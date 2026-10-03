import type {MemoryPolicy} from '../../workspace/types';
import type {BrainView, TileLayout} from './brainRepository';
import {validatePagePresentation} from './pageValidation';

const record = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function validateMemoryPolicy(value: unknown): asserts value is MemoryPolicy {
    if (!record(value) || !['active', 'forgotten'].includes(String(value.status)) ||
        typeof value.excludedFromAI !== 'boolean' || !['private', 'project'].includes(String(value.scope)) ||
        ['reviewedAt', 'reviewBy'].some(key => value[key] !== undefined &&
            (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || Number(value[key]) < 0))) {
        throw new Error('Invalid memory policy.');
    }
}
export function validateBrainView(value: unknown): asserts value is BrainView {
    if (!record(value) || typeof value.name !== 'string' || !value.name.trim() ||
        !['Table', 'Kanban', 'Tiles', 'Timeline', 'AI Inbox'].includes(String(value.mode)) || !record(value.query)) {
        throw new Error('Invalid saved view.');
    }
    const query = value.query;
    if (Object.keys(query).some(key => !['projectId', 'query', 'type', 'status', 'sort'].includes(key)) ||
        Object.values(query).some(item => item !== undefined && typeof item !== 'string') ||
        (query.sort !== undefined && !['title', 'updated'].includes(String(query.sort)))) throw new Error('Invalid saved view query.');
}
export function validateTileLayout(value: unknown): asserts value is Record<string, TileLayout> {
    if (!record(value) || Object.entries(value).some(([key, item]) => !key || !record(item) ||
        typeof item.order !== 'number' || !Number.isFinite(item.order) || ![1, 2, 3].includes(Number(item.width)) ||
        typeof item.width !== 'number')) throw new Error('Invalid tile layout.');
}
export function validateBrainSetting(key: string, value: unknown) {
    if (key.startsWith('workspace-page:')) validatePagePresentation(value);
    if (key.startsWith('brain-view:')) validateBrainView(value);
    if (key.startsWith('brain-tiles:')) validateTileLayout(value);
}
