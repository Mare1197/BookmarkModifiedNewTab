export interface PreparedAttachment {
    id: string;
    name: string;
    mimeType?: string;
    url?: string;
}

export interface PreparedMessage {
    id: string;
    role: string;
    text: string;
    createdAt?: number;
    updatedAt?: number;
    parentId?: string;
    attachments?: PreparedAttachment[];
}

export interface PreparedConversation {
    provider: string;
    sourceId: string;
    title: string;
    url?: string;
    createdAt?: number;
    updatedAt?: number;
    messages: PreparedMessage[];
    warnings?: string[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : undefined;
}

function requiredId(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(label + ' is required.');
    }
    return value.trim();
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeUrl(value: unknown, label: string): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') throw new Error(label + ' must be a URL string.');
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
        return parsed.href;
    } catch {
        throw new Error(label + ' must use an HTTP or HTTPS URL.');
    }
}

function timestamp(value: unknown, label: string, warnings: string[]): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    let parsed: number;
    if (typeof value === 'number') {
        parsed = Math.abs(value) < 1e12 ? value * 1000 : value;
    } else if (typeof value === 'string') {
        parsed = Date.parse(value);
    } else {
        parsed = Number.NaN;
    }
    if (!Number.isFinite(parsed)) {
        warnings.push('Ignored malformed ' + label + ' timestamp.');
        return undefined;
    }
    return Math.trunc(parsed);
}

function title(value: unknown): string {
    return optionalString(value) || 'Untitled conversation';
}

function parseAttachments(value: unknown, messageId: string, warnings: string[]): PreparedAttachment[] | undefined {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) {
        warnings.push('Ignored malformed attachments for message ' + messageId + '.');
        return undefined;
    }
    const attachments: PreparedAttachment[] = [];
    const seen = new Set<string>();
    value.forEach(raw => {
        const item = record(raw);
        if (!item) {
            warnings.push('Ignored malformed attachment for message ' + messageId + '.');
            return;
        }
        const id = optionalString(item.id) || optionalString(item.file_id) || optionalString(item.asset_pointer);
        const name = optionalString(item.name) || optionalString(item.file_name) || optionalString(item.filename);
        if (!id || !name) {
            warnings.push('Ignored attachment without an ID or name for message ' + messageId + '.');
            return;
        }
        if (seen.has(id)) throw new Error('Duplicate attachment ID "' + id + '" in message ' + messageId + '.');
        seen.add(id);
        const mimeType = optionalString(item.mimeType) || optionalString(item.mime_type) || optionalString(item.file_type);
        const url = safeUrl(item.url ?? item.download_url, 'Attachment URL');
        attachments.push({id, name, ...(mimeType ? {mimeType} : {}), ...(url ? {url} : {})});
    });
    return attachments.length ? attachments : undefined;
}

function validateMessages(messages: PreparedMessage[]): void {
    const byId = new Map(messages.map(message => [message.id, message]));
    for (const message of messages) {
        if (message.parentId && !byId.has(message.parentId)) {
            throw new Error('Message ' + message.id + ' has a missing parent ID.');
        }
        const visited = new Set<string>();
        let current: PreparedMessage | undefined = message;
        while (current?.parentId) {
            if (visited.has(current.id)) throw new Error('Message parent cycle forms a malformed root.');
            visited.add(current.id);
            current = byId.get(current.parentId);
        }
    }
}

function parseNormalized(raw: UnknownRecord): PreparedConversation {
    const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter(value => typeof value === 'string') : [];
    const provider = requiredId(raw.provider, 'Provider');
    const sourceId = requiredId(raw.sourceId, 'Conversation source ID');
    if (!Array.isArray(raw.messages) || raw.messages.length > 10000) {
        throw new Error('Messages must be an array with at most 10000 entries.');
    }
    const seen = new Set<string>();
    const messages = raw.messages.map(item => {
        const message = record(item);
        if (!message) throw new Error('Malformed message in conversation ' + sourceId + '.');
        const id = requiredId(message.id, 'Message ID');
        if (seen.has(id)) throw new Error('Duplicate message ID "' + id + '".');
        seen.add(id);
        if (typeof message.text !== 'string') throw new Error('Message text is required for ' + id + '.');
        const role = requiredId(message.role, 'Message role');
        const createdAt = timestamp(message.createdAt, 'message created', warnings);
        const updatedAt = timestamp(message.updatedAt, 'message updated', warnings);
        const parentId = optionalString(message.parentId);
        const attachments = parseAttachments(message.attachments, id, warnings);
        return {id, role, text: message.text, ...(createdAt === undefined ? {} : {createdAt}),
            ...(updatedAt === undefined ? {} : {updatedAt}), ...(parentId ? {parentId} : {}),
            ...(attachments ? {attachments} : {})};
    });
    validateMessages(messages);
    const createdAt = timestamp(raw.createdAt, 'conversation created', warnings);
    const updatedAt = timestamp(raw.updatedAt, 'conversation updated', warnings);
    const url = safeUrl(raw.url, 'Conversation URL');
    return {provider, sourceId, title: title(raw.title), ...(url ? {url} : {}),
        ...(createdAt === undefined ? {} : {createdAt}), ...(updatedAt === undefined ? {} : {updatedAt}),
        messages, ...(warnings.length ? {warnings} : {})};
}

function chatGptText(content: UnknownRecord | undefined, messageId: string, warnings: string[]): string {
    const parts = content?.parts;
    if (!Array.isArray(parts)) {
        warnings.push('Ignored unsupported content for message ' + messageId + '.');
        return '';
    }
    const text: string[] = [];
    let unsupported = false;
    parts.forEach(part => {
        if (typeof part === 'string') text.push(part);
        else {
            const item = record(part);
            if (typeof item?.text === 'string') text.push(item.text);
            else unsupported = true;
        }
    });
    if (unsupported) warnings.push('Ignored unsupported content parts for message ' + messageId + '.');
    return text.join('\n');
}

function parseChatGpt(raw: UnknownRecord): PreparedConversation {
    const warnings: string[] = [];
    const sourceId = requiredId(raw.id ?? raw.conversation_id, 'Conversation source ID');
    const mapping = record(raw.mapping);
    if (!mapping || Object.keys(mapping).length === 0) throw new Error('ChatGPT mapping has a malformed root.');
    const nodes = new Map<string, UnknownRecord>();
    Object.entries(mapping).forEach(([key, value]) => {
        const node = record(value);
        if (!node) throw new Error('ChatGPT mapping contains a malformed node.');
        const nodeId = optionalString(node.id) || key;
        if (nodes.has(nodeId)) throw new Error('Duplicate mapping node ID "' + nodeId + '".');
        nodes.set(nodeId, node);
    });
    const roots = [...nodes].filter(([, node]) => node.parent === null || node.parent === undefined);
    if (!roots.length) throw new Error('ChatGPT mapping has no valid root and may contain a cycle.');
    nodes.forEach((node, nodeId) => {
        const parent = optionalString(node.parent);
        if (parent && !nodes.has(parent)) throw new Error('Mapping node ' + nodeId + ' has a missing parent.');
        const visited = new Set<string>();
        let currentId: string | undefined = nodeId;
        while (currentId) {
            if (visited.has(currentId)) throw new Error('ChatGPT mapping contains a parent cycle.');
            visited.add(currentId);
            currentId = optionalString(nodes.get(currentId)?.parent);
        }
    });
    const nodeMessageIds = new Map<string, string>();
    const messages: PreparedMessage[] = [];
    const seen = new Set<string>();
    nodes.forEach((node, nodeId) => {
        const message = record(node.message);
        if (!message) return;
        const id = requiredId(message.id, 'Message ID');
        if (seen.has(id)) throw new Error('Duplicate message ID "' + id + '".');
        seen.add(id);
        nodeMessageIds.set(nodeId, id);
        const author = record(message.author);
        const role = optionalString(author?.role) || 'unknown';
        if (role === 'unknown') warnings.push('Message ' + id + ' has no supported author role.');
        const createdAt = timestamp(message.create_time, 'message created', warnings);
        const updatedAt = timestamp(message.update_time, 'message updated', warnings);
        const metadata = record(message.metadata);
        const content = record(message.content);
        const attachments = parseAttachments(metadata?.attachments ?? content?.attachments ?? message.attachments,
            id, warnings);
        messages.push({id, role, text: chatGptText(content, id, warnings),
            ...(createdAt === undefined ? {} : {createdAt}), ...(updatedAt === undefined ? {} : {updatedAt}),
            ...(attachments ? {attachments} : {})});
    });
    const parsedMessages = new Map(messages.map(message => [message.id, message]));
    nodes.forEach((node, nodeId) => {
        const messageId = nodeMessageIds.get(nodeId);
        if (!messageId) return;
        let parentNodeId = optionalString(node.parent);
        while (parentNodeId && !nodeMessageIds.has(parentNodeId)) {
            parentNodeId = optionalString(nodes.get(parentNodeId)?.parent);
        }
        if (parentNodeId) {
            const parsed = parsedMessages.get(messageId);
            if (parsed) parsed.parentId = nodeMessageIds.get(parentNodeId);
        }
    });
    validateMessages(messages);
    const createdAt = timestamp(raw.create_time, 'conversation created', warnings);
    const updatedAt = timestamp(raw.update_time, 'conversation updated', warnings);
    const url = safeUrl(raw.url, 'Conversation URL');
    return {provider: 'chatgpt', sourceId, title: title(raw.title), ...(url ? {url} : {}),
        ...(createdAt === undefined ? {} : {createdAt}), ...(updatedAt === undefined ? {} : {updatedAt}),
        messages, ...(warnings.length ? {warnings} : {})};
}

function parseClaude(raw: UnknownRecord): PreparedConversation {
    const warnings: string[] = [];
    const sourceId = requiredId(raw.uuid ?? raw.id, 'Conversation source ID');
    if (!Array.isArray(raw.chat_messages) || raw.chat_messages.length > 10000) {
        throw new Error('Claude chat_messages must be an array with at most 10000 entries.');
    }
    const seen = new Set<string>();
    const messages = raw.chat_messages.map(item => {
        const message = record(item);
        if (!message) throw new Error('Malformed Claude message in conversation ' + sourceId + '.');
        const id = requiredId(message.uuid ?? message.id, 'Message ID');
        if (seen.has(id)) throw new Error('Duplicate message ID "' + id + '".');
        seen.add(id);
        const sender = optionalString(message.sender) || optionalString(message.role) || 'unknown';
        const role = sender === 'human' ? 'user' : sender;
        if (role === 'unknown') warnings.push('Message ' + id + ' has no supported sender role.');
        const text = typeof message.text === 'string' ? message.text : '';
        if (typeof message.text !== 'string') warnings.push('Ignored unsupported content for message ' + id + '.');
        const createdAt = timestamp(message.created_at, 'message created', warnings);
        const updatedAt = timestamp(message.updated_at, 'message updated', warnings);
        const parentId = optionalString(message.parent_message_uuid ?? message.parent_uuid ?? message.parentId);
        const attachments = parseAttachments(message.attachments ?? message.files, id, warnings);
        return {id, role, text, ...(createdAt === undefined ? {} : {createdAt}),
            ...(updatedAt === undefined ? {} : {updatedAt}), ...(parentId ? {parentId} : {}),
            ...(attachments ? {attachments} : {})};
    });
    validateMessages(messages);
    const createdAt = timestamp(raw.created_at, 'conversation created', warnings);
    const updatedAt = timestamp(raw.updated_at, 'conversation updated', warnings);
    const url = safeUrl(raw.url, 'Conversation URL');
    return {provider: 'claude', sourceId, title: title(raw.name ?? raw.title), ...(url ? {url} : {}),
        ...(createdAt === undefined ? {} : {createdAt}), ...(updatedAt === undefined ? {} : {updatedAt}),
        messages, ...(warnings.length ? {warnings} : {})};
}

function exportItems(input: unknown): unknown[] {
    if (Array.isArray(input)) return input;
    const root = record(input);
    if (!root) throw new Error('Malformed export root: expected a conversation object or array.');
    if ('conversations' in root) {
        if (!Array.isArray(root.conversations)) throw new Error('Malformed export root: conversations must be an array.');
        return root.conversations;
    }
    if ('provider' in root && 'messages' in root) return [root];
    throw new Error('Malformed export root: no supported conversation collection was found.');
}

export function parseChatExport(input: unknown): PreparedConversation[] {
    const conversations = exportItems(input).map(item => {
        const raw = record(item);
        if (!raw) throw new Error('Malformed conversation entry.');
        if ('mapping' in raw) return parseChatGpt(raw);
        if ('chat_messages' in raw) return parseClaude(raw);
        if ('provider' in raw && 'messages' in raw) return parseNormalized(raw);
        throw new Error('Unsupported conversation export entry.');
    });
    const sources = new Set<string>();
    conversations.forEach(conversation => {
        const sourceKey = conversation.provider.toLocaleLowerCase() + ':' + conversation.sourceId;
        if (sources.has(sourceKey)) throw new Error('Duplicate conversation source "' + sourceKey + '".');
        sources.add(sourceKey);
    });
    return conversations;
}
