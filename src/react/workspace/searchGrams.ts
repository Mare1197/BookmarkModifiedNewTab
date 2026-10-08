import type {WorkspaceEntity} from '../../workspace/types';
import type {LibraryQuery} from './libraryQueryTypes';
import type {SearchDialect, SearchDocument} from './searchIndexTypes';
import {parseSmartQuery} from './workspaceSearch';

const UNIT_LIMIT = 65536, GRAM_LIMIT = 4096;
function* fields(entity: WorkspaceEntity, dialect: SearchDialect): Generator<string> {
    yield entity.title; yield dialect === 'explorer' ? entity.type : entity.canonicalUrl || '';
    if (dialect === 'explorer') {yield entity.canonicalUrl || ''; return;}
    if (dialect === 'smart') for (const term of entity.searchTerms || []) yield term;
    yield String(entity.metadata?.body || '');
    if (dialect === 'brain') for (const tag of entity.tags || []) yield tag;
}
function boundedGrams(entity: WorkspaceEntity, dialect: SearchDialect): {grams: string[]; overflow: boolean} {
    const parts: string[] = [];
    let units = 0;
    for (const field of fields(entity, dialect)) {
        units += field.length + (dialect !== 'explorer' && parts.length ? 1 : 0);
        if (units > UNIT_LIMIT) return {grams: [], overflow: true};
        parts.push(field);
    }
    const haystacks = dialect === 'explorer' ? parts : [parts.join(' ')];
    const grams = new Set<string>();
    units = 0;
    for (const text of haystacks) {
        // Match the existing default-locale predicate, including contextual case mapping.
        const normalized = text.toLocaleLowerCase();
        units += normalized.length;
        if (units > UNIT_LIMIT) return {grams: [], overflow: true};
        for (let i = 0; i + 2 < normalized.length; i++) {
            grams.add(normalized.slice(i, i + 3));
            if (grams.size > GRAM_LIMIT) return {grams: [], overflow: true};
        }
    }
    return {grams: [...grams], overflow: false};
}
export function deriveSearchDocument(entity: WorkspaceEntity, generation: number, epoch: string, locale: string): SearchDocument {
    const explorer = boundedGrams(entity, 'explorer'), brain = boundedGrams(entity, 'brain'), smart = boundedGrams(entity, 'smart');
    return {id: entity.id, generation, epoch, fingerprint: JSON.stringify([1, locale, entity.type, 'explorer', 'brain', 'smart']),
        explorerGrams: explorer.grams, brainGrams: brain.grams, smartGrams: smart.grams,
        overflowDialects: (['explorer', 'brain', 'smart'] as const).filter(d => ({explorer, brain, smart})[d].overflow)};
}
export function queryTextTerms(query: LibraryQuery): string[] {
    if (query.dialect === 'smart') return parseSmartQuery(query.text, query.referenceTime).text;
    if (query.dialect === 'brain') return query.text.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const term = query.text.trim().toLocaleLowerCase();
    return term ? [term] : [];
}
export function queryGrams(query: LibraryQuery): string[] | undefined {
    const terms = queryTextTerms(query);
    if (!terms.length || terms.some(term => term.length < 3 || term.length > UNIT_LIMIT)) return;
    const grams = new Set<string>();
    for (const term of terms) for (let i = 0; i + 2 < term.length; i++) {
        grams.add(term.slice(i, i + 3));
        if (grams.size > GRAM_LIMIT) return;
    }
    return [...grams];
}
