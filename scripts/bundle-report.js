const fs = require('node:fs');
const path = require('node:path');

function bundleReport(directory) {
    const files = [];
    function visit(current) {
        for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
            const filename = path.join(current, entry.name);
            if (entry.isDirectory()) visit(filename);
            else if (entry.isFile()) files.push({path: path.relative(directory, filename).replaceAll('\\', '/'),
                bytes: fs.statSync(filename).size});
        }
    }
    visit(directory);
    return {totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        files: files.filter(file => /\.(?:js|css|wasm)$/.test(file.path)).sort((a, b) => b.bytes - a.bytes)};
}
if (require.main === module) console.log(JSON.stringify(bundleReport(path.resolve(process.argv[2] || 'dist')), null, 2));
module.exports = {bundleReport};
