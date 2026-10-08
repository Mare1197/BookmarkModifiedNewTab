import {useCallback, useEffect, useMemo, useState, type ComponentProps} from 'react';
import {
    addEdge,
    Background,
    BackgroundVariant,
    Controls,
    Position,
    ReactFlow,
    ReactFlowProvider,
    applyEdgeChanges,
    applyNodeChanges,
    type Connection,
    type Edge,
    type EdgeChange,
    type Node,
    type NodeChange
} from '@xyflow/react';
import {WorkspaceNode, type WorkspaceNodeData} from './WorkspaceNode';
import {graphProjection} from './brainSelectors';
import {createRelationship, deleteRelationship, removePlacements, updatePlacement} from './workspaceRepository';
import type {BoardReadModel} from './workspaceReadModels';
import {useAssetUrls} from './useAssetUrls';
type FlowSnapshot = Pick<BoardReadModel, 'entities' | 'relationships' | 'assets' | 'placements'>;
type FlowNode = Node<WorkspaceNodeData, 'workspace'>;
const nodeTypes = {workspace: WorkspaceNode};

function nodesFromSnapshot(snapshot: FlowSnapshot, assetUrls: Map<string, string>): FlowNode[] {
    const entityMap = new Map(snapshot.entities.map(entity => [entity.id, entity]));
    return snapshot.placements.flatMap(placement => {
        const entity = entityMap.get(placement.entityId);
        if (!entity) {
            return [];
        }
        return [{
            id: placement.id,
            type: 'workspace',
            position: {x: placement.x, y: placement.y},
            data: {entity, assetUrl: assetUrls.get(entity.id)},
            // Persisted geometry is known even when visibility culling prevents
            // a card from mounting. Fit view must include those placements.
            measured: {width: placement.width, height: placement.height},
            handles: [
                {type: 'target', position: Position.Left, x: -4.5, y: placement.height / 2 - 4.5, width: 9, height: 9},
                {type: 'source', position: Position.Right, x: placement.width - 4.5, y: placement.height / 2 - 4.5, width: 9, height: 9}
            ],
            style: {width: placement.width, height: placement.height},
            zIndex: placement.zIndex,
            ariaLabel: entity.title
        } satisfies FlowNode];
    });
}

function edgesFromSnapshot(snapshot: FlowSnapshot): Edge[] {
    const firstPlacementByEntity = new Map<string, string>();
    snapshot.placements.forEach(placement => {
        if (!firstPlacementByEntity.has(placement.entityId)) {
            firstPlacementByEntity.set(placement.entityId, placement.id);
        }
    });
    return snapshot.relationships.filter(relationship => relationship.confirmed).flatMap(relationship => {
        const source = firstPlacementByEntity.get(relationship.fromEntityId);
        const target = firstPlacementByEntity.get(relationship.toEntityId);
        if (!source || !target) {
            return [];
        }
        return [{
            id: relationship.id,
            source,
            target,
            label: relationship.label || relationship.type,
            type: 'smoothstep',
            style: {stroke: relationship.origin === 'ai-suggested' ? '#9a6dd7' : '#327bf2'},
            ariaLabel: (relationship.label || relationship.type) + ' relationship'
        }];
    });
}

function layoutGraph(nodes: FlowNode[], mode: 'graph' | 'mindmap'): FlowNode[] {
    if (mode === 'graph') {
        return nodes.map((node, index) => ({
            ...node,
            draggable: false,
            data: {...node.data, allowResize: false},
            position: {
                x: 90 + (index % 3) * 310,
                y: 80 + Math.floor(index / 3) * 220
            }
        }));
    }
    const centerX = 470;
    const centerY = 260;
    return nodes.map((node, index) => {
        if (index === 0) {
            return {
                ...node,
                draggable: false,
                data: {...node.data, allowResize: false},
                position: {x: centerX, y: centerY}
            };
        }
        const angle = (Math.PI * 2 * (index - 1)) / Math.max(nodes.length - 1, 1);
        return {
            ...node,
            draggable: false,
            data: {...node.data, allowResize: false},
            position: {x: centerX + Math.cos(angle) * 360, y: centerY + Math.sin(angle) * 220}
        };
    });
}

function WorkspaceFlow({
    activeBoardId,
    refresh,
    snapshot,
    view,
    visibleEntityIds,
    onSelect
}: {
    activeBoardId: string;
    refresh: () => Promise<void>;
    snapshot: FlowSnapshot;
    view: 'canvas' | 'graph' | 'mindmap';
    visibleEntityIds?: Set<string>;
    onSelect: (entityId?: string, placementId?: string) => void;
}) {
    const assetUrls = useAssetUrls(snapshot);
    const flowSnapshot = useMemo(() => view === 'graph' ?
        {...snapshot, ...graphProjection(snapshot.entities, snapshot.relationships, {entityIds: visibleEntityIds, limit: snapshot.entities.length})} : snapshot, [snapshot, view, visibleEntityIds]);
    const sourceNodes = useMemo(() => nodesFromSnapshot(flowSnapshot, assetUrls)
        .filter(node => !visibleEntityIds || visibleEntityIds.has(node.data.entity.id)),
    [assetUrls, flowSnapshot, visibleEntityIds]);
    const sourceEdges = useMemo(() => {
        const visibleNodeIds = new Set(sourceNodes.map(node => node.id));
        return edgesFromSnapshot(flowSnapshot).filter(edge =>
            visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
    }, [flowSnapshot, sourceNodes]);
    const [nodes, setNodes] = useState<FlowNode[]>(sourceNodes);
    const [edges, setEdges] = useState<Edge[]>(sourceEdges);
    useEffect(() => {
        setNodes(view === 'canvas' ? sourceNodes : layoutGraph(sourceNodes, view));
        setEdges(sourceEdges);
    }, [sourceEdges, sourceNodes, view]);

    const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
        setNodes(current => applyNodeChanges(changes, current));
    }, []);
    const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
        setEdges(current => applyEdgeChanges(changes, current));
        changes.filter(change => change.type === 'remove').forEach(change => {
            void deleteRelationship(change.id).then(refresh);
        });
    }, [refresh]);
    const onConnect = useCallback(async (connection: Connection) => {
        if (view !== 'canvas') {
            return;
        }
        const from = snapshot.placements.find(placement => placement.id === connection.source);
        const to = snapshot.placements.find(placement => placement.id === connection.target);
        if (!from || !to) {
            return;
        }
        const relationship = await createRelationship(from.entityId, to.entityId);
        setEdges(current => addEdge({...connection, id: relationship.id, label: relationship.label}, current));
        await refresh();
    }, [refresh, snapshot.placements, view]);

    if (nodes.length === 0) {
        return (
            <div className="workspaceEmpty">
                <h2>This board is empty</h2>
                <p>Add the current tab, a note, or an image to begin.</p>
            </div>
        );
    }

    return (
        <ReactFlow
            aria-label={view === 'canvas' ? 'Board canvas' : view === 'mindmap' ? 'Mind map' : 'Relationship graph'}
            nodes={nodes}
            onlyRenderVisibleElements
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_event, node) => onSelect((node.data as WorkspaceNodeData).entity.id, view === 'canvas' ? node.id : undefined)}
            onPaneClick={() => onSelect()}
            onNodeDragStop={(_event, node) => {
                if (view === 'canvas') {
                    void updatePlacement(node.id, {x: node.position.x, y: node.position.y});
                }
            }}
            onNodesDelete={deleted => {
                if (view === 'canvas') {
                    void removePlacements(deleted.map(node => node.id)).then(refresh);
                }
            }}
            fitView
            minZoom={0.25}
            maxZoom={2}
            nodesDraggable={view === 'canvas'}
            nodesConnectable={view === 'canvas'}
            deleteKeyCode={null}
            multiSelectionKeyCode={['Control', 'Meta']}
        >
            <Background variant={BackgroundVariant.Dots} color="#c8cdd4" gap={18} size={1} />
            <Controls showInteractive={false} />
            <div className="workspaceCanvas__boardLabel">{activeBoardId ? '' : 'Board'}</div>
        </ReactFlow>
    );
}


export default function WorkspaceGraphView(props: ComponentProps<typeof WorkspaceFlow>) {
    return <ReactFlowProvider><WorkspaceFlow {...props} /></ReactFlowProvider>;
}
