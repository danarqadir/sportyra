import { Router } from "express";
import { addNotificationClient } from "../lib/notifications";

const router = Router();

router.get("/notifications/stream", (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);
  addNotificationClient(res);
  const heartbeat = setInterval(() => res.write(`event: ping\ndata: {}\n\n`), 25_000);
  res.on("close", () => clearInterval(heartbeat));
});

export default router;
