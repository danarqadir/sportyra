import type { Response } from "express";

const clients = new Set<Response>();

export function addNotificationClient(res: Response) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function broadcastNotification(payload: { id: number; title: string; url: string }) {
  const data = `event: new-story\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try { client.write(data); } catch { clients.delete(client); }
  }
}
