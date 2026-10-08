// Keep the bundler-specific entry separate from the injectable worker service.
export function createBundledSearchWorker() {
    return new Worker(new URL('./searchWorker.ts', import.meta.url), {type: 'module'});
}
