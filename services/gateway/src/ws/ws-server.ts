import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData } from 'ws';
import { UserId } from '../domain/index.js';
import type { AuthContext } from '../http/types.js';
import { getSession } from '../modules/attendance/attendance.service.js';
import { assertImportJobAccess } from '../modules/courses/bulk-import.service.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';
import { logger } from '../observability/logger.js';
import { isAccessTokenRevoked, userTokenCutoff } from '../redis/token-revocation.js';
import { importTopic } from './broadcaster.js';
import { connectionRegistry, type AuthedSocket } from './connection-registry.js';

/**
 * WebSocket endpoint at `/ws` for the live attendance feed. Clients authenticate
 * with `?token=<accessToken>` on the upgrade, then `subscribe` to sessions they
 * are authorised for; the broadcaster pushes `attendance.recorded` events.
 */
const HEARTBEAT_MS = 30_000;

interface ClientMessage {
  type?: string;
  sessionId?: string;
  jobId?: string;
}

async function authenticate(token: string): Promise<AuthContext | null> {
  try {
    const claims = await verifyAccessToken(token);
    if (await isAccessTokenRevoked(claims.jti)) return null;
    const cutoff = await userTokenCutoff(claims.userId);
    if (cutoff !== null && claims.issuedAt < cutoff) return null;
    return {
      userId: UserId(claims.userId),
      role: claims.role,
      jti: claims.jti,
      expiresAt: claims.expiresAt,
    };
  } catch {
    return null;
  }
}

function send(ws: AuthedSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function onMessage(ws: AuthedSocket, data: RawData): Promise<void> {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(data.toString()) as ClientMessage;
  } catch {
    send(ws, { type: 'error', message: 'invalid JSON' });
    return;
  }

  switch (msg.type) {
    case 'subscribe': {
      // Bulk-import progress stream — authorized via the job's course.
      if (typeof msg.jobId === 'string') {
        try {
          await assertImportJobAccess(msg.jobId, ws.auth); // 404/403 if not permitted
        } catch {
          send(ws, { type: 'error', message: 'not authorized for this job', jobId: msg.jobId });
          return;
        }
        connectionRegistry.subscribe(importTopic(msg.jobId), ws);
        send(ws, { type: 'subscribed', jobId: msg.jobId });
        return;
      }
      if (typeof msg.sessionId !== 'string') {
        send(ws, { type: 'error', message: 'sessionId is required' });
        return;
      }
      try {
        await getSession(msg.sessionId, ws.auth); // 404/403 if not permitted
      } catch {
        send(ws, { type: 'error', message: 'not authorized for this session', sessionId: msg.sessionId });
        return;
      }
      connectionRegistry.subscribe(msg.sessionId, ws);
      send(ws, { type: 'subscribed', sessionId: msg.sessionId });
      return;
    }
    case 'unsubscribe': {
      if (typeof msg.jobId === 'string') {
        connectionRegistry.unsubscribe(importTopic(msg.jobId), ws);
        send(ws, { type: 'unsubscribed', jobId: msg.jobId });
        return;
      }
      if (typeof msg.sessionId === 'string') {
        connectionRegistry.unsubscribe(msg.sessionId, ws);
      }
      send(ws, { type: 'unsubscribed', sessionId: msg.sessionId });
      return;
    }
    case 'ping':
      send(ws, { type: 'pong' });
      return;
    default:
      send(ws, { type: 'error', message: 'unknown message type' });
  }
}

function onConnection(ws: AuthedSocket): void {
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (data) => void onMessage(ws, data));
  ws.on('close', () => connectionRegistry.remove(ws));
  ws.on('error', (err) => logger.warn({ err }, 'ws socket error'));
  send(ws, { type: 'connected' });
}

async function handleUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const token = url.searchParams.get('token');
    const auth = token ? await authenticate(token) : null;
    if (!auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const authed = ws as AuthedSocket;
      authed.auth = auth;
      authed.isAlive = true;
      authed.subscriptions = new Set();
      wss.emit('connection', authed, req);
    });
  } catch (err) {
    logger.error({ err }, 'ws upgrade failed');
    socket.destroy();
  }
}

export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => void handleUpgrade(wss, req, socket, head));
  wss.on('connection', (ws) => onConnection(ws as AuthedSocket));

  // Drop sockets that stop responding to pings.
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const socket = client as AuthedSocket;
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));

  logger.info('websocket server attached at /ws');
  return wss;
}
