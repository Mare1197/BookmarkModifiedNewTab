import Dexie from 'dexie';
import {workspaceClient as db} from './workspaceClient';
import {readRichContent} from './richContent';
import {payloadBytes, targetKey, validateRevision, validateSnapshot, validateTarget, validateTargetVersion} from './recoveryValidation';
import type {WorkspaceEntity} from '../../workspace/types';
import type {PageSnapshot} from './pageRepository';
import type {PlacementPresentation} from '../../workspace/pageTypes';
import {RECOVERY_RECORD_LIMIT, RECOVERY_TOTAL_LIMIT, type ContentSnapshot, type HistoryCursor, type HistoryPage,
    type LayoutSnapshot, type RecoverySnapshot, type RevisionRecord, type Target, type TargetVersion} from '../../workspace/recoveryTypes';

export function contentSnapshot(entity: WorkspaceEntity): ContentSnapshot {
    if (!['note', 'document'].includes(entity.type)) throw new Error('Only notes and documents have content history.');
    const result: ContentSnapshot = {kind: 'entity', entityId: entity.id, title: entity.title, content: readRichContent(entity)};
    validateSnapshot(result); return result;
}
export function layoutSnapshot(page: PageSnapshot): LayoutSnapshot {
    const p = page.presentation;
    const result: LayoutSnapshot = {kind: 'page', boardId: page.board.id, placements: page.placements.map((item, index) => ({
        id: item.id, entityId: item.entityId, kind: item.kind, x: item.x, y: item.y, width: item.width, height: item.height, zIndex: item.zIndex,
        page: structuredClone(item.metadata?.page as PlacementPresentation ?? {order: index, collapsed: false, color: 'default'})})),
        presentation: structuredClone({version: p.version, ownerEntityId: p.ownerEntityId, revision: p.revision,
            mode: p.mode, viewport: p.viewport, groups: p.groups, connectors: p.connectors})};
    validateSnapshot(result); return result;
}
function stable(value: unknown): string {
    return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ?
        Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
}
export function snapshotMeaning(snapshot: RecoverySnapshot): string {
    if (snapshot.kind === 'entity') return stable(snapshot);
    const {revision, viewport, ...presentation} = snapshot.presentation;
    void revision; void viewport;
    return stable({...snapshot, presentation, placements: [...snapshot.placements].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)});
}
const oldest = (a: RevisionRecord, b: RevisionRecord) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export function createRevisionRepository(options: {now?: () => number; limits?: {perTargetCount: number; perTargetBytes: number; globalBytes: number}} = {}) {
    const now = options.now ?? Date.now;
    const limits = options.limits ?? {perTargetCount: 50, perTargetBytes: RECOVERY_RECORD_LIMIT, globalBytes: RECOVERY_TOTAL_LIMIT};
    async function captureTransition(before: {snapshot: RecoverySnapshot; version: TargetVersion} | undefined,
        after: RecoverySnapshot, version: TargetVersion, reason: string, sourceSessionId?: string): Promise<void> {
        if (!Dexie.currentTransaction || Dexie.currentTransaction.mode !== 'readwrite') throw new Error('History capture requires the canonical write transaction.');
        validateSnapshot(after); validateTargetVersion(version, after.kind);
        const target: Target = {kind: after.kind, id: after.kind === 'entity' ? after.entityId : after.boardId};
        const key = targetKey(target);
        if (before) {
            validateSnapshot(before.snapshot); validateTargetVersion(before.version, target.kind);
            if (before.snapshot.kind !== after.kind ||
                (before.snapshot.kind === 'entity' ? before.snapshot.entityId : before.snapshot.boardId) !== target.id) throw new Error('History target mismatch.');
        }
        const rows = (await db.workspaceRevisions.toArray()).sort(oldest);
        let ordinal = rows.reduce((max, row) => Math.max(max, Number(/^revision:(\d+):/.exec(row.id)?.[1] ?? 0)), 0);
        const createdAt = Math.max(now(), rows.at(-1)?.createdAt ?? 0);
        let latest = rows.filter(row => row.targetKey === key).at(-1);
        const append = async (snapshot: RecoverySnapshot, canonicalVersion: TargetVersion, why: string) => {
            const bytes = payloadBytes(snapshot);
            if (bytes > limits.perTargetBytes || bytes > limits.globalBytes) throw new Error('History snapshot exceeds storage limit.');
            const record: RevisionRecord = {id: 'revision:' + String(++ordinal).padStart(16, '0') + ':' + crypto.randomUUID(), version: 1,
                targetKey: key, target, createdAt, reason: why, sourceSessionId, canonicalVersion, snapshot: structuredClone(snapshot), payloadBytes: bytes};
            validateRevision(record); await db.workspaceRevisions.add(record); rows.push(record); latest = record;
        };
        if (!latest && before) await append(before.snapshot, before.version, 'baseline');
        if (reason === 'restore' || !latest || snapshotMeaning(latest.snapshot) !== snapshotMeaning(after)) await append(after, version, reason);
        const removed = new Set<string>();
        const perTarget = rows.filter(row => row.targetKey === key);
        let bytes = perTarget.reduce((sum, row) => sum + row.payloadBytes, 0), count = perTarget.length;
        for (const row of perTarget) {
            if (count <= limits.perTargetCount && bytes <= limits.perTargetBytes) break;
            removed.add(row.id); count--; bytes -= row.payloadBytes;
        }
        let globalBytes = rows.filter(row => !removed.has(row.id)).reduce((sum, row) => sum + row.payloadBytes, 0);
        for (const row of rows) {
            if (globalBytes <= limits.globalBytes) break;
            if (!removed.has(row.id)) {removed.add(row.id); globalBytes -= row.payloadBytes;}
        }
        await db.workspaceRevisions.bulkDelete([...removed]);
    }
    async function listHistory(target: Target, cursor?: HistoryCursor): Promise<HistoryPage> {
        validateTarget(target); const key = targetKey(target);
        if (cursor && (!Number.isSafeInteger(cursor.createdAt) || cursor.createdAt < 0 || typeof cursor.id !== 'string')) throw new Error('Invalid history cursor.');
        const rows = await db.workspaceRevisions.where('[targetKey+createdAt+id]')
            .between([key, 0, ''], cursor ? [key, cursor.createdAt, cursor.id] : [key, Dexie.maxKey], true, !cursor)
            .reverse().limit(21).toArray();
        const items = rows.slice(0, 20).map(row => {validateRevision(row); const {snapshot, ...summary} = row; void snapshot; return summary;});
        const last = items.at(-1);
        return {items, next: rows.length > 20 && last ? {createdAt: last.createdAt, id: last.id} : undefined};
    }
    async function readRevision(id: string) {const record = await db.workspaceRevisions.get(id); if (record) validateRevision(record); return record;}
    async function deleteHistory(target: Target) {validateTarget(target); await db.workspaceRevisions.where('targetKey').equals(targetKey(target)).delete();}
    return {contentSnapshot, layoutSnapshot, captureTransition, listHistory, readRevision, deleteHistory};
}
export const {captureTransition, listHistory, readRevision, deleteHistory} = createRevisionRepository();

export async function captureEntityTransition(before: WorkspaceEntity | undefined, after: WorkspaceEntity, reason: string, sessionId?: string) {
    if (!['note', 'document'].includes(after.type)) return;
    await captureTransition(before ? {snapshot: contentSnapshot(before), version: {kind: 'entity', revision: before.contentRevision || 0}} : undefined,
        contentSnapshot(after), {kind: 'entity', revision: after.contentRevision || 0}, reason, sessionId);
}
