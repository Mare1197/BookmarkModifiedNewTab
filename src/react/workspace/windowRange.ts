export function getWindowRange({count, rowHeight, viewportHeight, scrollTop, overscan = 5, pinnedIndices = []}: {
    count: number; rowHeight: number; viewportHeight: number; scrollTop: number; overscan?: number; pinnedIndices?: number[];
}) {
    const size = Math.max(0, Math.floor(count)), height = size * rowHeight;
    if (!size || rowHeight <= 0) return {indices: [], height: 0};
    const top = Math.max(0, Math.min(scrollTop, Math.max(0, height - viewportHeight)));
    const start = Math.max(0, Math.floor(top / rowHeight) - overscan);
    const end = Math.min(size, Math.ceil((top + viewportHeight) / rowHeight) + overscan);
    const indices = new Set(Array.from({length: Math.max(0, end - start)}, (_, i) => start + i));
    for (const index of pinnedIndices) if (Number.isInteger(index) && index >= 0 && index < size) indices.add(index);
    return {indices: [...indices].sort((a, b) => a - b), height};
}
