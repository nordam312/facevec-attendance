import type { WebSocket } from 'ws';
import type { AuthContext } from '../http/types.js';

/** A WebSocket annotated with its authenticated principal and subscriptions. */
export interface AuthedSocket extends WebSocket {
  auth: AuthContext;
  isAlive: boolean;
  subscriptions: Set<string>;
}

/**
 * Per-process map of session id → subscribed sockets. Cross-replica fan-out is
 * handled by the Redis pub/sub broadcaster; this registry only tracks the
 * sockets connected to *this* instance.
 */
class ConnectionRegistry {
  private readonly bySession = new Map<string, Set<AuthedSocket>>();

  subscribe(sessionId: string, socket: AuthedSocket): void {
    let set = this.bySession.get(sessionId);
    if (!set) {
      set = new Set();
      this.bySession.set(sessionId, set);
    }
    set.add(socket);
    socket.subscriptions.add(sessionId);
  }

  unsubscribe(sessionId: string, socket: AuthedSocket): void {
    this.bySession.get(sessionId)?.delete(socket);
    socket.subscriptions.delete(sessionId);
    if (this.bySession.get(sessionId)?.size === 0) {
      this.bySession.delete(sessionId);
    }
  }

  /** Drop a socket from every session it was subscribed to (on disconnect). */
  remove(socket: AuthedSocket): void {
    for (const sessionId of socket.subscriptions) {
      this.bySession.get(sessionId)?.delete(socket);
      if (this.bySession.get(sessionId)?.size === 0) {
        this.bySession.delete(sessionId);
      }
    }
    socket.subscriptions.clear();
  }

  /** Send a payload to every socket subscribed to `sessionId` on this instance. */
  broadcast(sessionId: string, payload: unknown): void {
    const set = this.bySession.get(sessionId);
    if (!set || set.size === 0) return;
    const message = JSON.stringify(payload);
    for (const socket of set) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  }
}

export const connectionRegistry = new ConnectionRegistry();
