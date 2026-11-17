interface Geometry {x: number; y: number; width: number; height: number}

// Native collapse writes the compact display height to xywh. Keep the expanded
// height separately so that decoration never becomes a canonical resize.
export function createNativeReferenceGeometry(placements: ReadonlyArray<{id: string; height: number}>, collapsed: ReadonlyMap<string, boolean>) {
    const states = new Map(placements.map(p => [p.id, {height: p.height, collapsed: Boolean(collapsed.get(p.id))}]));
    return {
        observe(id: string, geometry: Geometry, isCollapsed: boolean) {
            const state = states.get(id);
            if (!state) throw new Error('Unknown native reference');
            const expanding = state.collapsed && !isCollapsed;
            if (!isCollapsed && !expanding) state.height = geometry.height;
            state.collapsed = isCollapsed;
            return {geometry: {...geometry, height: state.height},
                restoreHeight: expanding && geometry.height !== state.height ? state.height : undefined};
        }
    };
}
