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
    let result, timedOut = false, output = '', supervisorException = false;
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal})));
    const errors = [];
    child.on('error', error => errors.push(error.message));
    child.stdout.on('data', data => {output = (output + data).slice(-16000);});
    child.stderr.on('data', data => {output = (output + data).slice(-16000);});
    child.on('message', message => {
        if (message?.type === 'result') result = message.result;
        if (message?.type === 'progress') result = {ok: false, metrics: message.metrics, errors: []};
    });
    let timer;
    const timeout = new Promise(resolve => {timer = setTimeout(() => resolve(null), options.timeoutMs);});
    let exit;
    const terminate = async () => {
        try {
            if (dependencies.terminateOwned) await dependencies.terminateOwned(child);
            // PID comes only from our fork. Never accept a caller-supplied PID.
            else if (process.platform === 'win32') await new Promise((resolve, reject) => {
                execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true, timeout: 5000}, error => {
                    if (error && child.exitCode === null && child.signalCode === null) reject(error);
                    else resolve();
                });
            });
            else child.kill('SIGKILL');
        } catch (error) {errors.push('Owned worker termination: ' + error.message);}
        return Promise.race([exited, new Promise(resolve => {const wait = setTimeout(() => resolve(null), 2000); wait.unref();})]);
    };
    try {
        dependencies.onStart?.({pid: child.pid, profilePath});
        child.send({...options, profilePath});
        exit = await Promise.race([exited, timeout]);
        if (!exit) {
            timedOut = true;
            exit = await terminate();
        }
        if (timedOut) errors.push('Probe deadline exceeded, including teardown');
        if (!result) errors.push('Probe exited without a result');
        if (exit && exit.code !== 0 && !timedOut) errors.push(`Probe exited ${exit.code ?? exit.signal}`);
    } catch (error) {
        supervisorException = true; errors.push('Supervisor error: ' + error.message);
        if (child.exitCode === null && child.signalCode === null) exit = await terminate();
    } finally {clearTimeout(timer);}
    const workerStillRunning = child.exitCode === null && child.signalCode === null;
    let retainedProfilePath = profilePath;
    if (workerStillRunning) errors.push(`Owned worker still active; profile retained at ${profilePath}`);
    else try {
        // This exact directory was created above; never remove a caller path.
        const resolved = path.resolve(profilePath), parent = path.resolve(os.tmpdir());
        if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('newtab-native-probe-')) throw new Error('Unsafe profile cleanup');
        if (dependencies.removeProfile) await dependencies.removeProfile(resolved);
        else await fs.rm(resolved, {recursive: true, force: true, maxRetries: 3, retryDelay: 200});
        retainedProfilePath = undefined;
    } catch (error) {supervisorException = true; errors.push('Owned profile cleanup: ' + error.message);}
    return {ok: Boolean(result?.ok && exit?.code === 0 && !timedOut && !errors.length), timedOut,
        workerStillRunning, supervisorException, retainedProfilePath, ownedPid: child.pid,
        metrics: result?.metrics || {}, errors: [...(result?.errors || []), ...errors], output,
        elapsedMs: performance.now() - started};
}
module.exports = {runOwnedNativeProbe};
