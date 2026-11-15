const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const filename = (directory, key) => path.join(directory, 'native-failure-' + createHash('sha256').update(key).digest('hex') + '.json');
function hasProbeFailure(directory, key) {return fs.existsSync(filename(directory, key));}
function recordProbeFailure(directory, key) {
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(filename(directory, key), JSON.stringify({key, reason: 'Earlier capacity probe failed'}));
}
module.exports = {hasProbeFailure, recordProbeFailure};
