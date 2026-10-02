import type {PageCommand} from '../../workspace/pageTypes';

export function createPagePersistenceQueue(deps: {
    flushContent: () => Promise<void>; hasContentDraft: () => boolean; saveCommand: (command: PageCommand) => Promise<void>;
    coalesce?: boolean;
}) {
    const commands: PageCommand[] = [];
    let running: Promise<void> | undefined, inFlight: PageCommand | undefined, closed = false;
    function enqueue(command: PageCommand) {
        if (closed) throw new Error('Editor session is closed.');
        const tail = commands.at(-1);
        if (deps.coalesce !== false && command.type === 'view' && tail?.type === 'view' && tail !== inFlight) commands[commands.length - 1] = command;
        else commands.push(command);
    }
    function flush(): Promise<void> {
        if (closed) return Promise.reject(new Error('Editor session is closed.'));
        if (running) return running;
        running = Promise.resolve().then(async () => {
            do {
                await deps.flushContent();
                if (closed) throw new Error('Editor session is closed.');
                while (commands.length) {
                    inFlight = commands[0]!;
                    await deps.saveCommand(inFlight);
                    commands.shift(); inFlight = undefined;
                    if (closed) throw new Error('Editor session is closed.');
                }
                // Content may arrive while a layout transaction is pending.
            } while (deps.hasContentDraft() || commands.length);
        }).finally(() => {running = undefined; inFlight = undefined;});
        return running;
    }
    return {enqueue, flush, pending: () => structuredClone(commands),
        clearRecovered(count: number) {
            if (running) throw new Error('Wait for the pending save before reconciling recovery.');
            commands.splice(0, count);
        },
        clear() {if (running) throw new Error('Wait for the pending save before discarding.'); commands.length = 0;},
        dispose() {closed = true;}};
}
