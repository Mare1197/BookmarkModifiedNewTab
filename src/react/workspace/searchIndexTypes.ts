import type {LibraryQuery} from './libraryQueryTypes';
export type SearchDialect = LibraryQuery['dialect'];
export type SearchControl = 'pause' | 'resume' | 'rebuild' | 'retry';
export interface SearchState {
    key: 'main'; format: 2; locale: string; generation: number; indexedGeneration: number;
    buildGeneration: number; processed: number; leaseUntil: number; fence: number; epoch: string;
    status: 'unbuilt' | 'building' | 'ready' | 'paused' | 'error'; total?: number; owner: string;
    lastId?: string; scanComplete: boolean; lastError?: string;
}
export type SearchStatus = SearchState & {pending: number};
export interface SearchLease {owner: string; fence: number; epoch: string}
export interface SearchChange {id: string; entityId?: string; generation: number; kind: 'entity' | 'reset'}
export interface SearchDocument {
    id: string; epoch: string; generation: number; fingerprint: string;
    grams: string[]; overflowDialects: SearchDialect[];
}
