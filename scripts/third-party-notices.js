const fs = require('node:fs');
const path = require('node:path');

// Generated from the locked, installed production dependencies, never fetched at build time.
function writeThirdPartyNotices(root, destination) {
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    const notices = [
        '# Third-party notices',
        'New Tab OS includes the following open-source packages. Their licenses apply to their respective code.',
        'BlockSuite 0.19.5 is unmodified upstream MPL-2.0 software. Our replaceable adapter is separate.',
        'BlockSuite source is included in the versioned npm source archives linked below (src/ directories).',
        'Mozilla Public License 2.0: https://www.mozilla.org/en-US/MPL/2.0/',
        'The application does not impose additional restrictions on recipients of MPL-covered source.'
    ];
    for (const [directory, entry] of Object.entries(lock.packages)) {
        if (!directory || entry.dev) continue;
        const packagePath = path.join(root, directory);
        const manifest = path.join(packagePath, 'package.json');
        if (!fs.existsSync(manifest)) continue;
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        notices.push('\n## ' + pkg.name + ' ' + pkg.version,
            'License: ' + (typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license || entry.license || 'See source archive')),
            'Source archive: ' + (entry.resolved || 'See package repository'),
            'Repository: ' + (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || 'See source archive'));
        const includeLicenses = directoryPath => {
            for (const file of fs.readdirSync(directoryPath, {withFileTypes: true})) {
                if (file.isFile() && /^(licen[cs]e|copying|notice)(\.|$)/i.test(file.name)) {
                    notices.push('\n' + fs.readFileSync(path.join(directoryPath, file.name), 'utf8'));
                } else if (file.isDirectory() && file.name !== 'node_modules' && file.name !== 'dist') {
                    includeLicenses(path.join(directoryPath, file.name));
                }
            }
        };
        includeLicenses(packagePath);
    }
    fs.writeFileSync(destination, notices.join('\n\n') + '\n');
}

module.exports = {writeThirdPartyNotices};
