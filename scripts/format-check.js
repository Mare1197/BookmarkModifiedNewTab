const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const roots = ['src', 'entrypoints', 'tests', 'scripts', '.github'];
const rootFiles = ['background.js', 'build.js', 'eslint.config.js', 'index.html', 'manifest.json',
    'package.json', 'playwright.config.js', 'popup.html', 'popup.js', 'style.css'];
const extensions = new Set(['.css', '.html', '.js', '.json', '.ts', '.tsx', '.yml', '.yaml']);
const failures = [];

const checkFile = file => {
    const contents = fs.readFileSync(file, 'utf8');
    contents.split(/\r?\n/).forEach((line, index) => {
        if (/[ \t]+$/.test(line)) {
            failures.push(`${path.relative(root, file)}:${index + 1}: trailing whitespace`);
        }
    });
};

const walk = directory => {
    if (!fs.existsSync(directory)) {
        return;
    }
    fs.readdirSync(directory, {withFileTypes: true}).forEach(entry => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walk(target);
        } else if (extensions.has(path.extname(entry.name))) {
            checkFile(target);
        }
    });
};

roots.forEach(directory => walk(path.join(root, directory)));
rootFiles.forEach(file => {
    const target = path.join(root, file);
    if (fs.existsSync(target)) {
        checkFile(target);
    }
});

if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
} else {
    console.log('Formatting checks passed.');
}
