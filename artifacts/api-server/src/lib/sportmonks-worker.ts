import { logger } from "./logger";
import { isSportmonksConfigured } from "./sportmonks";
import { runSportmonksSync } from "./sportmonks-sync";

const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let running = true;
let syncing = false;
let timer: NodeJS.Timeout | null = null;

export function startSportmonksSyncWorker(): void {
  if (!isSportmonksConfigured()) {
    logger.warn("Sportmonks sync worker not started: SPORTMONKS_API_KEY not configured");
    return;
  }
  logger.info("Starting Sportmonks sync worker");
  void tick();
  timer = setInterval(() => void tick(), SYNC_INTERVAL_MS);
  timer.unref();
}

async function tick(): Promise<void> {
  if (syncing || !running) return;
  syncing = true;
  try {
    await runSportmonksSync({
      leagues: true,
      teams: true,
      players: true,
      fixtures: true,
      livescores: true,
      standings: true,
      transfers: true,
      matchDetails: true,
      playerStats: true,
    });
  } catch (err) {
    logger.error({ err }, "Sportmonks sync worker failed");
  } finally {
    syncing = false;
  }
}

export function stopSportmonksSyncWorker(): void {
  running = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  logger.info("Stopping Sportmonks sync worker");
}
