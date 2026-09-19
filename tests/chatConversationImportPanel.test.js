const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadPanel() {
    const filename = path.resolve(__dirname, '../src/react/workspace/ConversationImportPanel.tsx');
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}
    }).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)(name => {
        if (name === 'react' || name === 'react/jsx-runtime') return require(name);
        if (name === './chatExportAdapters') return {parseChatExport() { return []; }};
        if (name === './chatImportService') return {
            previewConversationImport: async () => ({newCount: 0, updatedCount: 0, unchangedCount: 0,
                conflictCount: 0, items: [], warnings: [], conversationCount: 0}),
            applyConversationImport: async () => ({imported: 0, conflictPolicy: 'preserve-local'})
        };
        throw new Error('Unexpected import: ' + name);
    }, exports);
    return exports;
}

test('conversation import panel exposes accessible local-file, preview, policy, and apply controls', () => {
    const React = require('react');
    const {renderToStaticMarkup} = require('react-dom/server');
    const {ConversationImportPanel} = loadPanel();
    const html = renderToStaticMarkup(React.createElement(ConversationImportPanel, {
        onImported: async () => {}, onStatus() {}
    }));

    for (const label of ['Conversation export file', 'Paste conversation export JSON', 'Preview import',
        'Conflict policy', 'Preserve local changes', 'Take source values', 'Import conversations']) {
        assert.ok(html.includes(label), label + ' is rendered');
    }
    assert.match(html, /<button[^>]*disabled=""[^>]*>Import conversations<\/button>/);
    assert.ok(html.includes('No provider account access or network calls'));
});
