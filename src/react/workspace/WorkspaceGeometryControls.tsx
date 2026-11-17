import {useEffect, useRef, useState} from 'react';
import type {BoardPlacement} from '../../workspace/types';

const names = ['x', 'y', 'width', 'height'] as const;
type Values = Record<typeof names[number], string>;
const valuesOf = (p: BoardPlacement): Values => ({x: String(p.x), y: String(p.y), width: String(p.width), height: String(p.height)});

export function WorkspaceGeometryControls({placement, onApply, onReorder}: {
    placement: BoardPlacement;
    onApply: (geometry: {id: string; x: number; y: number; width: number; height: number}) => void;
    onReorder: () => void;
}) {
    const [values, setValues] = useState(() => valuesOf(placement)), dirty = useRef(new Set<string>());
    useEffect(() => {
        const next = valuesOf(placement);
        setValues(current => Object.fromEntries(names.map(name => [name, dirty.current.has(name) ? current[name] : next[name]])) as Values);
    }, [placement.x, placement.y, placement.width, placement.height]);
    return <form className="affineControls" onSubmit={event => {
        event.preventDefault();
        onApply({id: placement.id, x: Number(values.x), y: Number(values.y), width: Number(values.width), height: Number(values.height)});
    }}>{names.map(name => <label key={name}>{name}<input type="number" name={name} value={values[name]} onChange={event => {
        dirty.current.add(name); setValues(current => ({...current, [name]: event.target.value}));
    }} /></label>)}<button>Apply geometry</button><button type="button" onClick={onReorder}>Move section first</button></form>;
}
