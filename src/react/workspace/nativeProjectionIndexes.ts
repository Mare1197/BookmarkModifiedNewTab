import {generateNKeysBetween} from 'fractional-indexing';

// Keep the native layer's first available index; subsequent tail keys use the
// same library as LayerManager without allocating/inserting fake shape models.
export function nativeProjectionIndexes(first: string, count: number): string[] {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid native index count');
    return count ? [first, ...generateNKeysBetween(first, null, count - 1)] : [];
}
