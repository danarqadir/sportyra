import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      status: "ok",
      database: "ok",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "0.0.0",
    });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

export default router;
