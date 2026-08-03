import { io } from 'socket.io-client';
import { getApiOrigin } from './apiBase.js';

function toFileUri(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  if (!normalized) {
    return '';
  }

  if (/^[A-Za-z]:/.test(normalized)) {
    return encodeURI(`file:///${normalized}`);
  }

  return encodeURI(normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`);
}

function buildDocumentUri(workspaceRoot, relativePath, fallbackName = 'untitled.txt') {
  const normalizedRoot = String(workspaceRoot || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedRelativePath = String(relativePath || fallbackName)
    .replace(/^root\/?/, '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');

  return toFileUri(normalizedRelativePath ? `${normalizedRoot}/${normalizedRelativePath}` : normalizedRoot);
}

function toLspPosition(position) {
  return {
    line: Math.max(0, Number(position?.lineNumber || 1) - 1),
    character: Math.max(0, Number(position?.column || 1) - 1),
  };
}

function toRenameParams({ uri, position, newName }) {
  return {
    textDocument: { uri },
    position: toLspPosition(position),
    newName: String(newName || ''),
  };
}

export function createLspBridge({
  languageId,
  sessionId,
  workspaceRoot,
  onStatus = () => {},
}) {
  const socket = io(`${getApiOrigin()}/lsp`, {
    withCredentials: true,
    autoConnect: false,
    transports: ['websocket', 'polling'],
    upgrade: true,
    rememberUpgrade: false,
    timeout: 10_000,
    reconnectionAttempts: 2,
    query: {
      languageId,
      sessionId,
      workspaceRoot,
    },
  });

  let rpcId = 0;
  let initialized = false;
  let initializePromise = null;
  let activeDocument = null;
  let lastDocumentSyncAt = 0;
  const pendingRequests = new Map();
  const documentVersions = new Map();
  let handshakeStatusTimer = null;
  let reconnectTimer = null;
  let disposed = false;

  function clearHandshakeTimer() {
    if (handshakeStatusTimer) {
      window.clearTimeout(handshakeStatusTimer);
      handshakeStatusTimer = null;
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function armHandshakeTimer() {
    clearHandshakeTimer();
    handshakeStatusTimer = window.setTimeout(() => {
      onStatus({
        status: 'error',
        languageId,
        message: 'The language server bridge timed out while starting.',
      });
      socket.disconnect();
    }, 12_000);
  }

  function rejectAllPending(error) {
    pendingRequests.forEach(({ reject }) => reject(error));
    pendingRequests.clear();
  }

  function resetConnection(message = 'Reconnecting to the language server...') {
    if (disposed) {
      return;
    }

    clearHandshakeTimer();
    clearReconnectTimer();
    initialized = false;
    initializePromise = null;
    activeDocument = null;
    documentVersions.clear();

    onStatus({
      status: 'restarting',
      languageId,
      message,
    });

    if (socket.connected) {
      socket.disconnect();
    }

    reconnectTimer = window.setTimeout(() => {
      if (disposed) {
        return;
      }
      socket.connect();
    }, 150);
  }

  socket.on('connect', () => {
    console.log(`[Tilder LSP Bridge] Socket connected for ${languageId}`);
    onStatus({
      status: 'connecting',
      languageId,
      message: 'Connected to the bridge. Starting language server...',
    });
    armHandshakeTimer();
  });

  socket.on('connect_error', (error) => {
    console.error(`[Tilder LSP Bridge] Connect error for ${languageId}:`, error);
    clearHandshakeTimer();
    onStatus({
      status: 'error',
      languageId,
      message: error instanceof Error ? error.message : 'Unable to connect to the LSP bridge.',
    });
    rejectAllPending(error instanceof Error ? error : new Error('Unable to connect to the LSP bridge.'));
  });

  socket.on('disconnect', () => {
    clearHandshakeTimer();
    clearReconnectTimer();
    initialized = false;
    initializePromise = null;
    activeDocument = null;
    documentVersions.clear();
    onStatus({
      status: 'disconnected',
      languageId,
      message: 'Disconnected from the language server bridge.',
    });
    rejectAllPending(new Error('Disconnected from the language server bridge.'));
  });

  socket.on('lsp:status', (payload) => {
    console.log(`[Tilder LSP Bridge] lsp:status for ${languageId}:`, payload);
    clearHandshakeTimer();
    onStatus(payload || { status: 'unknown', languageId });
  });

  const diagnosticListeners = new Set();

  socket.on('lsp:message', (message) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(message, 'id') && pendingRequests.has(message.id)) {
      console.log(`[Tilder LSP Bridge] Received response for id=${message.id}`, message.error ? 'ERROR' : 'OK', JSON.stringify(message).slice(0, 500));
      const { resolve, reject } = pendingRequests.get(message.id);
      pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || 'Language server request failed.'));
        return;
      }

      resolve(message.result);
    } else if (message.method === 'workspace/configuration') {
      console.log(`[Tilder LSP Bridge] Replying to workspace/configuration request id=${message.id}`);
      const result = message.params?.items ? message.params.items.map(() => ({})) : [];
      socket.emit('lsp:message', {
        jsonrpc: '2.0',
        id: message.id,
        result,
      });
    } else if (message.method === 'textDocument/publishDiagnostics') {
      if (message.params) {
        diagnosticListeners.forEach((listener) => listener(message.params));
      }
    } else {
      console.log(`[Tilder LSP Bridge] Unhandled lsp:message`, message.method || message.id, 'pendingIds:', [...pendingRequests.keys()]);
    }
  });

  onStatus({
    status: 'connecting',
    languageId,
    message: 'Connecting to the language server bridge...',
  });
  armHandshakeTimer();
  socket.connect();

  function sendNotification(method, params) {
    socket.emit('lsp:message', {
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  function sendRequest(method, params, timeoutMs = 10_000) {
    const id = ++rpcId;
    socket.emit('lsp:message', {
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (!pendingRequests.has(id)) {
          return;
        }

        pendingRequests.delete(id);
        if (method === 'initialize') {
          resetConnection(`${method} timed out. Reconnecting to the language server...`);
        }
        reject(new Error(`${method} timed out.`));
      }, timeoutMs);

      pendingRequests.set(id, {
        resolve: (value) => {
          window.clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        },
      });
    });
  }

  async function ensureInitialized() {
    if (initialized) {
      console.log(`[Tilder LSP Bridge] Already initialized for ${languageId}`);
      return;
    }

    if (initializePromise) {
      console.log(`[Tilder LSP Bridge] Waiting for pending initialize for ${languageId}`);
      await initializePromise;
      return;
    }

    console.log(`[Tilder LSP Bridge] Sending initialize request for ${languageId}`);

    initializePromise = sendRequest('initialize', {
      processId: null,
      clientInfo: {
        name: 'Tilder',
        version: '0.1.0',
      },
      rootUri: toFileUri(workspaceRoot),
      capabilities: {
        textDocument: {
          completion: {
            contextSupport: true,
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true,
              preselectSupport: true,
              insertReplaceSupport: true,
              labelDetailsSupport: true,
              dataSupport: true,
              resolveSupport: {
                properties: [
                  'documentation',
                  'detail',
                  'additionalTextEdits',
                  'sortText',
                  'filterText',
                  'insertText',
                  'textEdit',
                ],
              },
              tagSupport: {
                valueSet: [1],
              },
            },
            completionItemKind: {
              valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
            },
            insertTextMode: 2,
            completionList: {
              itemDefaults: ['commitCharacters', 'editRange', 'insertTextFormat', 'insertTextMode', 'data'],
            },
          },
          hover: {
            contentFormat: ['markdown', 'plaintext']
          },
          signatureHelp: {
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: { labelOffsetSupport: true }
            }
          }
        },
        workspace: {
          workspaceFolders: true,
          configuration: true
        }
      },
      workspaceFolders: [
        {
          uri: toFileUri(workspaceRoot),
          name: 'workspace',
        },
      ],
    })
      .then(() => {
        initialized = true;
        sendNotification('initialized', {});
      })
      .finally(() => {
        initializePromise = null;
      });

    await initializePromise;
  }

  async function syncDocument({ relativePath, fileName, text }) {
    await ensureInitialized();

    const uri = buildDocumentUri(workspaceRoot, relativePath, fileName);
    const version = (documentVersions.get(uri) || 0) + 1;
    documentVersions.set(uri, version);

    if (activeDocument?.uri !== uri) {
      if (activeDocument?.uri) {
        sendNotification('textDocument/didClose', {
          textDocument: { uri: activeDocument.uri },
        });
      }

      activeDocument = {
        uri,
        languageId,
      };

      sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId,
          version,
          text,
        },
      });
      lastDocumentSyncAt = Date.now();
      return uri;
    }

    sendNotification('textDocument/didChange', {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [{ text }],
    });
    lastDocumentSyncAt = Date.now();
    return uri;
  }

  async function requestCompletion({ relativePath, fileName, text, position, triggerCharacter }) {
    const uri = await syncDocument({ relativePath, fileName, text });
    const elapsedSinceSync = Date.now() - lastDocumentSyncAt;
    if (elapsedSinceSync >= 0 && elapsedSinceSync < 75) {
      await new Promise((resolve) => window.setTimeout(resolve, 75 - elapsedSinceSync));
    }
    return sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: toLspPosition(position),
      context: {
        triggerKind: triggerCharacter ? 2 : 1,
        ...(triggerCharacter ? { triggerCharacter } : {}),
      },
    }, 5_000);
  }

  async function requestHover({ relativePath, fileName, text, position }) {
    const uri = await syncDocument({ relativePath, fileName, text });
    return sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: toLspPosition(position),
    });
  }

  async function requestSignatureHelp({ relativePath, fileName, text, position, triggerCharacter }) {
    const uri = await syncDocument({ relativePath, fileName, text });
    return sendRequest('textDocument/signatureHelp', {
      textDocument: { uri },
      position: toLspPosition(position),
      context: {
        isRetrigger: false,
        triggerKind: triggerCharacter ? 2 : 1,
        ...(triggerCharacter ? { triggerCharacter } : {}),
      },
    });
  }

  async function requestSymbols({ relativePath, fileName, text }) {
    const uri = await syncDocument({ relativePath, fileName, text });
    return sendRequest('textDocument/documentSymbol', {
      textDocument: { uri },
    });
  }

  async function requestDefinition({ relativePath, fileName, text, position }) {
    const uri = await syncDocument({ relativePath, fileName, text });
    return sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: toLspPosition(position),
    });
  }

  async function requestReferences({ relativePath, fileName, text, position, includeDeclaration = true }) {
    const uri = await syncDocument({ relativePath, fileName, text });
    return sendRequest('textDocument/references', {
      textDocument: { uri },
      position: toLspPosition(position),
      context: {
        includeDeclaration,
      },
    });
  }

  async function requestRename({ relativePath, fileName, text, position, newName }) {
    const uri = await syncDocument({ relativePath, fileName, text });
    return sendRequest('textDocument/rename', toRenameParams({ uri, position, newName }));
  }

  function dispose() {
    disposed = true;
    clearHandshakeTimer();
    clearReconnectTimer();
    if (activeDocument?.uri) {
      sendNotification('textDocument/didClose', {
        textDocument: { uri: activeDocument.uri },
      });
    }

    socket.disconnect();
    rejectAllPending(new Error('Language server bridge disposed.'));
  }

  return {
    providerMode: 'lsp',
    ensureInitialized,
    syncDocument,
    requestCompletion,
    requestHover,
    requestSignatureHelp,
    requestSymbols,
    requestDefinition,
    requestReferences,
    requestRename,
    dispose,
    onDiagnostics: (listener) => {
      diagnosticListeners.add(listener);
      return () => {
        diagnosticListeners.delete(listener);
      };
    },
  };
}
