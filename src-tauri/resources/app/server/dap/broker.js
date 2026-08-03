export function createDapBroker({
  normalizeWorkspaceRoot,
  resolveInstalledCommand,
  emitStatus,
  namespace,
  spawnProcess,
  parseMessages,
  encodeMessage,
}) {
  const sessions = new Map();

  function getSessionKey(sessionId) {
    return `dap-session-${sessionId}`;
  }

  function startSessionProcess(session) {
    if (!session.command) {
      throw new Error(`${session.adapter.serverLabel} is not installed.`);
    }

    session.closing = false;
    session.stdoutBuffer = Buffer.alloc(0);
    try {
      session.process = spawnProcess(session.command, session.launchArgs || [], session.workspaceRoot);
    } catch (error) {
      emitStatus(session, {
        status: 'error',
        sessionId: session.id,
        message: error instanceof Error ? error.message : 'Failed to start debug adapter.',
      });
      sessions.delete(session.key);
      return;
    }

    if (!session.process) {
      emitStatus(session, {
        status: 'error',
        sessionId: session.id,
        message: 'Failed to start debug adapter process.',
      });
      sessions.delete(session.key);
      return;
    }

    session.process.stdout.on('data', (chunk) => {
      session.stdoutBuffer = parseMessages(
        Buffer.concat([session.stdoutBuffer, chunk]),
        (message) => {
          namespace.to(session.room).emit('dap:message', message);
        }
      );
    });

    session.process.stderr.on('data', (chunk) => {
      namespace.to(session.room).emit('dap:stderr', chunk.toString());
    });

    session.process.on('error', (error) => {
      emitStatus(session, {
        status: 'error',
        sessionId: session.id,
        message: error instanceof Error ? error.message : 'Failed to start debug adapter.',
      });
    });

    session.process.on('close', () => {
      session.process = null;
      sessions.delete(session.key);
      emitStatus(session, {
        status: 'closed',
        sessionId: session.id,
      });
    });

    emitStatus(session, {
      status: 'connected',
      sessionId: session.id,
      command: session.command,
      serverLabel: session.adapter.serverLabel,
      workspaceRoot: session.workspaceRoot,
    });
  }

  async function startSession(id, workspaceRoot, adapter, launchArgs) {
    const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
    const key = getSessionKey(id);
    const existing = sessions.get(key);
    if (existing) {
      return existing;
    }

    const command = await resolveInstalledCommand(adapter.commands || []);
    if (!command) {
      throw new Error(`${adapter.serverLabel} is not installed on this machine. Could not find ${adapter.commands.join(', ')}`);
    }

    const session = {
      id,
      key,
      room: key,
      workspaceRoot: normalizedWorkspaceRoot,
      adapter,
      command,
      launchArgs,
      process: null,
      clients: new Set(),
      stdoutBuffer: Buffer.alloc(0),
      closing: false,
    };

    sessions.set(key, session);
    startSessionProcess(session);
    return session;
  }

  function attachSocket(socket, session) {
    session.clients.add(socket.id);
    socket.join(session.room);
    
    socket.emit('dap:status', {
      status: 'connected',
      sessionId: session.id,
      serverLabel: session.adapter.serverLabel,
      command: session.command,
      workspaceRoot: session.workspaceRoot,
    });

    socket.on('dap:message', (message) => {
      if (!session.process?.stdin?.writable) {
        return;
      }
      session.process.stdin.write(encodeMessage(message));
    });

    socket.on('disconnect', () => {
      session.clients.delete(socket.id);
      if (session.clients.size === 0) {
        session.closing = true;
        session.process?.kill();
        sessions.delete(session.key);
      }
    });
  }

  return {
    sessions,
    startSession,
    attachSocket,
  };
}
