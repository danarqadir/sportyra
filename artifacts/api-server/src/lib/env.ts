import { logger } from "./logger";

const required = ["DATABASE_URL", "FRAUD_IP_HMAC_SECRET"] as const;
const optional = ["SPORTYRA_ADMIN_TOKEN", "PORT", "NODE_ENV", "PUBLIC_SITE_URL", "CORS_ORIGIN", "LOG_LEVEL", "PRIVATE_OBJECT_DIR", "PUBLIC_OBJECT_SEARCH_PATHS", "VAPID_PRIVATE_KEY", "VAPID_EMAIL", "RESEND_API_KEY", "EMAIL_FROM", "SPORTS_IMAGE_API_KEY", "SPORTS_IMAGE_API_URL", "SPORTMONKS_API_KEY", "SPORTMONKS_BASE_URL", "GCP_PROJECT_ID", "GCP_SERVICE_ACCOUNT_JSON"] as const;

export function validateEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    logger.fatal({ missing }, "Required environment variables are missing");
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
  if (!process.env["SPORTYRA_ADMIN_TOKEN"]) {
    logger.warn("SPORTYRA_ADMIN_TOKEN is not set — admin CRUD endpoints will return 503");
  }
  if (process.env.NODE_ENV === "production" && !process.env["RESEND_API_KEY"]) {
    logger.warn("RESEND_API_KEY is not set — password reset emails will not be sent in production");
  }
  if (!process.env["SPORTMONKS_API_KEY"]) {
    logger.warn("SPORTMONKS_API_KEY is not set — Sportmonks sports data sync is disabled");
  }
  const port = Number(process.env["PORT"] || "3000");
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
  }
  logger.info({ port, nodeEnv: process.env["NODE_ENV"] || "development", adminToken: process.env["SPORTYRA_ADMIN_TOKEN"] ? "configured" : "missing" }, "Environment validated");
}
