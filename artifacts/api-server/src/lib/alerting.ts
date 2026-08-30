import crypto from "node:crypto";
import { db, detectionAlertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SLACK_WEBHOOK_URL = process.env["FRAUD_SLACK_WEBHOOK_URL"];
const PAGERDUTY_ROUTING_KEY = process.env["FRAUD_PAGERDUTY_ROUTING_KEY"];

export interface AlertOptions {
  tier: "T0" | "T1" | "T2" | "T3";
  ruleIds: string[];
  partnerId: number | null;
  summary: string;
  evidence: Record<string, unknown>;
  fraudScoreAvg: number;
  affectedEvents: number;
}

export async function createAlert(options: AlertOptions): Promise<string> {
  const alertId = crypto.randomUUID();

  await db.insert(detectionAlertsTable).values({
    alertId,
    tier: options.tier,
    ruleIds: options.ruleIds,
    partnerId: options.partnerId,
    summary: options.summary,
    evidence: options.evidence,
    fraudScoreAvg: options.fraudScoreAvg,
    affectedEvents: options.affectedEvents,
  });

  await notifyExternal(options.tier, alertId, options.summary, options.partnerId);

  return alertId;
}

async function notifyExternal(
  tier: string,
  alertId: string,
  summary: string,
  partnerId: number | null,
): Promise<void> {
  if (tier === "T0" || tier === "T1") {
    await sendSlackAlert(tier, alertId, summary, partnerId);
    if (tier === "T0" && PAGERDUTY_ROUTING_KEY) {
      await sendPagerDutyAlert(tier, alertId, summary, partnerId);
    }
  } else if (tier === "T2" && SLACK_WEBHOOK_URL) {
    await sendSlackAlert(tier, alertId, summary, partnerId);
  }
}

async function sendSlackAlert(
  tier: string,
  alertId: string,
  summary: string,
  partnerId: number | null,
): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    const color = tier === "T0" ? "#FF0000" : tier === "T1" ? "#FF8C00" : tier === "T2" ? "#FFD700" : "#808080";
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attachments: [{
          color,
          blocks: [
            {
              type: "header",
              text: { type: "plain_text", text: `Fraud Alert [${tier}]` },
            },
            {
              type: "section",
              fields: [
                { type: "mrkdwn", text: `*Alert ID:*\n${alertId}` },
                { type: "mrkdwn", text: `*Tier:*\n${tier}` },
                { type: "mrkdwn", text: `*Partner:*\n${partnerId ?? "N/A"}` },
              ],
            },
            {
              type: "section",
              text: { type: "mrkdwn", text: `*Summary:*\n${summary}` },
            },
          ],
        }],
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* best-effort */ }
}

async function sendPagerDutyAlert(
  tier: string,
  alertId: string,
  summary: string,
  partnerId: number | null,
): Promise<void> {
  if (!PAGERDUTY_ROUTING_KEY) return;
  try {
    await fetch("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routing_key: PAGERDUTY_ROUTING_KEY,
        event_action: "trigger",
        dedup_key: `fraud-${alertId}`,
        payload: {
          summary: `[${tier}] Fraud alert: ${summary}`,
          severity: tier === "T0" ? "critical" : "warning",
          source: "sportyra-fraud-engine",
          component: "fraud-detection",
          custom_details: {
            alertId,
            tier,
            partnerId,
            summary,
          },
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* best-effort */ }
}

export async function resolveAlert(
  alertId: string,
  resolution: string,
  notes: string,
  resolvedBy: string,
): Promise<void> {
  await db.update(detectionAlertsTable)
    .set({
      status: "resolved",
      resolution,
      resolutionNotes: notes,
      resolvedAt: new Date(),
      resolvedBy,
      updatedAt: new Date(),
    })
    .where(eq(detectionAlertsTable.alertId, alertId));
}

export async function escalateAlert(
  alertId: string,
  escalatedTo: string,
): Promise<void> {
  await db.update(detectionAlertsTable)
    .set({
      status: "escalated",
      assignedTo: escalatedTo,
      assignedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(detectionAlertsTable.alertId, alertId));
}
