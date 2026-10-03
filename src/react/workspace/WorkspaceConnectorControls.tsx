import type {PageCommand, PageConnector} from '../../workspace/pageTypes';

export function WorkspaceConnectorControls({connector, label, busy, onCommand}: {
    connector: PageConnector; label: string; busy: boolean; onCommand: (command: PageCommand) => Promise<void>;
}) {
    return <fieldset disabled={busy} aria-label="Connector style"><legend>{label}</legend>
        <form className="affineControls" key={JSON.stringify(connector)} onSubmit={event => {
            event.preventDefault(); const form = new FormData(event.currentTarget);
            void onCommand({type: 'connector-style', connectorId: connector.id, points: connector.points,
                mode: form.get('mode') as PageConnector['mode'], color: String(form.get('color')), dashed: form.has('dashed')});
        }}>
            <label>Line shape<select name="mode" aria-label="Line shape" defaultValue={connector.mode}>
                <option value="straight">Straight</option><option value="orthogonal">Right angle</option><option value="curve">Curve</option>
            </select></label>
            <label>Line color<input name="color" type="color" defaultValue={connector.color} /></label>
            <label><input name="dashed" type="checkbox" defaultChecked={connector.dashed} />Dashed line</label>
            <button>Apply connector style</button>
            <button type="button" onClick={() => void onCommand({type: 'remove-connector', connectorId: connector.id, scope: 'page'})}>Remove from page</button>
            <button type="button" onClick={() => {if (window.confirm('Unlink these objects everywhere?')) void onCommand({type: 'remove-connector', connectorId: connector.id, scope: 'everywhere'});}}>Unlink everywhere</button>
        </form>
    </fieldset>;
}
