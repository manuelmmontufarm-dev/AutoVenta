import { EventEmitter } from "node:events";

export interface LiveEvent {
  id: number;
  type: "sync" | "message" | "status" | "settings" | "follow_up" | "alert";
  conversationId?: number;
  title?: string;
  body?: string;
  icon?: string;
  at: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(200);
let sequence = 0;

export function emitLiveEvent(
  type: LiveEvent["type"],
  conversationId?: number,
  details?: Pick<LiveEvent, "title" | "body" | "icon">,
): LiveEvent {
  const event: LiveEvent = {
    id: ++sequence,
    type,
    conversationId,
    ...details,
    at: new Date().toISOString(),
  };
  bus.emit("event", event);
  return event;
}

export function subscribeLiveEvents(listener: (event: LiveEvent) => void): () => void {
  bus.on("event", listener);
  return () => bus.off("event", listener);
}
