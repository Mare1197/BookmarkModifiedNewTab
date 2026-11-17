const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const filename = (directory, key) => path.join(directory, 'native-failure-' + createHash('sha256').update(key).digest('hex') + '.json');
const safetyKey = 'matrix-safety-stop';
function hasProbeFailure(directory, key) {return fs.existsSync(filename(directory, key)) || fs.existsSync(filename(directory, safetyKey));}
function recordProbeFailure(directory, key, reason = 'Earlier capacity probe failed') {
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(filename(directory, key), JSON.stringify({key, reason}));
}
async function runRecordedProbe(directory, key, run) {
    let result;
    try {result = await run();}
    catch (error) {result = {ok: false, metrics: {}, errors: ['Unexpected supervisor error: ' + String(error)], supervisorException: true};}
    if (!result.ok) recordProbeFailure(directory, key, result.errors);
    if (result.workerStillRunning || result.supervisorException) recordProbeFailure(directory, safetyKey, result);
    return result;
}
module.exports = {hasProbeFailure, recordProbeFailure, runRecordedProbe};
