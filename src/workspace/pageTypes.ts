export type PageMode = 'document' | 'canvas' | 'mixed';
export type RichKind = 'paragraph' | 'heading' | 'bullet' | 'numbered' | 'check' | 'quote' | 'code';
export interface RichRun {
    insert: string;
    attributes?: {bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; code?: boolean; link?: string};
}
export interface RichBlock {id: string; kind: RichKind; runs: RichRun[]; level?: 1 | 2 | 3; checked?: boolean; language?: string}
export interface RichContent {version: 1; blocks: RichBlock[]}
export interface PageVersion {revision: number; fingerprint: string}
export interface PageGroup {id: string; label: string; parentId?: string; collapsed: boolean}
export interface PageConnector {
    id: string; relationshipId: string; fromPlacementId: string; toPlacementId: string;
    points: Array<{x: number; y: number}>; color: string; dashed: boolean;
    mode: 'straight' | 'orthogonal' | 'curve';
}
export interface PagePresentation {
    version: 1; ownerEntityId: string; revision: number; mode: PageMode;
    viewport: {x: number; y: number; zoom: number}; groups: PageGroup[]; connectors: PageConnector[];
}
export interface PlacementPresentation {
    order: number; groupId?: string; collapsed: boolean; color: 'default' | 'blue' | 'green' | 'yellow' | 'purple';
}
export type PageCommand =
    | {type: 'move-resize'; placements: Array<{id: string; x: number; y: number; width: number; height: number}>}
    | {type: 'reorder'; placementIds: string[]}
    | {type: 'group'; group: PageGroup; placementIds: string[]}
    | {type: 'ungroup'; groupId: string}
    | {type: 'collapse'; placementId?: string; groupId?: string; collapsed: boolean}
    | {type: 'style'; placementIds: string[]; color: PlacementPresentation['color']}
    | {type: 'view'; mode: PageMode; viewport: PagePresentation['viewport']}
    | {type: 'remove-reference'; placementIds: string[]}
    | {type: 'connect'; fromPlacementId: string; toPlacementId: string; relationType: string; label?: string}
    | {type: 'connector-style'; connectorId: string; points: PageConnector['points']; color: string; dashed: boolean; mode: PageConnector['mode']}
    | {type: 'remove-connector'; connectorId: string; scope: 'page' | 'everywhere'};
