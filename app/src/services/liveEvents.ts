import { EventEmitter } from "node:events";

export interface LiveEvent {
  id: number;
  type: "sync" | "message" | "status" | "settings";
  conversationId?: number;
  at: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(200);
let sequence = 0;

export function emitLiveEvent(
  type: LiveEvent["type"],
  conversationId?: number,
): LiveEvent {
  const event: LiveEvent = {
    id: ++sequence,
    type,
    conversationId,
    at: new Date().toISOString(),
  };
  bus.emit("event", event);
  return event;
}

export function subscribeLiveEvents(listener: (event: LiveEvent) => void): () => void {
  bus.on("event", listener);
  return () => bus.off("event", listener);
}
