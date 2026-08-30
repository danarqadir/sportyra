import { db, auditEventsTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const BATCH_SIZE = 1000;

function computeRowHash(row: Record<string, unknown>): string {
  const { row_hash, ...rest } = row;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

let running = true;

async function verifyChain(): Promise<void> {
  try {
    const rows = await db.select()
      .from(auditEventsTable)
      .orderBy(desc(auditEventsTable.id))
      .limit(BATCH_SIZE);

    if (rows.length === 0) return;

    let brokenLinks = 0;
    let firstBrokenId: number | null = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const computedHash = computeRowHash(row as unknown as Record<string, unknown>);

      if (computedHash !== row.rowHash) {
        brokenLinks++;
        if (!firstBrokenId) firstBrokenId = row.id;
      }

      if (i < rows.length - 1) {
        const prevRow = rows[i + 1];
        if (row.previousHash !== prevRow.rowHash) {
          brokenLinks++;
          if (!firstBrokenId) firstBrokenId = row.id;
        }
      }
    }

    if (brokenLinks > 0) {
      logger.error({ brokenLinks, firstBrokenId }, "Audit chain integrity check FAILED");
    } else {
      logger.info({ checked: rows.length }, "Audit chain integrity check passed");
    }
  } catch (err) {
    logger.error({ err }, "Audit chain verification error");
  }
}

async function loop(): Promise<void> {
  while (running) {
    await new Promise<void>((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));
    if (running) await verifyChain();
  }
}

export function startChainVerifier(): void {
  logger.info("Starting audit chain verifier (hourly)");
  verifyChain(); // Run once immediately
  loop();
}

export function stopChainVerifier(): void {
  running = false;
  logger.info("Stopping audit chain verifier");
}
