import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers['x-partner-id']",
    "res.headers['set-cookie']",
    "req.body.password",
    "req.body.currentPassword",
    "req.body.newPassword",
    "req.body.token",
    "req.body.secret",
    "req.body.email",
    "req.body.authorEmail",
    "req.body.name",
    "req.body.phone",
    "req.body.address",
    "req.body.facebook",
    "req.body.instagram",
    "req.body.tiktok",
    "req.body.youtube",
    "req.body.website",
    "req.body.resetToken",
    "req.query.token",
    "req.params.token",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
