import type {RecoverySnapshot} from '../../workspace/recoveryTypes';
export function downloadRecovery(value: unknown, filename: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SnapshotView({snapshot}: {snapshot?: RecoverySnapshot}) {
    if (!snapshot) return <p>Unavailable. Export the draft or restore its board from Trash.</p>;
    if (snapshot.kind === 'page') return <div><p>{snapshot.placements.length} references · {snapshot.presentation.groups.length} groups · {snapshot.presentation.connectors.length} connectors · {snapshot.presentation.mode}</p>
        <ul>{snapshot.placements.map(p => <li key={p.id}>{p.entityId} · ({p.x}, {p.y}) · {p.width} × {p.height}</li>)}</ul></div>;
    return <div><h4>{snapshot.title}</h4>{snapshot.content.blocks.map(block => <div className={'recoveryBlock ' + block.kind} key={block.id}>
        <small>{block.kind}{block.checked ? ' · checked' : ''}</small>
        <p>{block.runs.map((run, i) => <span key={i} style={{fontWeight: run.attributes?.bold ? 700 : undefined,
            fontStyle: run.attributes?.italic ? 'italic' : undefined, textDecoration: [run.attributes?.underline ? 'underline' : '', run.attributes?.strike ? 'line-through' : ''].join(' '),
            fontFamily: run.attributes?.code || block.kind === 'code' ? 'monospace' : undefined}}>{run.insert}</span>)}</p>
    </div>)}</div>;
}
