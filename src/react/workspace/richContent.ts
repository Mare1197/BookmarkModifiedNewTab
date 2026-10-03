import type {RichContent} from '../../workspace/pageTypes';
import type {WorkspaceEntity} from '../../workspace/types';

const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(key => keys.includes(key));
export function validateRichContent(value: unknown): asserts value is RichContent {
    if (!record(value) || !only(value, ['version', 'blocks']) || value.version !== 1 || !Array.isArray(value.blocks) ||
        value.blocks.length > 2000) throw new Error('Invalid rich text (maximum 2000 blocks).');
    const ids = new Set<string>();
    let length = 0;
    for (const b of value.blocks) {
        if (!record(b) || !only(b, ['id', 'kind', 'runs', 'level', 'checked', 'language']) ||
            typeof b.id !== 'string' || !b.id || b.id.length > 1000 || ids.has(b.id) ||
            !['paragraph', 'heading', 'bullet', 'numbered', 'check', 'quote', 'code'].includes(String(b.kind)) ||
            !Array.isArray(b.runs) || b.runs.length > 10000 ||
            (b.level !== undefined && (b.kind !== 'heading' || ![1, 2, 3].includes(Number(b.level)) || typeof b.level !== 'number')) ||
            (b.checked !== undefined && (b.kind !== 'check' || typeof b.checked !== 'boolean')) ||
            (b.language !== undefined && (b.kind !== 'code' || typeof b.language !== 'string' || !/^[\w+-]{0,40}$/.test(b.language)))) {
            throw new Error('Invalid rich text block.');
        }
        ids.add(b.id);
        for (const run of b.runs) {
            if (!record(run) || !only(run, ['insert', 'attributes']) || typeof run.insert !== 'string') throw new Error('Invalid rich text run.');
            length += run.insert.length;
            if (length > 100000) throw new Error('Rich text exceeds 100000 characters.');
            if (run.attributes !== undefined) {
                const a = run.attributes;
                if (!record(a) || !only(a, ['bold', 'italic', 'underline', 'strike', 'code', 'link']) ||
                    Object.entries(a).some(([key, value]) => key !== 'link' && typeof value !== 'boolean')) throw new Error('Invalid rich text attributes.');
                if (a.link !== undefined) {
                    try {
                        if (typeof a.link !== 'string' || a.link.length > 4096 || !['http:', 'https:'].includes(new URL(a.link).protocol)) throw new Error();
                    } catch {throw new Error('Rich text links must use HTTP or HTTPS.');}
                }
            }
        }
    }
}
export function plainToRichContent(text: string): RichContent {
    // One block preserves legacy newlines without multiplying paragraph records.
    const content: RichContent = {version: 1, blocks: [{id: 'paragraph:legacy', kind: 'paragraph', runs: [{insert: text}]}]};
    validateRichContent(content);
    return content;
}
export function richContentToPlainText(content: RichContent): string {
    validateRichContent(content);
    return content.blocks.map(b => b.runs.map(r => r.insert).join('')).join('\n');
}
export function readRichContent(entity: WorkspaceEntity): RichContent {
    if (!entity.richContent) return plainToRichContent(String(entity.metadata?.body || ''));
    validateRichContent(entity.richContent);
    return structuredClone(entity.richContent);
}
