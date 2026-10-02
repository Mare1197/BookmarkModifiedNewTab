const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {workspaceFixture} = require('./helpers/workspaceFixture');
test('conflict snapshots expose link-only and page presentation changes as inert text', async t => {
    const {load} = await workspaceFixture(t), {SnapshotView} = load('recoveryUi.tsx');
    const render = snapshot => renderToStaticMarkup(React.createElement(SnapshotView, {snapshot}));
    const note = link => ({kind: 'entity', entityId: 'n', title: 'Note', content: {version: 1, blocks: [
        {id: 'b', kind: 'heading', level: 3, runs: [{insert: 'Same text', attributes: {link}}]}]}});
    const current = render(note('https://old.example')), draft = render(note('https://new.example'));
    assert.notEqual(current, draft); assert.match(draft, /https:\/\/new.example/); assert.doesNotMatch(draft, /<a /);
    const page = await load('pageRepository.ts').createWorkspacePage('Page');
    const snapshot = load('revisionRepository.ts').layoutSnapshot(page);
    snapshot.presentation.groups.push({id: 'g', label: 'Changed group', collapsed: true});
    const markup = render(snapshot); assert.match(markup, /Changed group/); assert.match(markup, /collapsed/);
});
