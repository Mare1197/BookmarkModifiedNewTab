import {workspaceClient} from './workspaceClient';
import {readLibraryPosition} from './libraryQueryEngine';
import {getSearchWorkerClient} from './searchWorkerClient';
import type {LibraryQuery, LibraryReadOptions, LibraryCursor} from './libraryQueryTypes';

export function queryLibraryPage(query: LibraryQuery, options: LibraryReadOptions = {}) {
    return getSearchWorkerClient().query(query, options);
}
export function queryLibraryPosition(query: LibraryQuery, index: number, cursors: Array<LibraryCursor | undefined>, options: LibraryReadOptions = {}) {
    return readLibraryPosition(workspaceClient, query, index, cursors, options, queryLibraryPage);
}
