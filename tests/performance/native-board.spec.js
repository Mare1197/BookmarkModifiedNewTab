const path = require('node:path');
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {test, expect} = require('@playwright/test');
const {runOwnedNativeProbe} = require('../helpers/nativeProbeRunner');
const {hasProbeFailure, recordProbeFailure} = require('../helpers/nativeProbeFailures');
const sizes = (process.env.NATIVE_SIZES || '50,250,500,1000').split(',').map(Number);
const modes = (process.env.NATIVE_MODES || 'document,canvas,mixed').split(',');
const samples = Number(process.env.NATIVE_SAMPLES || 5);
const extensionPath = path.resolve(process.env.WORKSPACE_EXTENSION_PATH || 'dist');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
const sourceRevision = process.env.NATIVE_SOURCE_REVISION || revision;
const dirty = Boolean(execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim());
const artifactHash = () => {
    const hash = createHash('sha256');
    const walk = directory => {for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else {hash.update(path.relative(extensionPath, file).replaceAll('\\', '/')); hash.update(fs.readFileSync(file));}
    }};
    walk(extensionPath); return hash.digest('hex');
};
const artifactDigest = artifactHash();
const librarySizes = (process.env.NATIVE_LIBRARY_SIZES || '').split(',').filter(Boolean).map(Number);
if (!Number.isInteger(samples) || samples < 1 || samples > 5) throw new Error('Invalid samples');
for (const count of sizes) for (const mode of modes) for (let sample = 0; sample < samples; sample++) {
    test(`native ${mode} ${count} sample ${sample + 1}`, async ({}, info) => {
        test.setTimeout(200000);
        test.skip(hasProbeFailure(info.project.outputDir, mode + '/' + count), 'Earlier capacity probe failed; preserve failure and avoid repeated hangs');
        const result = await runOwnedNativeProbe({extensionPath, referenceCount: count, mode, sample, timeoutMs: 180000, label: 'native-baseline'});
        console.log('NATIVE_RESULT ' + JSON.stringify({sourceRevision, harnessRevision: revision, dirty, artifactDigest, count, mode, sample, ...result}));
        await info.attach('native-metrics', {body: JSON.stringify(result, null, 2), contentType: 'application/json'});
        if (!result.ok) recordProbeFailure(info.project.outputDir, mode + '/' + count);
        expect(result.ok, JSON.stringify(result.errors)).toBe(true);
        expect(artifactHash()).toBe(artifactDigest);
    });
}
for (const librarySize of librarySizes) for (let sample = 0; sample < samples; sample++) {
    test(`fixed 50 native references in library ${librarySize} sample ${sample + 1}`, async ({}, info) => {
        test.setTimeout(320000);
        test.skip(hasProbeFailure(info.project.outputDir, 'library/' + librarySize), 'Earlier library probe failed');
        const result = await runOwnedNativeProbe({extensionPath, referenceCount: 50, mode: 'canvas', sample,
            librarySize, timeoutMs: 300000, label: 'native-library-baseline'});
        console.log('NATIVE_RESULT ' + JSON.stringify({sourceRevision, harnessRevision: revision, dirty, artifactDigest,
            count: 50, mode: 'canvas', librarySize, sample, ...result}));
        await info.attach('native-metrics', {body: JSON.stringify(result, null, 2), contentType: 'application/json'});
        if (!result.ok) recordProbeFailure(info.project.outputDir, 'library/' + librarySize);
        expect(result.ok, JSON.stringify(result.errors)).toBe(true);
        expect(artifactHash()).toBe(artifactDigest);
    });
}
