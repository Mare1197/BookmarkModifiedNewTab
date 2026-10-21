import type {WorkspaceClient} from './workspaceDatabase';
import type {SearchDocument, SearchState} from './searchIndexTypes';

function validDocument(document: SearchDocument, state: SearchState): boolean {
    if (typeof document.id !== 'string' || document.epoch !== state.epoch ||
        !Number.isSafeInteger(document.generation) || document.generation < 0 || document.generation > state.generation) return false;
    let fingerprint: unknown;
    try {fingerprint = JSON.parse(document.fingerprint);} catch {return false;}
    if (!Array.isArray(fingerprint) || fingerprint.length !== 6 || fingerprint[0] !== 2 || fingerprint[1] !== state.locale ||
        typeof fingerprint[2] !== 'string' || fingerprint[3] !== 'explorer' || fingerprint[4] !== 'brain' || fingerprint[5] !== 'smart') return false;
    const dialects = ['explorer', 'brain', 'smart'] as const;
    if (!Array.isArray(document.overflowDialects) || document.overflowDialects.length > 3 ||
        document.overflowDialects.some(dialect => !dialects.includes(dialect))) return false;
    return Array.isArray(document.grams) && document.grams.length <= 12288 &&
        document.grams.every(gram => typeof gram === 'string' && gram.length === 3);
}

// Validate the entire candidate source, including rows absent from postings.
// Caller holds the same read transaction as candidate selection. No bodies or
// full-cache arrays are retained, and corruption never becomes an empty result.
export async function hasSearchIntegrity(db: WorkspaceClient, state: SearchState, signal?: AbortSignal): Promise<boolean> {
    let lastId: string | undefined;
    for (;;) {
        if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
        const rows: SearchDocument[] = await (lastId === undefined ? db.searchDocuments.orderBy('id') :
            db.searchDocuments.where('id').above(lastId)).limit(250).toArray();
        if (!rows.every(row => validDocument(row, state))) return false;
        const canonicalIds = await (lastId === undefined ? db.entities.orderBy('id') :
            db.entities.where('id').above(lastId)).limit(250).primaryKeys();
        if (canonicalIds.length !== rows.length || canonicalIds.some((id, index) => id !== rows[index]!.id)) return false;
        if (rows.length < 250) return true;
        lastId = rows.at(-1)!.id;
    }
}
