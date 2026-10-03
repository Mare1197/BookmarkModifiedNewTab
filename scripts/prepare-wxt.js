const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {writeThirdPartyNotices} = require('./third-party-notices');

const root = path.resolve(__dirname, '..');
const legacyDist = path.join(root, 'dist');
const publicRoot = path.join(root, '.wxt-legacy');
const legacyTarget = path.join(publicRoot, 'legacy');

const assertInsideRoot = target => {
    if (!target.startsWith(`${root}${path.sep}`)) {
        throw new Error(`Refusing to operate outside the repository: ${target}`);
    }
};

assertInsideRoot(legacyDist);
assertInsideRoot(publicRoot);
assertInsideRoot(legacyTarget);

const build = spawnSync(process.execPath, [path.join(root, 'build.js')], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit'
});
if (build.status !== 0) {
    process.exit(build.status || 1);
}

fs.rmSync(publicRoot, {recursive: true, force: true});
fs.mkdirSync(legacyTarget, {recursive: true});
fs.cpSync(legacyDist, legacyTarget, {recursive: true});
writeThirdPartyNotices(root, path.join(publicRoot, 'THIRD_PARTY_NOTICES.txt'));
console.log('Prepared the legacy compatibility build for WXT.');
