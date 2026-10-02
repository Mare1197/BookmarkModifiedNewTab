require('fake-indexeddb/auto');
const {readFileSync, existsSync} = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {createWorkspaceDatabase} = require('../../src/workspace/workspaceDb');

async function workspaceFixture(t) {
    const db = createWorkspaceDatabase('workspace-page-test-' + crypto.randomUUID());
    await db.open();
    t.after(() => db.delete());
    const cache = new Map();
    const browser = {alarms: {create: async () => {}, clear: async () => {}},
        storage: {local: {get: async () => ({}), set: async () => {}}}};
    function module(filename) {
        if (cache.has(filename)) return cache.get(filename);
        const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}
        }).outputText;
        const exports = {};
        cache.set(filename, exports);
        new Function('require', 'exports', compiled)(name => {
            if (name === './workspaceClient') return {workspaceClient: db};
            if (name === 'wxt/browser') return {browser};
            if (!name.startsWith('.')) return require(name);
            const dependency = path.resolve(path.dirname(filename), name + '.ts');
            return module(existsSync(dependency) ? dependency : dependency + 'x');
        }, exports);
        return exports;
    }
    return {db, browser, load: relative => module(path.resolve(__dirname, '../../src/react/workspace', relative))};
}
module.exports = {workspaceFixture};
