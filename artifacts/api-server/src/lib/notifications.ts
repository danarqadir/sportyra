import type { Response } from "express";

const clients = new Map<number, Set<Response>>();
const MAX_CONNECTIONS_PER_USER = 3;

export function addNotificationClient(res: Response, userId: number) {
  let userClients = clients.get(userId);
  if (!userClients) {
    userClients = new Set();
    clients.set(userId, userClients);
  }
  if (userClients.size >= MAX_CONNECTIONS_PER_USER) {
    return false;
  }
  userClients.add(res);
  res.on("close", () => {
    userClients?.delete(res);
    if (userClients && userClients.size === 0) clients.delete(userId);
  });
  return true;
}

export function broadcastNotification(payload: { id: number; title: string; url: string }) {
  const data = `event: new-story\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const [, userClients] of clients) {
    for (const client of userClients) {
      try { client.write(data); } catch { userClients.delete(client); }
    }
  }
}
