export function LibraryPager({page, label = 'Object pages', itemLabel = 'objects'}: {
    page: {index: number; loading: boolean; refreshing: boolean; error?: Error;
        data?: {hasMore: boolean; total?: number}; next: () => void; previous: () => void; retry: () => void};
    label?: string;
    itemLabel?: string;
}) {
    return <nav aria-label={label}>
        <button type="button" disabled={page.loading || page.index === 0} onClick={page.previous}>Previous page</button>
        <span> Page {page.index + 1}{page.data?.total === undefined ? '' : ' of ' + Math.max(1, Math.ceil(page.data.total / 50))} · 50 {itemLabel} per page </span>
        <button type="button" disabled={page.loading || page.refreshing || !page.data?.hasMore} onClick={page.next}>Next page</button>
        {(page.loading || page.refreshing) && <span role="status">Searching…</span>}
        {page.error && <span role="alert">{page.error.message} <button type="button" onClick={page.retry}>Retry</button></span>}
    </nav>;
}
