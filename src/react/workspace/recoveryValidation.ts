import {validateRichContent} from './richContent';
import {validateGeometry, validatePagePresentation, validatePlacementPresentation} from './pageValidation';
import {RECOVERY_RECORD_LIMIT, type DraftRecord, type RecoverySnapshot, type RevisionRecord, type Target, type TargetVersion} from '../../workspace/recoveryTypes';
import type {PageCommand} from '../../workspace/pageTypes';
export {PRIVATE_RECOVERY_TABLES} from '../../workspace/recoveryTypes';

export const targetKey = (target: Target) => JSON.stringify([target.kind, target.id]);
export const payloadBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
function check(value: unknown, message = 'Invalid recovery record.'): asserts value {if (!value) throw new Error(message);}
function object(value: unknown): Record<string, unknown> {check(value && typeof value === 'object' && !Array.isArray(value)); return value as Record<string, unknown>;}
function only(value: Record<string, unknown>, keys: string[]) {check(Object.keys(value).every(key => keys.includes(key)));}
function id(value: unknown): asserts value is string {check(typeof value === 'string' && value.length > 0 && value.length <= 500);}
function integer(value: unknown) {check(Number.isSafeInteger(value) && Number(value) >= 0);}
function ids(value: unknown) {check(Array.isArray(value) && value.length <= 10000); value.forEach(id); check(new Set(value).size === value.length, 'Duplicate ID in command order.');}
export function validateTarget(value: unknown): asserts value is Target {
    const v = object(value); only(v, ['kind', 'id']); check(v.kind === 'entity' || v.kind === 'page'); id(v.id);
}
export function validateTargetVersion(value: unknown, kind: Target['kind']): asserts value is TargetVersion {
    const v = object(value); check(v.kind === kind);
    if (kind === 'entity') {only(v, ['kind', 'revision']); integer(v.revision);}
    else {only(v, ['kind', 'value']); const p = object(v.value); only(p, ['revision', 'fingerprint']); integer(p.revision);
        check(typeof p.fingerprint === 'string' && p.fingerprint.length <= RECOVERY_RECORD_LIMIT);}
}
export function validateSnapshot(value: unknown): asserts value is RecoverySnapshot {
    const v = object(value);
    if (v.kind === 'entity') {
        only(v, ['kind', 'entityId', 'title', 'content']); id(v.entityId);
        check(typeof v.title === 'string' && v.title.length <= 10000); validateRichContent(v.content);
    } else {
        check(v.kind === 'page'); only(v, ['kind', 'boardId', 'placements', 'presentation']); id(v.boardId);
        validatePagePresentation(v.presentation); check(Array.isArray(v.placements) && v.placements.length <= 10000);
        const placementIds = new Set<string>(), groups = new Set(v.presentation.groups.map(g => g.id));
        for (const item of v.placements) {
            const p = object(item); only(p, ['id', 'entityId', 'kind', 'x', 'y', 'width', 'height', 'zIndex', 'page']);
            id(p.id); id(p.entityId); check(!placementIds.has(p.id)); placementIds.add(p.id);
            check(['entity', 'note', 'page', 'image', 'file', 'group', 'frame', 'analysis', 'clip', 'document', 'folder', 'screenshot',
                'task', 'project', 'conversation', 'message', 'website', 'bookmark', 'browser-visit', 'tab', 'search', 'idea', 'memory',
                'prompt', 'repository', 'automation', 'automation-run', 'feature', 'codex-session', 'commit'].includes(String(p.kind)));
            validateGeometry(p as unknown as {x: number; y: number; width: number; height: number});
            check(typeof p.zIndex === 'number' && Number.isFinite(p.zIndex)); validatePlacementPresentation(p.page);
            check(!p.page.groupId || groups.has(p.page.groupId));
        }
        for (const c of v.presentation.connectors) check(placementIds.has(c.fromPlacementId) && placementIds.has(c.toPlacementId));
    }
    check(payloadBytes(value) <= RECOVERY_RECORD_LIMIT, 'Recovery snapshot exceeds size limit.');
}
export function validateCommand(value: unknown): asserts value is PageCommand {
    const v = object(value); id(v.type);
    switch (v.type) {
        case 'move-resize':
            only(v, ['type', 'placements']); check(Array.isArray(v.placements) && v.placements.length <= 10000);
            for (const p of v.placements) {const r = object(p); only(r, ['id', 'x', 'y', 'width', 'height']); id(r.id); validateGeometry(p);}
            break;
        case 'reorder': case 'remove-reference': only(v, ['type', 'placementIds']); ids(v.placementIds); break;
        case 'group': {
            only(v, ['type', 'group', 'placementIds']); ids(v.placementIds); const g = object(v.group);
            only(g, ['id', 'label', 'parentId', 'collapsed']); id(g.id); check(typeof g.label === 'string' && g.label.length <= 500);
            check(typeof g.collapsed === 'boolean'); if (g.parentId !== undefined) {id(g.parentId); check(g.parentId !== g.id);} break;
        }
        case 'ungroup': only(v, ['type', 'groupId']); id(v.groupId); break;
        case 'collapse': only(v, ['type', 'placementId', 'groupId', 'collapsed']); check(typeof v.collapsed === 'boolean');
            check(Boolean(v.placementId) !== Boolean(v.groupId)); id(v.placementId || v.groupId); break;
        case 'style': only(v, ['type', 'placementIds', 'color']); ids(v.placementIds);
            check(['default', 'blue', 'green', 'yellow', 'purple'].includes(String(v.color))); break;
        case 'view': only(v, ['type', 'mode', 'viewport']);
            validatePagePresentation({version: 1, ownerEntityId: 'validation', revision: 0, mode: v.mode, viewport: v.viewport, groups: [], connectors: []}); break;
        case 'connect': only(v, ['type', 'connectorId', 'fromPlacementId', 'toPlacementId', 'relationType', 'label']);
            if (v.connectorId !== undefined) id(v.connectorId);
            id(v.fromPlacementId); id(v.toPlacementId); check(v.fromPlacementId !== v.toPlacementId);
            check(['related', 'supports', 'depends-on', 'references'].includes(String(v.relationType)));
            check(v.label === undefined || typeof v.label === 'string' && v.label.length <= 500); break;
        case 'connector-style': only(v, ['type', 'connectorId', 'points', 'color', 'dashed', 'mode']); id(v.connectorId);
            validatePagePresentation({version: 1, ownerEntityId: 'v', revision: 0, mode: 'canvas', viewport: {x: 0, y: 0, zoom: 1}, groups: [],
                connectors: [{id: v.connectorId, relationshipId: 'r', fromPlacementId: 'a', toPlacementId: 'b',
                    points: v.points, color: v.color, dashed: v.dashed, mode: v.mode}]}); break;
        case 'connector-route': case 'reconnect':
            only(v, v.type === 'reconnect' ? ['type', 'connectorId', 'fromPlacementId', 'toPlacementId', 'anchors', 'points'] : ['type', 'connectorId', 'anchors', 'points']);
            id(v.connectorId); check(v.anchors !== undefined);
            if (v.type === 'reconnect') {id(v.fromPlacementId); id(v.toPlacementId); check(v.fromPlacementId !== v.toPlacementId);}
            validatePagePresentation({version: 1, ownerEntityId: 'v', revision: 0, mode: 'canvas', viewport: {x: 0, y: 0, zoom: 1}, groups: [],
                connectors: [{id: v.connectorId, relationshipId: 'r', fromPlacementId: 'a', toPlacementId: 'b',
                    points: v.points, anchors: v.anchors, color: '#64748b', dashed: false, mode: 'orthogonal'}]}); break;
        case 'remove-connector': only(v, ['type', 'connectorId', 'scope']); id(v.connectorId); check(['page', 'everywhere'].includes(String(v.scope))); break;
        default: throw new Error('Invalid recovery command.');
    }
}
function matches(snapshot: RecoverySnapshot, target: Target) {return snapshot.kind === target.kind && (snapshot.kind === 'entity' ? snapshot.entityId : snapshot.boardId) === target.id;}
export function validateDraft(value: unknown): asserts value is DraftRecord {
    const v = object(value); only(v, ['id', 'version', 'sessionId', 'targetKey', 'target', 'boardId', 'generation', 'appliedThrough', 'base', 'baseVersion',
        'operations', 'updatedAt', 'leaseUntil', 'payloadBytes', 'recoveredGeneration', 'recoverySource']);
    id(v.id); id(v.sessionId); check(v.version === 1); validateTarget(v.target); check(v.targetKey === targetKey(v.target));
    if (v.boardId !== undefined) id(v.boardId);
    integer(v.generation); integer(v.appliedThrough); integer(v.updatedAt); integer(v.leaseUntil);
    validateTargetVersion(v.baseVersion, v.target.kind); check(Array.isArray(v.operations) && v.operations.length <= 2000);
    if (v.operations.length) {validateSnapshot(v.base); check(matches(v.base, v.target));} else check(v.base === undefined);
    let sequence = Number(v.appliedThrough); const operationIds = new Set<string>();
    for (const entry of v.operations) {
        const op = object(entry); id(op.id); check(!operationIds.has(op.id)); operationIds.add(op.id); integer(op.sequence);
        check(Number(op.sequence) > sequence && Number(op.sequence) <= Number(v.generation)); sequence = Number(op.sequence); check(op.kind === v.target.kind);
        if (op.kind === 'entity') {only(op, ['id', 'sequence', 'kind', 'snapshot']); validateSnapshot(op.snapshot); check(matches(op.snapshot, v.target));}
        else {only(op, ['id', 'sequence', 'kind', 'command']); validateCommand(op.command);}
    }
    check(Number(v.appliedThrough) <= Number(v.generation));
    if (v.recoveredGeneration !== undefined) {integer(v.recoveredGeneration); check(Number(v.recoveredGeneration) <= Number(v.generation));}
    if (v.recoverySource !== undefined) {const s = object(v.recoverySource); only(s, ['id', 'generation']); id(s.id); integer(s.generation); check(s.id !== v.id);}
    const bytes = payloadBytes({base: v.base, operations: v.operations});
    check(bytes === v.payloadBytes && bytes <= RECOVERY_RECORD_LIMIT, 'Invalid recovery payload bytes or size limit.');
}
export function validateRevision(value: unknown): asserts value is RevisionRecord {
    const v = object(value); only(v, ['id', 'version', 'targetKey', 'target', 'createdAt', 'reason', 'sourceSessionId', 'canonicalVersion', 'snapshot', 'payloadBytes']);
    id(v.id); check(v.version === 1); validateTarget(v.target); check(v.targetKey === targetKey(v.target)); integer(v.createdAt); id(v.reason);
    if (v.sourceSessionId !== undefined) id(v.sourceSessionId);
    validateTargetVersion(v.canonicalVersion, v.target.kind); validateSnapshot(v.snapshot); check(matches(v.snapshot, v.target));
    check(v.payloadBytes === payloadBytes(v.snapshot), 'Invalid revision payload bytes.');
}
