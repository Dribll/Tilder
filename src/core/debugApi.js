import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { io } from "socket.io-client";
import { getResolvedApiBaseUrl } from "./apiBase.js";

/**
 * Advanced Debugging Bridge for Tilder
 * Implements Chrome DevTools Protocol (CDP) for Node.js debugging.
 * 
 * Supports:
 * - Full step debugging (over, into, out)
 * - Variable inspection (with deep property traversal)
 * - Call stack introspection
 * - Runtime.evaluate for Debug Console REPL
 * - Console API capture (console.log, .warn, .error, etc.)
 * - Conditional breakpoints
 */
export class DebugSession {
    constructor() {
        this.ws = null;
        this.messageId = 0;
        this.callbacks = new Map();
        this.eventListeners = new Map();
        this.connected = false;
        this.breakPoints = new Map(); // key -> breakpointId
        this.pid = null;
        this.port = null;
        this.unlisteners = [];

        // Live debug state
        this.callFrames = [];
        this.currentFrameId = null;
        this.pausedLocation = null;
    }

    async start(filePath, options = {}) {
        const ext = filePath.split('.').pop().toLowerCase();
        let runtime = 'node';
        if (ext === 'py' || ext === 'python') runtime = 'python';
        else if (ext === 'java') runtime = 'java';
        else if (ext === 'rs' || ext === 'rust') runtime = 'rust';
        else if (['c', 'cpp', 'cc', 'cxx'].includes(ext)) runtime = 'cpp';
        
        this.runtime = runtime;

        // Clean up any old listeners
        if (this.unlisteners) {
            this.unlisteners.forEach(unlisten => unlisten());
            this.unlisteners = [];
        }

        // Set up event listeners
        try {
            const stdoutUnlisten = await listen("debug-stdout", (event) => {
                this.emit("console.message", {
                    type: "log",
                    text: event.payload,
                    timestamp: Date.now()
                });
            });
            this.unlisteners.push(stdoutUnlisten);

            const stderrUnlisten = await listen("debug-stderr", (event) => {
                this.emit("console.message", {
                    type: "error",
                    text: event.payload,
                    timestamp: Date.now()
                });
            });
            this.unlisteners.push(stderrUnlisten);

            const exitUnlisten = await listen("debug-exit", (event) => {
                if (event.payload === this.pid) {
                    this.connected = false;
                    this.callFrames = [];
                    this.currentFrameId = null;
                    this.pausedLocation = null;
                    this.emit("sessionClosed");
                }
            });
            this.unlisteners.push(exitUnlisten);
        } catch (e) {
            console.error("Failed to setup Tauri debug listeners:", e);
        }

        // 1. Spawn the process with the appropriate runtime via Tauri
        const { port, pid } = await invoke("spawn_debug_process", {
            path: filePath,
            runtime,
            args: options.args || []
        });

        this.pid = pid;
        this.port = port;

        if (['python', 'cpp', 'rust', 'java'].includes(runtime)) {
            this.status = 'running';
            this.connected = false;
            this.dapLaunchPath = filePath;
            
            // Connect to DAP backend via WebSockets
            const baseUrl = getResolvedApiBaseUrl() || "http://localhost:3210";
            this.dapSocket = io(baseUrl + "/dap", {
                transports: ['websocket', 'polling'],
                query: {
                    sessionId: this.messageId + "-" + Date.now(),
                    workspaceRoot: options.cwd || "",
                    runtime: runtime,
                }
            });

            return new Promise((resolve, reject) => {
                this.dapSocket.on('dap:status', (status) => {
                    if (status.status === 'connected') {
                        this.connected = true;
                        this.initializeDAP().then(() => resolve({ port, pid, runtime })).catch(reject);
                    } else if (status.status === 'error') {
                        reject(new Error(status.message));
                    }
                });

                this.dapSocket.on('dap:message', (data) => this._handleDAPEvent(data));
                
                this.dapSocket.on('disconnect', () => {
                    this.connected = false;
                    this.callFrames = [];
                    this.currentFrameId = null;
                    this.emit("sessionClosed");
                });
            });
        }

        // Non-Node runtimes don't use CDP WebSocket debugging
        // For Java, we use JDWP but have no CDP bridge in the frontend yet - show as running
        if (runtime !== 'node') {
            this.status = 'running';
            this.connected = false;
            return { port, pid, runtime };
        }

        // 2. Discover the CDP WebSocket URL with retry
        let wsUrl = "";
        for (let i = 0; i < 20; i++) {
            try {
                const res = await fetch(`http://127.0.0.1:${port}/json/version`);
                const data = await res.json();
                if (data.webSocketDebuggerUrl) {
                    wsUrl = data.webSocketDebuggerUrl;
                    break;
                }
            } catch {
                // Not ready yet
            }
            await new Promise(r => setTimeout(r, 300));
        }

        if (!wsUrl) throw new Error("Failed to discover debugger WebSocket URL.");

        await this.connect(wsUrl);
        return { port, pid, runtime };
    }

    isCDPSupported() {
        return this.runtime === 'node';
    }

    connect(url) {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                this.connected = true;
                this.initializeCDP().then(resolve).catch(reject);
            };

            this.ws.onmessage = (event) => {
                let data;
                try { data = JSON.parse(event.data); } catch { return; }

                if (data.id && this.callbacks.has(data.id)) {
                    this.callbacks.get(data.id)(data);
                    this.callbacks.delete(data.id);
                } else if (data.method) {
                    this._handleEvent(data.method, data.params);
                }
            };

            this.ws.onerror = (err) => reject(err);
            this.ws.onclose = () => {
                this.connected = false;
                this.callFrames = [];
                this.currentFrameId = null;
                this.pausedLocation = null;
                this.emit("sessionClosed");
            };
        });
    }

    /** Handles incoming CDP events and syncs internal state */
    _handleEvent(method, params) {
        switch (method) {
            case "Debugger.paused": {
                this.callFrames = params.callFrames || [];
                this.currentFrameId = this.callFrames[0]?.callFrameId || null;
                this.pausedLocation = this.callFrames[0]?.location || null;
                break;
            }
            case "Debugger.resumed": {
                this.callFrames = [];
                this.currentFrameId = null;
                this.pausedLocation = null;
                break;
            }
            case "Runtime.consoleAPICalled": {
                // Normalize console.log/warn/error/etc into a unified event
                const texts = (params.args || []).map(a => this._remoteObjectToString(a)).join(" ");
                this.emit("console.message", {
                    type: params.type, // 'log', 'warn', 'error', 'info', etc.
                    text: texts,
                    timestamp: params.timestamp,
                });
                break;
            }
            case "Runtime.exceptionThrown": {
                const desc = params.exceptionDetails?.exception?.description
                    || params.exceptionDetails?.text
                    || "Unknown error";
                this.emit("console.message", {
                    type: "error",
                    text: `Uncaught: ${desc}`,
                    timestamp: Date.now(),
                });
                break;
            }
        }

        // Always propagate the raw event for App.jsx-level handlers
        this.emit(method, params);
    }

    _remoteObjectToString(obj) {
        if (!obj) return 'undefined';
        if (obj.value !== undefined) return String(obj.value);
        if (obj.description) return obj.description;
        return obj.type || 'undefined';
    }

    async initializeCDP() {
        await this.send("Runtime.enable");
        await this.send("Debugger.enable");
        await this.send("Console.enable");
        await this.send("Debugger.setPauseOnExceptions", { state: "none" });
        // Set script source maps
        await this.send("Debugger.setBlackboxPatterns", { patterns: ["node_modules"] }).catch(() => {});
    }

    async initializeDAP() {
        // Initialize DAP Adapter
        const initRes = await this.sendDAP("initialize", {
            clientID: "tilder",
            clientName: "Tilder IDE",
            adapterID: this.runtime,
            linesStartAt1: true,
            columnsStartAt1: true,
            pathFormat: "path"
        });

        // Launch debuggee
        await this.sendDAP("launch", {
            program: this.dapLaunchPath, // Will need to pass this down
            request: "launch",
            type: "python"
        });

        await this.sendDAP("configurationDone");
    }

    sendDAP(command, args = {}) {
        if (!this.connected) return Promise.reject(new Error("Not connected to DAP debugger."));

        const seq = ++this.messageId;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.callbacks.delete(seq);
                reject(new Error(`DAP timeout for: ${command}`));
            }, 8000);

            this.callbacks.set(seq, (response) => {
                clearTimeout(timeout);
                if (!response.success) {
                    reject(new Error(response.message));
                } else {
                    resolve(response.body || {});
                }
            });

            this.dapSocket.emit('dap:message', { type: "request", command, arguments: args, seq });
        });
    }

    _handleDAPEvent(message) {
        if (message.type === 'response' && this.callbacks.has(message.request_seq)) {
            this.callbacks.get(message.request_seq)(message);
            this.callbacks.delete(message.request_seq);
        } else if (message.type === 'event') {
            switch (message.event) {
                case 'stopped':
                    // Map DAP stopped to CDP paused
                    this.dapThreadId = message.body.threadId;
                    this._fetchDAPStackTrace(message.body.threadId);
                    break;
                case 'continued':
                    this.callFrames = [];
                    this.currentFrameId = null;
                    this.pausedLocation = null;
                    this.emit("Debugger.resumed", {});
                    break;
                case 'output':
                    this.emit("console.message", {
                        type: message.body.category === 'stderr' ? 'error' : 'log',
                        text: message.body.output.trim(),
                        timestamp: Date.now()
                    });
                    break;
            }
        }
    }

    async _fetchDAPStackTrace(threadId) {
        try {
            const { stackFrames } = await this.sendDAP("stackTrace", { threadId });
            this.callFrames = stackFrames.map(f => ({
                callFrameId: String(f.id),
                functionName: f.name,
                url: f.source?.path || '',
                location: { lineNumber: Math.max(0, f.line - 1), columnNumber: Math.max(0, f.column - 1) }
            }));
            this.currentFrameId = this.callFrames[0]?.callFrameId || null;
            this.pausedLocation = this.callFrames[0]?.location || null;
            this.emit("Debugger.paused", { callFrames: this.callFrames });
        } catch (e) {
            console.error("Failed to fetch DAP stack trace", e);
        }
    }

    send(method, params = {}) {
        if (!this.connected) return Promise.reject(new Error("Not connected to debugger."));

        const id = ++this.messageId;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.callbacks.delete(id);
                reject(new Error(`CDP timeout for: ${method}`));
            }, 8000);

            this.callbacks.set(id, (data) => {
                clearTimeout(timeout);
                if (data.error) {
                    reject(new Error(data.error.message));
                } else {
                    resolve(data.result || {});
                }
            });

            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    on(event, listener) {
        if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
        this.eventListeners.get(event).push(listener);
    }

    off(event, listener) {
        if (!this.eventListeners.has(event)) return;
        this.eventListeners.set(event, this.eventListeners.get(event).filter(l => l !== listener));
    }

    emit(event, data) {
        (this.eventListeners.get(event) || []).forEach(l => l(data));
    }

    // ─── Debug Actions ───────────────────────────────────────────────────────────

    resume()   { return ['python', 'cpp', 'rust', 'java'].includes(this.runtime) ? this.sendDAP("continue", { threadId: this.dapThreadId || 1 }) : this.send("Debugger.resume"); }
    pause()    { return ['python', 'cpp', 'rust', 'java'].includes(this.runtime) ? this.sendDAP("pause", { threadId: this.dapThreadId || 1 }) : this.send("Debugger.pause"); }
    stepOver() { return ['python', 'cpp', 'rust', 'java'].includes(this.runtime) ? this.sendDAP("next", { threadId: this.dapThreadId || 1 }) : this.send("Debugger.stepOver"); }
    stepInto() { return ['python', 'cpp', 'rust', 'java'].includes(this.runtime) ? this.sendDAP("stepIn", { threadId: this.dapThreadId || 1 }) : this.send("Debugger.stepInto"); }
    stepOut()  { return ['python', 'cpp', 'rust', 'java'].includes(this.runtime) ? this.sendDAP("stepOut", { threadId: this.dapThreadId || 1 }) : this.send("Debugger.stepOut"); }

    // ─── Breakpoints ─────────────────────────────────────────────────────────────

    async _syncDAPBreakpoints(url) {
        if (!['python', 'cpp', 'rust', 'java'].includes(this.runtime) || !this.connected) return;
        const fileBreakpoints = Array.from(this.breakPoints.entries())
            .filter(([key]) => key.startsWith(`${url}:`))
            .map(([key]) => {
                const line = parseInt(key.split(':').pop(), 10);
                return { line };
            });
        await this.sendDAP("setBreakpoints", {
            source: { path: url },
            breakpoints: fileBreakpoints
        });
    }

    async setBreakpoint(url, lineNumber, condition = "") {
        if (['python', 'cpp', 'rust', 'java'].includes(this.runtime)) {
            this.breakPoints.set(`${url}:${lineNumber}`, true);
            await this._syncDAPBreakpoints(url);
            return { breakpointId: `${url}:${lineNumber}` };
        }
        const params = { url, lineNumber, columnNumber: 0 };
        if (condition) params.condition = condition;
        const result = await this.send("Debugger.setBreakpointByUrl", params);
        if (result.breakpointId) {
            this.breakPoints.set(`${url}:${lineNumber}`, result.breakpointId);
        }
        return result;
    }

    async removeBreakpoint(url, lineNumber) {
        const key = `${url}:${lineNumber}`;
        const id = this.breakPoints.get(key);
        if (id) {
            if (['python', 'cpp', 'rust', 'java'].includes(this.runtime)) {
                this.breakPoints.delete(key);
                await this._syncDAPBreakpoints(url);
            } else {
                await this.send("Debugger.removeBreakpoint", { breakpointId: id });
                this.breakPoints.delete(key);
            }
        }
    }

    async clearAllBreakpoints() {
        const urlsToSync = new Set();
        for (const [key, id] of this.breakPoints.entries()) {
            if (['python', 'cpp', 'rust', 'java'].includes(this.runtime)) {
                const url = key.substring(0, key.lastIndexOf(':'));
                urlsToSync.add(url);
            } else {
                await this.send("Debugger.removeBreakpoint", { breakpointId: id }).catch(() => {});
            }
        }
        this.breakPoints.clear();
        for (const url of urlsToSync) {
            await this._syncDAPBreakpoints(url).catch(() => {});
        }
    }

    // ─── Variable Inspection ─────────────────────────────────────────────────────

    /**
     * Gets scoped variables for the current (or specified) call frame.
     * Returns a structured array of { name, value, type, objectId }.
     */
    async getScopeVariables(frameId = null) {
        const targetFrameId = frameId || this.currentFrameId;
        const frame = this.callFrames.find(f => f.callFrameId === targetFrameId)
            || this.callFrames[0];

        if (!frame) return [];

        const allVars = [];

        for (const scope of (frame.scopeChain || [])) {
            if (!scope.object?.objectId) continue;
            if (scope.type === 'global') continue; // too noisy

            try {
                const { result } = await this.send("Runtime.getProperties", {
                    objectId: scope.object.objectId,
                    ownProperties: true,
                    generatePreview: true,
                });

                const scopeLabel = scope.name || scope.type || 'Local';
                for (const prop of (result || [])) {
                    if (prop.name.startsWith('__') || prop.name === 'arguments') continue;
                    allVars.push({
                        name: prop.name,
                        type: prop.value?.type || 'undefined',
                        value: this._remoteObjectToString(prop.value),
                        description: prop.value?.description || '',
                        objectId: prop.value?.objectId || null,
                        preview: prop.value?.preview,
                        scope: scopeLabel,
                    });
                }
            } catch { /* skip scope on error */ }
        }

        return allVars;
    }

    /**
     * Recursively fetches child properties of a remote object.
     */
    async getProperties(objectId) {
        const { result } = await this.send("Runtime.getProperties", {
            objectId,
            ownProperties: true,
            generatePreview: true,
        });
        return (result || []).map(prop => ({
            name: prop.name,
            type: prop.value?.type || 'undefined',
            value: this._remoteObjectToString(prop.value),
            description: prop.value?.description || '',
            objectId: prop.value?.objectId || null,
            preview: prop.value?.preview,
        }));
    }

    // ─── Evaluate (Debug Console REPL) ───────────────────────────────────────────

    /**
     * Evaluates an expression in the context of the current paused frame,
     * or globally if not paused. Returns { result, error }.
     */
    async evaluate(expression, options = {}) {
        try {
            if (this.currentFrameId && !options.global) {
                // Evaluate in paused frame scope
                const result = await this.send("Debugger.evaluateOnCallFrame", {
                    callFrameId: this.currentFrameId,
                    expression,
                    generatePreview: true,
                    returnByValue: false,
                });
                return {
                    result: this._remoteObjectToString(result.result),
                    rawResult: result.result,
                    wasThrown: result.exceptionDetails != null,
                    error: result.exceptionDetails?.exception?.description || null,
                };
            }

            const result = await this.send("Runtime.evaluate", {
                expression,
                generatePreview: true,
                returnByValue: false,
            });
            return {
                result: this._remoteObjectToString(result.result),
                rawResult: result.result,
                wasThrown: result.exceptionDetails != null,
                error: result.exceptionDetails?.exception?.description || null,
            };
        } catch (err) {
            return { result: null, wasThrown: true, error: err.message };
        }
    }

    /** Returns structured call stack for the sidebar */
    getCallStack() {
        return this.callFrames.map((frame, index) => ({
            index,
            id: frame.callFrameId,
            name: frame.functionName || '(anonymous)',
            url: frame.url || '',
            line: (frame.location?.lineNumber || 0) + 1,
            column: frame.location?.columnNumber || 0,
            isCurrent: index === 0,
        }));
    }

    async stop() {
        if (this.unlisteners) {
            this.unlisteners.forEach(unlisten => unlisten());
            this.unlisteners = [];
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.pid) {
            await invoke("kill_process", { pid: this.pid }).catch(() => {});
            this.pid = null;
        }
        this.connected = false;
        this.callFrames = [];
        this.currentFrameId = null;
    }
}

export const debugApi = new DebugSession();
