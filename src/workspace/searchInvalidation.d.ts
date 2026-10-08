import type Dexie from 'dexie';
import type {Transaction} from 'dexie';
import type {SearchState} from '../react/workspace/searchIndexTypes';
export const SEARCH_SCHEMA: Record<string, string>;
export function initialSearchState(): SearchState;
export function initializeSearchState(transaction: Transaction): Promise<void>;
export function installSearchInvalidation(db: Dexie): void;
export function invalidateSearch(db: Dexie): Promise<void>;
