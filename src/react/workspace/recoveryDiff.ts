import type {RichBlock} from '../../workspace/pageTypes';
import type {ContentSnapshot} from '../../workspace/recoveryTypes';
import {validateSnapshot} from './recoveryValidation';
export type TextPart = {kind: 'equal' | 'added' | 'removed'; text: string};
export type BlockDifference = {id: string; before?: RichBlock; after?: RichBlock; text: TextPart[]; formattingChanged: boolean};
const text = (block?: RichBlock) => block?.runs.map(run => run.insert).join('') ?? '';
function textDiff(before: string, after: string): TextPart[] {
    if (before === after) return [{kind: 'equal', text: before}];
    const a = Array.from(before), b = Array.from(after); let start = 0, end = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
    const left = a.slice(start, a.length - end).join('').split(/(?<=\n)/u), right = b.slice(start, b.length - end).join('').split(/(?<=\n)/u);
    const parts: TextPart[] = [];
    const add = (kind: TextPart['kind'], value: string) => {
        if (!value) return; const last = parts.at(-1);
        if (last?.kind === kind) last.text += value; else parts.push({kind, text: value});
    };
    add('equal', a.slice(0, start).join(''));
    if ((left.length + 1) * (right.length + 1) > 200000) {
        add('removed', left.join('')); add('added', right.join(''));
    } else {
        const width = right.length + 1, cells = new Uint32Array((left.length + 1) * width);
        for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) {
            cells[i * width + j] = left[i] === right[j] ? cells[(i + 1) * width + j + 1]! + 1 : Math.max(cells[(i + 1) * width + j]!, cells[i * width + j + 1]!);
        }
        let i = 0, j = 0;
        while (i < left.length || j < right.length) {
            if (i < left.length && j < right.length && left[i] === right[j]) {add('equal', left[i++]!); j++;}
            else if (i < left.length && (j === right.length || cells[(i + 1) * width + j]! >= cells[i * width + j + 1]!)) add('removed', left[i++]!);
            else add('added', right[j++]!);
        }
    }
    add('equal', end ? a.slice(-end).join('') : ''); return parts;
}
const formatting = (block?: RichBlock) => block ? JSON.stringify({...block, runs: block.runs.map(run => ({attributes: run.attributes}))}) : '';
export function diffContent(before: ContentSnapshot, after: ContentSnapshot): BlockDifference[] {
    validateSnapshot(before); validateSnapshot(after);
    if (before.entityId !== after.entityId) throw new Error('Cannot compare different objects.');
    const old = new Map(before.content.blocks.map(block => [block.id, block])), next = new Map(after.content.blocks.map(block => [block.id, block]));
    return [...new Set([...next.keys(), ...old.keys()])].map(id => ({id, before: old.get(id), after: next.get(id),
        text: textDiff(text(old.get(id)), text(next.get(id))), formattingChanged: Boolean(old.has(id) && next.has(id) && formatting(old.get(id)) !== formatting(next.get(id)))}));
}
export function chooseBlocks(current: ContentSnapshot, draft: ContentSnapshot, choices: Array<{id: string; from: 'current' | 'draft'}>, title: string): ContentSnapshot {
    validateSnapshot(current); validateSnapshot(draft);
    if (current.entityId !== draft.entityId) throw new Error('Cannot combine different objects.');
    const ids = new Set<string>();
    const blocks = choices.map(choice => {
        if (ids.has(choice.id)) throw new Error('Duplicate chosen block.'); ids.add(choice.id);
        if (!['current', 'draft'].includes(choice.from)) throw new Error('Invalid block choice.');
        const block = (choice.from === 'current' ? current : draft).content.blocks.find(b => b.id === choice.id);
        if (!block) throw new Error('Chosen block is missing.'); return structuredClone(block);
    });
    const result: ContentSnapshot = {...current, title, content: {version: 1, blocks}};
    validateSnapshot(result); return result;
}
