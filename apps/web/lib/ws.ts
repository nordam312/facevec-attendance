'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from './api';
import type { AttendanceEvent } from './types';

const WS_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080').replace(/^http/, 'ws');

export type FeedStatus = 'connecting' | 'open' | 'closed';

/** Subscribe to the live attendance feed for a session over WebSocket. */
export function useAttendanceFeed(sessionId: string | null): {
  status: FeedStatus;
  events: AttendanceEvent[];
} {
  const [status, setStatus] = useState<FeedStatus>('connecting');
  const [events, setEvents] = useState<AttendanceEvent[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    let closedByUs = false;
    let socket: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const token = getAccessToken();
      if (!token) {
        reconnect = setTimeout(connect, 1000);
        return;
      }
      setStatus('connecting');
      const ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);
      socket = ws;

      ws.onopen = () => {
        setStatus('open');
        ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as AttendanceEvent | { type: string };
          if (msg.type === 'attendance.recorded') {
            setEvents((prev) => [msg as AttendanceEvent, ...prev]);
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setStatus('closed');
        if (!closedByUs) reconnect = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closedByUs = true;
      if (reconnect) clearTimeout(reconnect);
      socket?.close();
    };
  }, [sessionId]);

  return { status, events };
}
