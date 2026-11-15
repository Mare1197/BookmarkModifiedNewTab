const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {fork, execFile} = require('node:child_process');
const {performance} = require('node:perf_hooks');

async function runOwnedNativeProbe(options, dependencies = {}) {
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 900000) throw new Error('Invalid probe deadline');
    const started = performance.now();
    const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), 'newtab-native-probe-'));
    const child = fork(dependencies.workerPath || path.join(__dirname, 'nativeProbeWorker.js'), [], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: {...process.env, ...dependencies.workerEnv}
    });
    let result, timedOut = false, output = '', killError;
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal})));
    const errors = [];
    child.on('error', error => errors.push(error.message));
    child.stdout.on('data', data => {output = (output + data).slice(-16000);});
    child.stderr.on('data', data => {output = (output + data).slice(-16000);});
    child.on('message', message => {
        if (message?.type === 'result') result = message.result;
        if (message?.type === 'progress') result = {ok: false, metrics: message.metrics, errors: []};
    });
    const timeout = new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), options.timeoutMs);
        exited.then(() => clearTimeout(timer));
    });
    try {
        dependencies.onStart?.({pid: child.pid, profilePath});
        child.send({...options, profilePath});
        let exit = await Promise.race([exited, timeout]);
        if (!exit) {
            timedOut = true;
            // PID comes only from our live fork. The parent remains alive through
            // browser teardown so Windows tree termination includes owned Chromium.
            if (process.platform === 'win32') await new Promise(resolve => {
                execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true, timeout: 5000}, error => {
                    if (error && child.exitCode === null && child.signalCode === null) killError = error.message;
                    resolve();
                });
            });
            else child.kill('SIGKILL');
            exit = await Promise.race([exited, new Promise(resolve => {const timer = setTimeout(() => resolve(null), 2000); timer.unref();})]);
        }
        if (!exit || killError) errors.push(killError || 'Owned worker did not exit');
        if (!exit) throw new Error(`Owned worker still active; profile retained at ${profilePath}`);
        if (timedOut) errors.push('Probe deadline exceeded, including teardown');
        if (!result) errors.push('Probe exited without a result');
        if (exit && exit.code !== 0 && !timedOut) errors.push(`Probe exited ${exit.code ?? exit.signal}`);
        return {ok: Boolean(result?.ok && exit?.code === 0 && !timedOut && !errors.length), timedOut,
            metrics: result?.metrics || {}, errors: [...(result?.errors || []), ...errors], output,
            elapsedMs: performance.now() - started};
    } finally {
        // This exact directory was created above; never remove a caller path.
        const resolved = path.resolve(profilePath), parent = path.resolve(os.tmpdir());
        if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('newtab-native-probe-')) throw new Error('Unsafe profile cleanup');
        if (child.exitCode !== null || child.signalCode !== null) await fs.rm(resolved, {recursive: true, force: true, maxRetries: 3, retryDelay: 200});
    }
}
module.exports = {runOwnedNativeProbe};
