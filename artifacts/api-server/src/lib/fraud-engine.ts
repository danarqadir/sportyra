import type { EnrichedEvent } from "./enrichment";

export interface FraudRule {
  id: string;
  name: string;
  evaluate(ctx: RuleContext): { triggered: boolean; score: number; reason: string };
}

export interface RuleContext {
  event: EnrichedEvent;
  clicksFromIp24h: number;
  clicksFromFingerprint24h: number;
  clicksFromPartner24h: number;
  uniqueIpsForFingerprint24h: number;
  conversionRate7d: number;
  partnerRiskScore: number;
  method: string;
  path: string;
  hasReferer: boolean;
  hasSecFetch: boolean;
  hasAcceptLanguage: boolean;
}

export interface FraudVerdict {
  score: number;
  verdict: "clean" | "soft_flag" | "hard_block";
  reasons: string[];
  credited: boolean;
  throttle: boolean;
}

const WEIGHTS: Record<string, number> = {
  "CV": 1.0,
  "BT": 1.2,
  "SE": 0.6,
};

const rules: FraudRule[] = [
  {
    id: "CV-01",
    name: "Click velocity: IP",
    evaluate(ctx) {
      const count = ctx.clicksFromIp24h;
      if (count > 120) return { triggered: true, score: 50, reason: `${count} clicks from IP in 24h (>120)` };
      if (count > 60) return { triggered: true, score: 30, reason: `${count} clicks from IP in 24h (>60)` };
      if (count > 30) return { triggered: true, score: 15, reason: `${count} clicks from IP in 24h (>30)` };
      return { triggered: false, score: 0, reason: "" };
    },
  },
  {
    id: "CV-02",
    name: "Click velocity: partner",
    evaluate(ctx) {
      const count = ctx.clicksFromPartner24h;
      if (count > 500) return { triggered: true, score: 40, reason: `${count} clicks to partner in 24h (>500)` };
      if (count > 200) return { triggered: true, score: 20, reason: `${count} clicks to partner in 24h (>200)` };
      return { triggered: false, score: 0, reason: "" };
    },
  },
  {
    id: "CV-03",
    name: "Click velocity: device fingerprint",
    evaluate(ctx) {
      const count = ctx.clicksFromFingerprint24h;
      if (count > 30) return { triggered: true, score: 50, reason: `${count} clicks from fingerprint in 24h (>30)` };
      if (count > 10) return { triggered: true, score: 25, reason: `${count} clicks from fingerprint in 24h (>10)` };
      return { triggered: false, score: 0, reason: "" };
    },
  },
  {
    id: "CV-04",
    name: "Click-to-conversion ratio anomaly",
    evaluate(ctx) {
      if (ctx.clicksFromIp24h > 100 && ctx.conversionRate7d < 0.01) {
        return { triggered: true, score: 30, reason: `Low conversion (${(ctx.conversionRate7d * 100).toFixed(1)}%) with high click volume` };
      }
      return { triggered: false, score: 0, reason: "" };
    },
  },
  {
    id: "CV-07",
    name: "Fingerprint shared across multiple IPs",
    evaluate(ctx) {
      const count = ctx.uniqueIpsForFingerprint24h;
      if (count > 20) return { triggered: true, score: 40, reason: `Fingerprint shared across ${count} IPs (>20)` };
      if (count > 5) return { triggered: true, score: 20, reason: `Fingerprint shared across ${count} IPs (>5)` };
      return { triggered: false, score: 0, reason: "" };
    },
  },
  {
    id: "CV-08",
    name: "Missing browser security headers",
    evaluate(ctx) {
      if (!ctx.hasSecFetch && !ctx.hasAcceptLanguage) {
        return { triggered: true, score: 15, reason: "Missing Sec-Fetch and Accept-Language headers" };
      }
      return { triggered: false, score: 0, reason: "" };
    },
  },
  {
    id: "BT-01",
    name: "Headless browser detected",
    evaluate(ctx) {
      if (ctx.event.userAgentIsBot) {
        return { triggered: true, score: 40, reason: `Known bot/automation UA detected` };
      }
      return { triggered: false, score: 0, reason: "" };
    },
  },
  {
    id: "BT-02",
    name: "Datacenter IP detected",
    evaluate(ctx) {
      if (ctx.event.clientIpIsDatacenter) {
        return { triggered: true, score: 20, reason: "Request from datacenter IP" };
      }
      return { triggered: false, score: 0, reason: "" };
    },
  },
  {
    id: "BT-03",
    name: "Known bot JA3 fingerprint",
    evaluate(_ctx) {
      return { triggered: false, score: 0, reason: "" };
    },
  },
  {
    id: "SE-01",
    name: "Partner elevated risk score",
    evaluate(ctx) {
      if (ctx.partnerRiskScore > 50) {
        return { triggered: true, score: 15, reason: `Partner risk score ${ctx.partnerRiskScore} > 50` };
      }
      return { triggered: false, score: 0, reason: "" };
    },
  },
];

export function evaluateFraud(ctx: RuleContext): FraudVerdict {
  const reasons: string[] = [];
  let rawScore = 0;

  for (const rule of rules) {
    const result = rule.evaluate(ctx);
    if (result.triggered) {
      const category = rule.id.split("-")[0];
      const weight = WEIGHTS[category] ?? 1.0;
      rawScore += result.score * weight;
      reasons.push(rule.id);
    }
  }

  const score = Math.min(100, Math.round(rawScore));

  let verdict: FraudVerdict["verdict"];
  let credited: boolean;
  let throttle: boolean;

  if (score >= 80) {
    verdict = "hard_block";
    credited = false;
    throttle = true;
  } else if (score >= 60) {
    verdict = "soft_flag";
    credited = false;
    throttle = true;
  } else if (score >= 30) {
    verdict = "soft_flag";
    credited = false;
    throttle = false;
  } else {
    verdict = "clean";
    credited = true;
    throttle = false;
  }

  return { score, verdict, reasons, credited, throttle };
}
