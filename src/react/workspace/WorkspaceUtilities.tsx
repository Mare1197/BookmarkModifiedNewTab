import {useEffect, useRef, useState} from 'react';
import {browser} from 'wxt/browser';

import type {WorkspaceEntity} from '../../workspace/types';
import {buildBrainContext} from './brainSelectors';
import {workspaceClient} from './workspaceClient';
import type {WorkspaceSnapshot} from './workspaceRepository';
import {
    GEMINI_ORIGIN,
    clearConnectorConfig,
    geminiConnector,
    loadConnectorConfig,
    saveConnectorConfig,
    type ConnectorConfig
} from '../ai/connectors';
import {
    exportWorkspace,
    importWorkspace,
    restoreLatestTrash,
    saveAnalysis,
    type WorkspaceExport
} from './workspaceRepository';

export function AnalysisView({
    snapshot,
    activeBoardId,
    entity,
    onSaved
}: {
    snapshot: WorkspaceSnapshot;
    activeBoardId: string;
    entity?: WorkspaceEntity;
    onSaved: () => Promise<void>;
}) {
    const [config, setConfig] = useState<ConnectorConfig>({apiKey: '', model: 'gemini-3.6-flash'});
    const [status, setStatus] = useState('');
    const [result, setResult] = useState<{
        boardId: string;
        entityId: string;
        text: string;
        model: string;
        connectedContextIncluded: boolean;
        contextIds: string[];
    }>();
    const [running, setRunning] = useState(false);
    const [includeConnected, setIncludeConnected] = useState(false);
    const context = entity ? buildBrainContext(entity.id, snapshot.entities, snapshot.relationships, {includeConnected}) : {text: '', included: [], excluded: []};
    const abortRef = useRef<AbortController | null>(null);
    useEffect(() => {
        void loadConnectorConfig().then(setConfig);
        return () => abortRef.current?.abort();
    }, []);
    useEffect(() => {
        setResult(undefined);
        setStatus('');
        setIncludeConnected(false);
        abortRef.current?.abort();
    }, [activeBoardId, entity?.id]);

    const analyze = async () => {
        if (!entity) {
            setStatus('Select a Canvas object first.');
            return;
        }
        const granted = await browser.permissions.request({origins: [GEMINI_ORIGIN]});
        if (!granted) {
            setStatus('Gemini network access was not granted.');
            return;
        }
        setRunning(true);
        setStatus('Running explicit Gemini analysis…');
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            // Recheck privacy from current storage, including changes in another open tab.
            const current = buildBrainContext(entity.id, await workspaceClient.entities.toArray(), await workspaceClient.relationships.toArray(), {includeConnected});
            if (!current.included.some(item => item.id === entity.id)) throw new Error('The selected object is excluded from AI or exceeds the context budget.');
            await saveConnectorConfig(config);
            const analysis = await geminiConnector.analyze({
                title: entity.title,
                content: current.text
            }, config, controller.signal);
            setResult({boardId: activeBoardId, entityId: entity.id, text: analysis.text,
                model: config.model, connectedContextIncluded: includeConnected, contextIds: current.included.map(item => item.id)});
            setStatus('Analysis ready. Review it before saving.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Analysis failed.');
        } finally {
            setRunning(false);
        }
    };

    return (
        <section className="workspaceUtility" aria-label="Optional AI analysis">
            <header>
                <div>
                    <h2>Optional analysis</h2>
                    <p>Disabled until you configure a provider and explicitly run it.</p>
                </div>
                <span className="workspaceUtility__local">Local core stays available</span>
            </header>
            <div className="workspaceUtility__form">
                <label>
                    Connector
                    <input value="Gemini" readOnly />
                </label>
                <label>
                    Model
                    <input
                        value={config.model}
                        onChange={event => setConfig(current => ({...current, model: event.target.value}))}
                    />
                </label>
                <label>
                    API key
                    <input
                        type="password"
                        value={config.apiKey}
                        placeholder="Stored only in this browser profile"
                        onChange={event => setConfig(current => ({...current, apiKey: event.target.value}))}
                    />
                </label>
            </div>
            <div className="workspaceUtility__source">
                <strong>Selected source</strong>
                <span>{entity ? entity.title : 'No object selected'}</span>
            </div>
            <label><input type="checkbox" checked={includeConnected} disabled={running}
                onChange={event => setIncludeConnected(event.target.checked)} />
                Include connected messages and reviewed memories in this request to Google
            </label>
            <details><summary>Review exact context ({context.text.length} characters; maximum 24,000)</summary>
                <pre style={{whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto'}}>{context.text}</pre>
                <h3>Included</h3>{context.included.map(item => <p key={item.id}>{item.id}: {item.reason}{item.sourceIds.length ? ' · Sources: ' + item.sourceIds.join(', ') : ''}</p>)}
                <h3>Excluded</h3>{context.excluded.map(item => <p key={item.id}>{item.id}: {item.reason}</p>)}
            </details>
            <div className="workspaceUtility__buttons">
                <button
                    type="button"
                    className="primaryButton"
                    disabled={running}
                    onClick={() => void analyze()}
                >
                    {running ? 'Analyzing…' : 'Run analysis'}
                </button>
                {running && (
                    <button type="button" onClick={() => abortRef.current?.abort()}>Cancel</button>
                )}
                <button
                    type="button"
                    disabled={!result || !entity ||
                        result.entityId !== entity.id || result.boardId !== activeBoardId}
                    onClick={() => {
                        if (!entity || !result ||
                            result.entityId !== entity.id || result.boardId !== activeBoardId) {
                            return;
                        }
                        void saveAnalysis(activeBoardId, 'Analysis: ' + entity.title, result.text, {
                            connectorId: 'gemini',
                            model: result.model,
                            connectedContextIncluded: result.connectedContextIncluded,
                            contextIds: result.contextIds,
                            sourceEntityId: entity.id,
                            relationshipSuggestionsConfirmed: false
                        }).then(onSaved)
                            .then(() => setStatus('Saved as a separate analysis card.'))
                            .catch(error => setStatus(error instanceof Error ? error.message : 'Save failed.'));
                    }}
                >
                    Save as analysis card
                </button>
            </div>
            <p role="status">{status}</p>
            {result && <article className="workspaceUtility__result">{result.text}</article>}
            <p className="workspaceUtility__privacy">
                Running analysis sends the selected title/content to Google. Nothing is sent on save,
                board navigation, or local search. The API key is stored unencrypted in this browser
                profile, so use a restricted key.
            </p>
            <div className="workspaceUtility__buttons">
                <button
                    type="button"
                    onClick={() => {
                        void clearConnectorConfig().then(() => {
                            setConfig({apiKey: '', model: 'gemini-3.6-flash'});
                            setStatus('Stored Gemini key cleared.');
                        });
                    }}
                >
                    Clear stored key
                </button>
                <button
                    type="button"
                    onClick={() => {
                        void browser.permissions.remove({origins: [GEMINI_ORIGIN]}).then(removed => {
                            setStatus(removed ? 'Gemini network permission revoked.' :
                                'Gemini network permission was not granted.');
                        });
                    }}
                >
                    Revoke Gemini access
                </button>
            </div>
        </section>
    );
}

export function SettingsView({onImported}: {onImported: () => Promise<void>}) {
    const [status, setStatus] = useState('');
    const importRef = useRef<HTMLInputElement>(null);
    const exportData = async () => {
        const snapshot = await exportWorkspace();
        const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot)], {type: 'application/json'}));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'browser-os-workspace-' + new Date().toISOString().slice(0, 10) + '.json';
        link.click();
        URL.revokeObjectURL(url);
        setStatus('Versioned workspace export created.');
    };
    const importData = async (file: File) => {
        try {
            const snapshot = JSON.parse(await file.text()) as WorkspaceExport;
            await importWorkspace(snapshot);
            await onImported();
            setStatus('Workspace records merged from the export.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Import failed.');
        }
    };
    return (
        <section className="workspaceUtility" aria-label="Workspace settings">
            <header>
                <div>
                    <h2>Settings & backup</h2>
                    <p>Local-first data controls for the shared workspace.</p>
                </div>
            </header>
            <div className="workspaceUtility__panel">
                <h3>Versioned backup</h3>
                <p>Export includes boards, placements, relationships, settings, and original asset blobs.</p>
                <div className="workspaceUtility__buttons">
                    <button type="button" className="primaryButton" onClick={() => void exportData()}>
                        Export workspace
                    </button>
                    <button type="button" onClick={() => importRef.current?.click()}>
                        Import workspace
                    </button>
                    <input
                        ref={importRef}
                        type="file"
                        accept="application/json"
                        hidden
                        onChange={event => {
                            const file = event.target.files?.[0];
                            if (file) {
                                void importData(file);
                            }
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            void restoreLatestTrash()
                                .then(onImported)
                                .then(() => setStatus('Latest Trash item restored.'))
                                .catch(error => setStatus(error instanceof Error ? error.message : 'Restore failed.'));
                        }}
                    >
                        Restore latest Trash item
                    </button>
                </div>
            </div>
            <div className="workspaceUtility__panel">
                <h3>Cloud connectors</h3>
                <p>Optional provider access is requested only from the Analysis view. Local features do not require it.</p>
            </div>
            <p role="status">{status}</p>
        </section>
    );
}
