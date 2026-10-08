// Keep the bundler-specific entry separate from the injectable worker service.
export function createBundledSearchWorker() {
    const worker = new Worker(new URL('./searchWorker.ts', import.meta.url), {type: 'module'});
    if (import.meta.env.DEV) worker.addEventListener('message', event => {
        const response = event.data;
        console.debug('[local search]', {type: response.type, scanned: response.scanned,
            processed: response.state?.processed, pending: response.state?.pending, generation: response.generation});
    });
    return worker;
}
