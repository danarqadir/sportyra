import { db, publisherRiskScoresTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { createAlert } from "./alerting";
import { logger } from "./logger";

const REDIS_URL = process.env["REDIS_URL"];
const STREAM_KEY = "fraud:events";
const GROUP_NAME = "fraud-workers";
const CONSUMER_NAME = `worker-${process.pid}`;
const POLL_INTERVAL_MS = 5000;

interface RedisLike {
  xgroupCreateMkStream(key: string, group: string, id: string): Promise<string | number>;
  xreadgroup(group: string, consumer: string, count: number, block: number, ...args: (string | number)[]): Promise<[string, [string, string[]][]][] | null>;
  xack(key: string, group: string, ...ids: string[]): Promise<number>;
}

let redisClient: RedisLike | null = null;
let running = true;

async function getRedisClient(): Promise<RedisLike | null> {
  if (redisClient) return redisClient;
  if (!REDIS_URL) return null;
  try {
    const createClient = (await Function("return import('redis')")()).default?.createClient;
    if (!createClient) return null;
    const client = createClient({ url: REDIS_URL });
    client.on("error", () => { redisClient = null; });
    await client.connect();
    await client.xgroupCreateMkStream(STREAM_KEY, GROUP_NAME, "0").catch(() => {});
    redisClient = client as unknown as RedisLike;
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

interface FraudEvent {
  partnerId: number;
  fraudScore: number;
  fraudVerdict: string;
  fraudReasons: string[];
  ipHash: string;
  fingerprint: string;
  timestamp: string;
}

function parseEvent(fields: string[]): FraudEvent | null {
  const map = new Map<string, string>();
  for (let i = 0; i < fields.length; i += 2) {
    map.set(fields[i], fields[i + 1]);
  }
  const partnerId = parseInt(map.get("partnerId") || "0", 10);
  if (!partnerId) return null;
  return {
    partnerId,
    fraudScore: parseInt(map.get("fraudScore") || "0", 10),
    fraudVerdict: map.get("fraudVerdict") || "clean",
    fraudReasons: JSON.parse(map.get("fraudReasons") || "[]"),
    ipHash: map.get("ipHash") || "",
    fingerprint: map.get("fingerprint") || "",
    timestamp: map.get("timestamp") || new Date().toISOString(),
  };
}

async function processEvent(event: FraudEvent): Promise<void> {
  const { partnerId, fraudScore, fraudVerdict, fraudReasons } = event;

  const existing = await db.select().from(publisherRiskScoresTable)
    .where(eq(publisherRiskScoresTable.partnerId, partnerId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(publisherRiskScoresTable).values({
      partnerId,
      riskScore: fraudScore,
      clickVelocityScore: fraudReasons.some(r => r.startsWith("CV")) ? fraudScore : 0,
      botSignalScore: fraudReasons.some(r => r.startsWith("BT")) ? fraudScore : 0,
      conversionAnomalyScore: fraudReasons.includes("CV-04") ? fraudScore : 0,
      geoAnomalyScore: 0,
      behavioralScore: fraudReasons.some(r => r.startsWith("SE")) ? fraudScore : 0,
      lastEvaluatedAt: new Date(),
    });
  } else {
    const current = existing[0];
    const componentUpdate: Record<string, unknown> = { lastEvaluatedAt: new Date(), updatedAt: new Date() };

    if (fraudReasons.some(r => r.startsWith("CV"))) {
      componentUpdate.clickVelocityScore = Math.min(100, current.clickVelocityScore + Math.round(fraudScore * 0.3));
    }
    if (fraudReasons.some(r => r.startsWith("BT"))) {
      componentUpdate.botSignalScore = Math.min(100, current.botSignalScore + Math.round(fraudScore * 0.4));
    }
    if (fraudReasons.includes("CV-04")) {
      componentUpdate.conversionAnomalyScore = Math.min(100, current.conversionAnomalyScore + Math.round(fraudScore * 0.3));
    }
    if (fraudReasons.some(r => r.startsWith("SE"))) {
      componentUpdate.behavioralScore = Math.min(100, current.behavioralScore + Math.round(fraudScore * 0.2));
    }

    const newRiskScore = Math.min(100, Math.round(
      (componentUpdate.clickVelocityScore as number || current.clickVelocityScore) * 0.3 +
      (componentUpdate.botSignalScore as number || current.botSignalScore) * 0.3 +
      (componentUpdate.conversionAnomalyScore as number || current.conversionAnomalyScore) * 0.2 +
      (componentUpdate.behavioralScore as number || current.behavioralScore) * 0.2
    ));
    componentUpdate.riskScore = newRiskScore;

    if (newRiskScore > 70 && fraudVerdict === "hard_block") {
      componentUpdate.status = "suspended";
      componentUpdate.suspendedAt = new Date();
      componentUpdate.suspendedBy = "auto_fraud";
    } else if (newRiskScore > 50) {
      componentUpdate.status = "watchlist";
      componentUpdate.watchlistReason = `Risk score ${newRiskScore} exceeds threshold`;
    }

    await db.update(publisherRiskScoresTable)
      .set(componentUpdate)
      .where(eq(publisherRiskScoresTable.partnerId, partnerId));

    if (newRiskScore > 50 && current.riskScore <= 50) {
      await createAlert({
        tier: newRiskScore > 70 ? "T1" : "T2",
        ruleIds: fraudReasons,
        partnerId,
        summary: `Publisher risk score elevated to ${newRiskScore} (was ${current.riskScore}). Verdict: ${fraudVerdict}. Reasons: ${fraudReasons.join(", ")}`,
        evidence: { previousScore: current.riskScore, newScore: newRiskScore, fraudVerdict, fraudReasons },
        fraudScoreAvg: fraudScore,
        affectedEvents: 1,
      });
    }
  }
}

async function poll(): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    if (running) setTimeout(poll, POLL_INTERVAL_MS * 2);
    return;
  }
  try {
    const result = await client.xreadgroup(GROUP_NAME, CONSUMER_NAME, 10, POLL_INTERVAL_MS, "STREAMS", STREAM_KEY, ">");
    if (!result || result.length === 0) {
      if (running) setTimeout(poll, POLL_INTERVAL_MS);
      return;
    }
    const [, messages] = result[0];
    for (const [id, fields] of messages) {
      try {
        const event = parseEvent(fields);
        if (event) await processEvent(event);
        await client.xack(STREAM_KEY, GROUP_NAME, id);
      } catch (err) {
        logger.error({ err, messageId: id }, "Failed to process fraud event");
      }
    }
  } catch (err) {
    logger.error({ err }, "Fraud worker poll error");
    redisClient = null;
  }
  if (running) setTimeout(poll, 0);
}

export function startFraudWorker(): void {
  logger.info("Starting fraud detection worker");
  poll();
}

export function stopFraudWorker(): void {
  running = false;
  logger.info("Stopping fraud detection worker");
}
