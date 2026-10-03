import {workspaceClient as db} from './workspaceClient';
import {addPageReference, openWorkspacePage} from './pageRepository';
import type {AssetRecord, WorkspaceEntity} from '../../workspace/types';

export const PAGE_FILE_LIMIT = 25 * 1024 * 1024;
const rasterTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];
export function validatePageFile(file: Pick<File, 'name' | 'size' | 'type'>) {
    if (!file.name || file.name.length > 1000 || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > PAGE_FILE_LIMIT) {
        throw new Error('Choose a named file no larger than 25 MiB.');
    }
    if (/\.(?:html?|svgz?|[cm]?js|jsx|exe|com|bat|cmd|ps1|sh|xhtml|mhtml|xml)$/i.test(file.name.trim()) ||
        /(?:html|svg|javascript|ecmascript|x-msdownload|x-sh|xml)/i.test(file.type)) {
        throw new Error('This active file format is not supported. Choose an inert document or raster image.');
    }
}
export async function isSafeRaster(asset: Pick<AssetRecord, 'blob' | 'mimeType'>): Promise<boolean> {
    if (!(asset.blob instanceof Blob) || !rasterTypes.includes(asset.mimeType)) return false;
    const b = new Uint8Array(await asset.blob.slice(0, 32).arrayBuffer());
    const ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
    switch (asset.mimeType) {
        case 'image/png': return b.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v) && ascii(12, 16) === 'IHDR';
        case 'image/jpeg': return b[0] === 255 && b[1] === 216 && b[2] === 255;
        case 'image/gif': return ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
        case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
        case 'image/avif': return ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12));
        default: return false;
    }
}
export async function addPageFile(boardId: string, file: File): Promise<{entityId: string; assetId: string}> {
    validatePageFile(file);
    const raster = await isSafeRaster({blob: file, mimeType: file.type});
    const time = Date.now(), entityId = 'file:' + crypto.randomUUID(), assetId = 'asset:' + crypto.randomUUID();
    const type = raster ? 'image' : 'file';
    const entity: WorkspaceEntity = {id: entityId, type, title: file.name, createdAt: time, updatedAt: time,
        searchTerms: file.name.toLocaleLowerCase().split(/\W+/).filter(Boolean), metadata: {sourceKind: 'user', mimeType: file.type, size: file.size}};
    // File bytes are canonical once. Unknown/incorrect MIME always gets a download-only blob.
    const mimeType = raster ? file.type : 'application/octet-stream';
    const blob = new Blob([file], {type: mimeType});
    await db.transaction('rw', [db.entities, db.assets, db.placements, db.boards, db.settings, db.relationships, db.activities, db.workspaceRevisions], async () => {
        await openWorkspacePage(boardId);
        await db.entities.add(entity);
        await db.assets.add({id: assetId, entityId, type, name: file.name, size: file.size, mimeType, blob, createdAt: time, updatedAt: time});
        await addPageReference(boardId, entityId);
        await db.activities.add({id: 'activity:' + crypto.randomUUID(), boardId, entityId, type: 'page-file-added',
            summary: 'Added local file', createdAt: time});
    });
    return {entityId, assetId};
}
export async function loadPageAsset(entityId: string): Promise<AssetRecord | undefined> {
    return db.assets.where('entityId').equals(entityId).first();
}
