import {workspaceClient} from './workspaceClient';
import {readLibraryPage, readLibraryPosition} from './libraryQueryEngine';
import type {LibraryQuery, LibraryReadOptions, LibraryCursor} from './libraryQueryTypes';

export function queryLibraryPage(query: LibraryQuery, options: LibraryReadOptions = {}) {
    return readLibraryPage(workspaceClient, query, options);
}
export function queryLibraryPosition(query: LibraryQuery, index: number, cursors: Array<LibraryCursor | undefined>, options: LibraryReadOptions = {}) {
    return readLibraryPosition(workspaceClient, query, index, cursors, options);
}
