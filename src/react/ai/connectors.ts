import {browser} from 'wxt/browser';

const CONFIG_KEY = 'browserOsGeminiConnectorV1';
export const GEMINI_ORIGIN = 'https://generativelanguage.googleapis.com/*';

export interface ConnectorConfig {
    apiKey: string;
    model: string;
}

export interface AnalysisRequest {
    content: string;
    title: string;
}

export interface AnalysisResult {
    connectorId: string;
    createdAt: number;
    model: string;
    text: string;
}

export interface AnalysisConnector {
    analyze(request: AnalysisRequest, config: ConnectorConfig, signal?: AbortSignal): Promise<AnalysisResult>;
    id: string;
    label: string;
}

export async function loadConnectorConfig(): Promise<ConnectorConfig> {
    const stored = await browser.storage.local.get(CONFIG_KEY);
    const config = stored[CONFIG_KEY] as Partial<ConnectorConfig> | undefined;
    return {
        apiKey: config?.apiKey || '',
        model: config?.model || 'gemini-3.6-flash'
    };
}

export async function saveConnectorConfig(config: ConnectorConfig): Promise<void> {
    await browser.storage.local.set({[CONFIG_KEY]: config});
}

export async function clearConnectorConfig(): Promise<void> {
    await browser.storage.local.remove(CONFIG_KEY);
}

export const geminiConnector: AnalysisConnector = {
    id: 'gemini',
    label: 'Gemini',
    async analyze(request, config, signal) {
        if (!config.apiKey.trim()) {
            throw new Error('Configure a Gemini API key before running analysis.');
        }
        const model = config.model.trim() || 'gemini-3.6-flash';
        const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
            encodeURIComponent(model) + ':generateContent';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': config.apiKey.trim()
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: 'Analyze this workspace item. Separate observations from suggestions. ' +
                            'Do not claim facts absent from the source.\n\nTitle: ' + request.title +
                            '\n\nSource:\n' + request.content
                    }]
                }]
            }),
            signal
        });
        if (!response.ok) {
            throw new Error('Gemini request failed with status ' + response.status + '.');
        }
        const payload = await response.json() as {
            candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>;
        };
        const text = payload.candidates?.[0]?.content?.parts
            ?.map(part => part.text || '').join('\n').trim();
        if (!text) {
            throw new Error('Gemini returned no analysis text.');
        }
        return {connectorId: 'gemini', createdAt: Date.now(), model, text};
    }
};
