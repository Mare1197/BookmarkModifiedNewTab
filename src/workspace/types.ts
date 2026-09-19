export type EntityType =
    | 'analysis'
    | 'clip'
    | 'document'
    | 'file'
    | 'folder'
    | 'image'
    | 'note'
    | 'page'
    | 'screenshot'
    | 'task'
    | 'project' | 'conversation' | 'message' | 'website' | 'bookmark'
    | 'browser-visit' | 'tab' | 'search' | 'idea' | 'memory' | 'prompt'
    | 'repository' | 'automation' | 'automation-run' | 'feature' | 'codex-session' | 'commit';

export type SourceKind = 'bookmark' | 'history' | 'legacy' | 'tab' | 'user' | 'ai-chat';
export type RelationshipOrigin = 'ai-suggested' | 'rule-suggested' | 'imported' | 'user';

export interface MemoryPolicy {
    status: 'active' | 'forgotten';
    excludedFromAI: boolean;
    scope: 'project' | 'private';
    reviewedAt?: number;
    reviewBy?: number;
}

export interface WorkspaceEntity {
    id: string;
    type: EntityType;
    title: string;
    canonicalUrl?: string;
    domainId?: string;
    inboxAt?: number;
    createdAt: number;
    updatedAt: number;
    searchTerms: string[];
    tags?: string[];
    properties?: Record<string, string | number | boolean | null>;
    source?: {provider: string; externalId: string; url?: string; createdAt?: number; updatedAt?: number};
    memory?: MemoryPolicy;
    metadata?: Record<string, unknown>;
}

export type WorkspaceTaskStatus = 'backlog' | 'next' | 'in-progress' | 'blocked' | 'done';

export interface WorkspaceTask {
    id: string;
    entityId: string;
    status: WorkspaceTaskStatus;
    dueAt?: number;
    reminderAt?: number;
    recurrence?: string;
    dependencyIds: string[];
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
}

export interface WorkspaceActivity {
    id: string;
    type: string;
    summary: string;
    boardId?: string;
    entityId?: string;
    sessionId?: string;
    createdAt: number;
    metadata?: Record<string, unknown>;
}

export interface SavedFilter {
    id: string;
    name: string;
    query: string;
    createdAt: number;
    updatedAt: number;
}

export interface WorkspaceSessionTab {
    entityId: string;
    title: string;
    url: string;
    index: number;
    pinned: boolean;
}

export interface WorkspaceSession {
    id: string;
    boardId: string;
    name: string;
    tabs: WorkspaceSessionTab[];
    createdAt: number;
    updatedAt: number;
    lastOpenedAt?: number;
}

export type BoardTemplateLayout = 'blank' | 'project' | 'reading' | 'research';

export interface BoardTemplateRecord {
    id: string;
    name: string;
    description: string;
    layout: BoardTemplateLayout;
    builtIn: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface SourceReference {
    id: string;
    sourceKey: string;
    sourceKind: SourceKind;
    sourceId: string;
    entityId: string;
    createdAt: number;
    updatedAt: number;
    metadata?: Record<string, unknown>;
}

export interface DomainRecord {
    id: string;
    host: string;
    createdAt: number;
    updatedAt: number;
}

export interface WorkspaceFolder {
    id: string;
    title: string;
    parentId?: string;
    sourceKind: 'bookmark' | 'workspace';
    sourceId?: string;
    createdAt: number;
    updatedAt: number;
}

export interface FolderMembership {
    id: string;
    folderId: string;
    entityId: string;
    sourceKind: SourceKind;
    position: number;
    createdAt: number;
    updatedAt: number;
}

export interface BoardRecord {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
}

export interface BoardPlacement {
    id: string;
    boardId: string;
    entityId: string;
    kind: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    createdAt: number;
    updatedAt: number;
    metadata?: Record<string, unknown>;
}

export interface RelationshipRecord {
    id: string;
    fromEntityId: string;
    toEntityId: string;
    type: string;
    label?: string;
    origin: RelationshipOrigin;
    confirmed: boolean;
    confidence?: number;
    evidence?: string[];
    generator?: string;
    reviewStatus?: 'pending' | 'accepted' | 'rejected';
    createdAt: number;
    updatedAt: number;
}

export interface TabSessionRecord {
    id: string;
    tabId: number;
    entityId?: string;
    openedAt: number;
    closedAt?: number;
    openedAtSource: 'created-event' | 'first-observed';
    openedFromEntityId?: string;
    metadata?: Record<string, unknown>;
}

export interface AssetRecord {
    id: string;
    entityId: string;
    type: 'file' | 'image' | 'screenshot';
    name: string;
    mimeType: string;
    size: number;
    blob: Blob;
    createdAt: number;
    updatedAt: number;
}

export interface WorkspaceSetting<T = unknown> {
    key: string;
    value: T;
    updatedAt: number;
}

export interface MigrationError {
    code: string;
    recordId?: string;
    message: string;
}

export interface LegacyMigrationReport {
    schemaVersion: number;
    generatedAt: number;
    counts: Record<string, number>;
    errors: MigrationError[];
    layoutSnapshot: unknown;
}
