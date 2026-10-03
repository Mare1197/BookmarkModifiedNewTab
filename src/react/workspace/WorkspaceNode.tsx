import {memo} from 'react';
import {Handle, NodeResizer, Position, type NodeProps} from '@xyflow/react';

import type {WorkspaceEntity} from '../../workspace/types';
import {updatePlacement} from './workspaceRepository';

export interface WorkspaceNodeData extends Record<string, unknown> {
    allowResize?: boolean;
    assetUrl?: string;
    entity: WorkspaceEntity;
}

function displayHost(rawUrl?: string): string {
    try {
        return rawUrl ? new URL(rawUrl).hostname.replace(/^www\./, '') : '';
    } catch {
        return '';
    }
}

export const WorkspaceNode = memo(function WorkspaceNode({data, id, selected}: NodeProps) {
    const nodeData = data as WorkspaceNodeData;
    const {entity} = nodeData;
    const body = String(entity.metadata?.body || '');
    const live = Boolean(entity.metadata?.live);
    return (
        <article className={'workspaceCard workspaceCard--' + entity.type} aria-label={entity.title}>
            <NodeResizer
                color="#327bf2"
                isVisible={selected && nodeData.allowResize !== false}
                minWidth={180}
                minHeight={110}
                handleClassName="workspaceResizeHandle"
                onResizeEnd={(_event, params) => {
                    void updatePlacement(id, {width: params.width, height: params.height});
                }}
            />
            <Handle type="target" position={Position.Left} className="workspaceHandle" />
            <div className="workspaceCard__drag">
                <span className="workspaceCard__type">{entity.type}</span>
                {live && <span className="workspaceCard__live">Live</span>}
            </div>
            {nodeData.assetUrl && (
                <img className="workspaceCard__image" src={nodeData.assetUrl} alt="" />
            )}
            <h3>{entity.title}</h3>
            {body && <p>{body}</p>}
            {entity.canonicalUrl && (
                <span className="workspaceCard__domain">
                    {displayHost(entity.canonicalUrl)}
                </span>
            )}
            <Handle type="source" position={Position.Right} className="workspaceHandle" />
        </article>
    );
});
