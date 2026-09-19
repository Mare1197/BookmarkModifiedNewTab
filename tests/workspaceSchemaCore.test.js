const assert = require('node:assert/strict');
const test = require('node:test');

const fixture = require('./fixtures/extension-profile.json');
const schemaCore = require('../src/workspace/schemaCore.js');

const clone = value => JSON.parse(JSON.stringify(value));

test('canonicalizes page URLs without discarding functional query state', () => {
    assert.equal(
        schemaCore.canonicalizeUrl('HTTPS://Example.TEST:443/a//b/?utm_source=x&view=grid&q=two#section'),
        'https://example.test/a/b?q=two&view=grid'
    );
    assert.equal(schemaCore.canonicalizeUrl('chrome://extensions'), '');
    assert.equal(schemaCore.canonicalizeUrl('data:text/plain,hello'), '');
});

test('reuses one page entity for duplicate bookmark sources', () => {
    const input = clone(fixture);
    input.bookmarksTree[0].children[1].children.push({
        id: '105',
        parentId: '2',
        title: 'Article duplicate',
        url: 'https://example.test/article?utm_campaign=duplicate'
    });
    const plan = schemaCore.buildLegacyMigrationPlan({
        bookmarkTree: input.bookmarksTree,
        legacyData: {},
        now: 1787155200000
    });

    const articleEntities = plan.operations.entities.filter(entity =>
        entity.canonicalUrl === 'https://example.test/article');
    const articleSources = plan.operations.sourceRefs.filter(source =>
        source.entityId === articleEntities[0].id);
    assert.equal(articleEntities.length, 1);
    assert.equal(articleSources.length, 2);
});

test('reports malformed documents and legacy positions without mutating inputs', () => {
    const input = clone(fixture);
    const malformed = {
        id: '106',
        parentId: '1',
        title: 'Broken document',
        url: `${schemaCore.DOCUMENT_PREFIX}bm90LWEtZG9jdW1lbnQ=`
    };
    input.bookmarksTree[0].children[0].children.push(malformed);
    const legacyData = {
        icons: {
            103: {x: 1, y: 2},
            999: {x: 'left', y: 2}
        },
        locations: {'1,2': '103'}
    };
    const before = clone(legacyData);
    const plan = schemaCore.buildLegacyMigrationPlan({bookmarkTree: input.bookmarksTree, legacyData});

    assert.ok(plan.errors.some(error => error.code === 'malformed-document' && error.recordId === '106'));
    assert.ok(plan.errors.some(error => error.code === 'malformed-layout' && error.recordId === '999'));
    assert.deepEqual(legacyData, before);
});
