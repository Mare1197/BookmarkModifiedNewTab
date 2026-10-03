import type {PageCommand, PagePresentation, PageVersion, PlacementPresentation, RichContent} from './pageTypes';
import type {BoardPlacement} from './types';

export const RECOVERY_RECORD_LIMIT = 5 * 1024 * 1024;
export const RECOVERY_TOTAL_LIMIT = 50 * 1024 * 1024;
export const PRIVATE_RECOVERY_TABLES = ['workspaceDrafts', 'workspaceRevisions'] as const;
export type Target = {kind: 'entity' | 'page'; id: string};
export type TargetVersion = {kind: 'entity'; revision: number} | {kind: 'page'; value: PageVersion};
export type ContentSnapshot = {kind: 'entity'; entityId: string; title: string; content: RichContent};
export type PlacementSnapshot = Pick<BoardPlacement, 'id' | 'entityId' | 'kind' | 'x' | 'y' | 'width' | 'height' | 'zIndex'> & {page: PlacementPresentation};
export type LayoutSnapshot = {kind: 'page'; boardId: string; placements: PlacementSnapshot[]; presentation: PagePresentation};
export type RecoverySnapshot = ContentSnapshot | LayoutSnapshot;
export type DraftOperation = {id: string; sequence: number} & (
    {kind: 'entity'; snapshot: ContentSnapshot} | {kind: 'page'; command: PageCommand});
export interface DraftRecord {
    id: string; version: 1; sessionId: string; targetKey: string; target: Target; boardId?: string;
    generation: number; appliedThrough: number; base?: RecoverySnapshot; baseVersion: TargetVersion;
    operations: DraftOperation[]; updatedAt: number; leaseUntil: number; payloadBytes: number;
    recoveredGeneration?: number; recoverySource?: {id: string; generation: number};
}
export interface RevisionRecord {
    id: string; version: 1; targetKey: string; target: Target; createdAt: number; reason: string;
    sourceSessionId?: string; canonicalVersion: TargetVersion; snapshot: RecoverySnapshot; payloadBytes: number;
}
export type DraftSummary = Omit<DraftRecord, 'base' | 'operations'> & {operationCount: number};
export type RevisionSummary = Omit<RevisionRecord, 'snapshot'>;
export type HistoryCursor = {createdAt: number; id: string};
export type HistoryPage = {items: RevisionSummary[]; next?: HistoryCursor};
export interface DraftPreview {
    record: DraftRecord; current?: RecoverySnapshot; currentVersion?: TargetVersion;
    proposed?: RecoverySnapshot; activeElsewhere: boolean; blockers: string[];
}
export type Resolution = {kind: 'keep-current'} | {kind: 'use-draft'} | {kind: 'manual'; snapshot: ContentSnapshot};
