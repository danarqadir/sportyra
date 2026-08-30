import "./lib/load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { validateEnv } from "./lib/env";
import { pool } from "@workspace/db";
import { startFraudWorker, stopFraudWorker } from "./lib/fraud-worker";
import { startChainVerifier, stopChainVerifier } from "./lib/chain-verify";
import { startSportmonksSyncWorker, stopSportmonksSyncWorker } from "./lib/sportmonks-worker";

validateEnv();

const port = Number(process.env["PORT"] || "3000");

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startFraudWorker();
  startChainVerifier();
  startSportmonksSyncWorker();
});

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Received shutdown signal, starting graceful shutdown");
  stopFraudWorker();
  stopChainVerifier();
  stopSportmonksSyncWorker();
  server.close(async () => {
    logger.info("HTTP server closed");
    try {
      await pool.end();
      logger.info("Database pool closed");
    } catch (err) {
      logger.error({ err }, "Error closing database pool");
    }
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
