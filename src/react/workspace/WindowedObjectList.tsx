import {useEffect, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {getWindowRange} from './windowRange';

export function WindowedObjectList<T extends {id: string}>({items, render, selectedId, listKey, label}: {
    items: T[]; render: (item: T, index: number) => ReactNode; selectedId?: string; listKey: string; label: string;
}) {
    const root = useRef<HTMLDivElement>(null), rows = useRef(new Map<string, HTMLDivElement>());
    const [scrollTop, setScrollTop] = useState(0), [viewportHeight, setViewportHeight] = useState(360);
    const [focusedId, setFocusedId] = useState<string>(), [draggedId, setDraggedId] = useState<string>();
    const [pendingFocus, setPendingFocus] = useState<string>();
    const rowHeight = 36;
    const scrollTo = (index: number) => {
        const element = root.current;
        if (!element || index < 0) return;
        const top = index * rowHeight;
        if (top < element.scrollTop) element.scrollTop = top;
        else if (top + rowHeight > element.scrollTop + element.clientHeight) element.scrollTop = top + rowHeight - element.clientHeight;
        setScrollTop(element.scrollTop);
    };
    useEffect(() => {
        const element = root.current;
        if (!element) return;
        const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
        observer.observe(element); setViewportHeight(element.clientHeight);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {if (root.current) root.current.scrollTop = 0; setScrollTop(0); setFocusedId(undefined);}, [listKey]);
    const selectedIndex = items.findIndex(item => item.id === selectedId);
    useEffect(() => {scrollTo(selectedIndex);}, [selectedId, listKey, selectedIndex]);
    useLayoutEffect(() => {
        if (pendingFocus) {rows.current.get(pendingFocus)?.querySelector('button')?.focus(); setPendingFocus(undefined);}
    }, [pendingFocus]);
    const range = getWindowRange({count: items.length, rowHeight, viewportHeight, scrollTop,
        pinnedIndices: [focusedId, draggedId].map(id => items.findIndex(item => item.id === id))});
    const rowId = (target: EventTarget) => (target as HTMLElement).closest<HTMLElement>('[data-window-row]')?.dataset.windowRow;
    return <div ref={root} className="workspaceExplorer__tree windowedObjectList" role="tree" aria-label={label}
        style={{height: Math.min(360, Math.max(rowHeight, items.length * rowHeight))}}
        onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
        onFocusCapture={event => setFocusedId(rowId(event.target))}
        onBlurCapture={event => {if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(undefined);}}
        onDragStartCapture={event => setDraggedId(rowId(event.target))} onDragEndCapture={() => setDraggedId(undefined)}
        onDropCapture={() => setDraggedId(undefined)}
        onKeyDown={event => {
            const current = items.findIndex(item => item.id === rowId(event.target));
            if (current < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
                Math.max(0, Math.min(items.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
            const id = items[next]?.id;
            setFocusedId(id); scrollTo(next); setPendingFocus(id);
        }}>
        <div style={{height: range.height, position: 'relative'}}>
            {range.indices.map(index => {const item = items[index]!; return <div key={item.id} data-window-row={item.id}
                ref={element => {if (element) rows.current.set(item.id, element); else rows.current.delete(item.id);}}
                style={{position: 'absolute', top: index * rowHeight, height: rowHeight, width: '100%'}}>{render(item, index)}</div>;})}
        </div>
    </div>;
}
