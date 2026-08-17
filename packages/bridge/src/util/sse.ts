/**
 * Server-Sent Events broadcaster. Used by GET /events so the Figma plugin UI
 * (or any local listener) can watch for selection-change events without
 * polling.
 *
 * The bridge itself doesn't need these notifications — it's the source —
 * but exposing them keeps the door open for a future "live preview" UI
 * running in a browser tab.
 */
import { type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

export interface SseEvent {
  type: string;
  data: unknown;
}

type Subscriber = (event: SseEvent) => void;

export class SseBroadcaster {
  private subscribers = new Map<string, Subscriber>();

  add(res: ServerResponse): () => void {
    const id = randomUUID();
    const subscriber: Subscriber = (event) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event.data)}\n\n`);
    };
    this.subscribers.set(id, subscriber);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ subscriberId: id })}\n\n`);

    const cleanup = () => {
      this.subscribers.delete(id);
      try {
        res.end();
      } catch {
        // Already closed.
      }
    };
    res.on('close', cleanup);
    return cleanup;
  }

  broadcast(event: SseEvent): void {
    for (const sub of this.subscribers.values()) {
      try {
        sub(event);
      } catch {
        // Subscriber will be cleaned up on its next close event.
      }
    }
  }

  size(): number {
    return this.subscribers.size;
  }
}
