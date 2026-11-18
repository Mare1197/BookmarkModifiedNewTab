import {useState} from 'react';
import type {PageCommand, PageConnector} from '../../workspace/pageTypes';

type Style = Pick<PageConnector, 'mode' | 'color' | 'dashed'>;
export function WorkspaceConnectorControls({connector, label, busy, onCommand}: {
    connector: PageConnector; label: string; busy: boolean; onCommand: (command: PageCommand) => Promise<void>;
}) {
    const [draft, setDraft] = useState<Partial<Style>>({});
    const values = {mode: draft.mode ?? connector.mode, color: draft.color ?? connector.color, dashed: draft.dashed ?? connector.dashed};
    function edit<K extends keyof Style>(key: K, value: Style[K]) {setDraft(current => ({...current, [key]: value}));}
    return <fieldset disabled={busy} aria-label="Connector style"><legend>{label}</legend>
        <form className="affineControls" onSubmit={event => {
            event.preventDefault();
            void onCommand({type: 'connector-style', connectorId: connector.id, points: connector.points, ...values});
        }}>
            <label>Line shape<select name="mode" aria-label="Line shape" value={values.mode} onChange={event => edit('mode', event.target.value as PageConnector['mode'])}>
                <option value="straight">Straight</option><option value="orthogonal">Right angle</option><option value="curve">Curve</option>
            </select></label>
            <label>Line color<input name="color" type="color" value={values.color} onChange={event => edit('color', event.target.value)} /></label>
            <label><input name="dashed" type="checkbox" checked={values.dashed} onChange={event => edit('dashed', event.target.checked)} />Dashed line</label>
            <button>Apply connector style</button>
            <button type="button" onClick={() => void onCommand({type: 'remove-connector', connectorId: connector.id, scope: 'page'})}>Remove from page</button>
            <button type="button" onClick={() => {if (window.confirm('Unlink these objects everywhere?')) void onCommand({type: 'remove-connector', connectorId: connector.id, scope: 'everywhere'});}}>Unlink everywhere</button>
        </form>
    </fieldset>;
}
