import {RichText} from '@blocksuite/blocks';
import {DocCollection} from '@blocksuite/store';
import type {RichBlock, RichKind, RichRun, RichContent} from '../../workspace/pageTypes';
import type {ContentSession} from './pageEditorSession';
import {validateRichContent} from './richContent';

export function mountManualRichText(host: HTMLElement, initial: RichContent, onChange: (value: RichContent) => void, onError: (e: unknown) => void) {
    let value = structuredClone(initial);
    const history: RichContent[] = [], listeners = new Set<(id: string) => void>();
    const notify = () => {onChange(structuredClone(value)); listeners.forEach(fn => fn('manual'));};
    return mountCanonicalRichText(host, 'manual', {
        read: () => structuredClone(value),
        edit: (_id, next) => {validateRichContent(next); history.push(value); value = structuredClone(next); notify();},
        undo: async () => {const previous = history.pop(); if (previous) {value = previous; notify();}},
        subscribe: fn => {listeners.add(fn); return () => listeners.delete(fn);}
    }, onError);
}
export function mountCanonicalRichText(host: HTMLElement, entityId: string, session: Pick<ContentSession, 'read' | 'edit' | 'undo' | 'subscribe'>, onError: (e: unknown) => void) {
    const ydoc = new DocCollection.Y.Doc();
    let hydrating = false, disposed = false;
    const rows = new Map<string, {element: HTMLElement; editor: RichText; block: RichBlock; dispose: () => void}>();
    const button = (label: string, action: () => void) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
        b.addEventListener('pointerdown', e => e.preventDefault());
        b.addEventListener('click', () => {try {action();} catch (e) {onError(e);}});
        return b;
    };
    function patchBlock(id: string, update: (b: RichBlock) => RichBlock) {
        const content = session.read(entityId);
        content.blocks = content.blocks.map(b => b.id === id ? update(b) : b);
        session.edit(entityId, content);
    }
    function moveBlock(id: string, direction: -1 | 1) {
        const content = session.read(entityId), index = content.blocks.findIndex(b => b.id === id), next = index + direction;
        if (index < 0 || next < 0 || next >= content.blocks.length) return;
        [content.blocks[index], content.blocks[next]] = [content.blocks[next]!, content.blocks[index]!];
        session.edit(entityId, content);
        rows.get(id)?.element.querySelector<HTMLButtonElement>(direction < 0 ? '[data-move="up"]' : '[data-move="down"]')?.focus();
    }
    function render() {
        if (disposed) return;
        const content = session.read(entityId);
        const currentIds = new Set(content.blocks.map(b => b.id));
        for (const [id, row] of rows) if (!currentIds.has(id)) {row.dispose(); row.element.remove(); rows.delete(id);}
        let listNumber = 0;
        for (const [index, block] of content.blocks.entries()) {
            let row = rows.get(block.id);
            if (!row) {
                const element = document.createElement('section'), toolbar = document.createElement('div');
                element.className = 'brainRichBlock'; toolbar.className = 'brainRichToolbar';
                const editor = new RichText();
                const text = ydoc.getText(block.id);
                editor.yText = text; editor.enableClipboard = false; editor.enableFormat = false; editor.enableUndoRedo = false;
                editor.setAttribute('aria-label', 'Rich text');
                const observeText = (_event: unknown, transaction: {origin: unknown}) => {
                    if (hydrating || transaction.origin === 'brain-hydrate') return;
                    try {patchBlock(block.id, b => ({...b, runs: text.toDelta() as RichRun[]}));} catch (error) {onError(error);}
                };
                text.observe(observeText);
                row = {element, editor, block, dispose: () => text.unobserve(observeText)}; rows.set(block.id, row);
                const kind = document.createElement('select'); kind.setAttribute('aria-label', 'Block type');
                for (const value of ['paragraph', 'heading', 'bullet', 'numbered', 'check', 'quote', 'code']) {
                    const option = document.createElement('option'); option.value = value; option.textContent = value; kind.append(option);
                }
                kind.addEventListener('change', () => patchBlock(block.id, b => ({id: b.id, runs: b.runs, kind: kind.value as RichKind,
                    ...(kind.value === 'heading' ? {level: 2 as const} : {}), ...(kind.value === 'check' ? {checked: false} : {})})));
                toolbar.append(kind);
                const level = document.createElement('select'); level.setAttribute('aria-label', 'Heading level');
                for (const n of [1, 2, 3]) {const option = document.createElement('option'); option.value = String(n); option.textContent = 'Heading ' + n; level.append(option);}
                level.addEventListener('change', () => patchBlock(block.id, b => b.kind === 'heading' ? {...b, level: Number(level.value) as 1 | 2 | 3} : b));
                toolbar.append(level);
                for (const [label, direction, key] of [['Move block up', -1, 'up'], ['Move block down', 1, 'down']] as const) {
                    const move = button(label, () => moveBlock(block.id, direction)); move.dataset.move = key; toolbar.append(move);
                }
                toolbar.append(button('Delete block', () => {
                    if (!window.confirm('Delete this text block? You can undo the last saved text change.')) return;
                    const next = session.read(entityId); next.blocks = next.blocks.filter(b => b.id !== block.id); session.edit(entityId, next);
                    host.querySelector<HTMLButtonElement>('.brainRichAdd')?.focus();
                }));
                for (const [label, attr] of [['Bold', 'bold'], ['Italic', 'italic'], ['Underline', 'underline'], ['Strike', 'strike'], ['Inline code', 'code']]) {
                    toolbar.append(button(label!, () => {
                        const inline = editor.inlineEditor, range = inline?.getInlineRange();
                        if (!inline || !range) return;
                        const active = inline.getFormat(range) as Record<string, unknown>;
                        inline.formatText(range, {[attr!]: !active[attr!]});
                    }));
                }
                toolbar.append(button('Link', () => {
                    const range = editor.inlineEditor?.getInlineRange();
                    if (!range) return;
                    const url = window.prompt('HTTP(S) link');
                    if (!url) return;
                    if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Links must use HTTP or HTTPS.');
                    editor.inlineEditor?.formatText(range, {link: url});
                }));
                toolbar.append(button('Toggle checked', () => patchBlock(block.id, b => b.kind === 'check' ? {...b, checked: !b.checked} : b)));
                element.append(toolbar, editor);
                editor.addEventListener('paste', e => {
                    e.preventDefault(); e.stopImmediatePropagation();
                    const range = editor.inlineEditor?.getInlineRange();
                    if (range) editor.inlineEditor?.insertText(range, e.clipboardData?.getData('text/plain') || '');
                }, true);
                editor.addEventListener('keydown', e => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                        e.preventDefault(); e.stopImmediatePropagation();
                        void session.undo(entityId).catch(onError);
                    }
                }, true);
            }
            row.block = block;
            row.element.dataset.kind = block.kind;
            row.element.dataset.level = String(block.level || 2);
            row.element.dataset.checked = String(block.checked || false);
            listNumber = block.kind === 'numbered' ? listNumber + 1 : 0;
            row.element.dataset.listNumber = String(listNumber);
            row.editor.dataset.listNumber = String(listNumber);
            (row.element.querySelector('[aria-label="Block type"]') as HTMLSelectElement).value = block.kind;
            const level = row.element.querySelector('[aria-label="Heading level"]') as HTMLSelectElement;
            level.hidden = block.kind !== 'heading'; level.value = String(block.level || 2);
            (row.element.querySelector('[data-move="up"]') as HTMLButtonElement).disabled = index === 0;
            (row.element.querySelector('[data-move="down"]') as HTMLButtonElement).disabled = index === content.blocks.length - 1;
            const text = ydoc.getText(block.id);
            if (JSON.stringify(text.toDelta()) !== JSON.stringify(block.runs.filter(r => r.insert))) {
                hydrating = true;
                ydoc.transact(() => {text.delete(0, text.length); text.applyDelta(block.runs);}, 'brain-hydrate');
                hydrating = false;
            }
            // Do not detach an already-mounted rich-text element on each keystroke.
            if (host.children[index] !== row.element) host.insertBefore(row.element, host.children[index] || null);
        }
        if (!host.querySelector('.brainRichAdd')) {
            const add = button('Add paragraph', () => {
                const next = session.read(entityId);
                next.blocks.push({id: crypto.randomUUID(), kind: 'paragraph', runs: []});
                session.edit(entityId, next);
            });
            add.className = 'brainRichAdd'; host.append(add);
            const undo = button('Undo text change', () => {void session.undo(entityId).catch(onError);});
            undo.className = 'brainRichUndo'; host.append(undo);
        }
    }
    render();
    const unsubscribe = session.subscribe(id => {if (id === entityId) render();});
    return () => {disposed = true; unsubscribe(); rows.forEach(row => row.dispose()); rows.clear(); host.replaceChildren(); ydoc.destroy();};
}
