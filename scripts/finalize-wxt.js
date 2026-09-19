const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, '.output', 'chrome-mv3');
const target = path.join(root, 'dist');

const assertInsideRoot = candidate => {
    if (!candidate.startsWith(`${root}${path.sep}`)) {
        throw new Error(`Refusing to operate outside the repository: ${candidate}`);
    }
};

assertInsideRoot(source);
assertInsideRoot(target);
if (!fs.existsSync(path.join(source, 'manifest.json'))) {
    throw new Error('WXT output is missing its manifest.');
}
fs.rmSync(target, {recursive: true, force: true});
fs.cpSync(source, target, {recursive: true});
console.log('Copied the WXT Chrome MV3 artifact to dist/.');
