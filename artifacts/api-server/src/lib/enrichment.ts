import type { Request } from "express"
import crypto from "node:crypto"

export interface EnrichedEvent {
  clientIpHash: string
  clientIpCountry: string | null
  clientIpAsn: number | null
  clientIpIsDatacenter: boolean

  userAgentHash: string
  userAgentEngine: string
  userAgentOs: string
  userAgentIsBot: boolean

  ja3Hash: string | null
  headerOrderHash: string
  h2SettingsHash: string | null

  serverFingerprint: string

  timestamp: string
  serverTimestamp: string
}

const BOT_PATTERNS = [
  "bot", "crawl", "spider", "slurp", "mediapartners", "axe",
  "puppeteer", "selenium", "playwright", "headless", "curl",
  "wget", "python-requests", "go-http", "java/", "scrapy", "phantom"
]

const UA_BOT_RE = new RegExp(BOT_PATTERNS.join("|"), "i")

export function getIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  if (Array.isArray(forwarded)) {
    const first = forwarded[0]?.trim()
    if (first) return first
  }
  return req.socket.remoteAddress || req.ip || "0.0.0.0"
}

export function hashIp(ip: string): string {
  const secret = process.env["FRAUD_IP_HMAC_SECRET"]
  if (!secret) throw new Error("FRAUD_IP_HMAC_SECRET must be set in the environment")
  const today = new Date().toISOString().slice(0, 10)
  return crypto
    .createHmac("sha256", `${secret}:${today}`)
    .update(ip)
    .digest("hex")
    .slice(0, 16)
}

export function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16)
}

export function parseUserAgent(ua: string): { engine: string; os: string; isBot: boolean } {
  let engine = "unknown"
  if (/Edg|Chrome|OPR/i.test(ua)) engine = "blink"
  else if (/Firefox/i.test(ua)) engine = "gecko"
  else if (/Safari/i.test(ua)) engine = "webkit"

  let os = "unknown"
  if (/Windows/i.test(ua)) os = "windows"
  else if (/Mac OS|macOS/i.test(ua)) os = "macos"
  else if (/Linux(?!.*Android)/i.test(ua)) os = "linux"
  else if (/Android/i.test(ua)) os = "android"
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "ios"

  const isBot = UA_BOT_RE.test(ua)

  return { engine, os, isBot }
}

export function computeHeaderOrderHash(req: Request): string {
  const names = Object.keys(req.headers).sort().join("|")
  return crypto.createHash("sha256").update(names).digest("hex").slice(0, 16)
}

export function computeServerFingerprint(req: Request): string {
  const fields = [
    req.headers["user-agent"] || "",
    req.headers["accept-language"] || "",
    req.headers["accept-encoding"] || "",
    req.headers["accept"] || "",
    req.headers["sec-fetch-dest"] || "",
    req.headers["sec-fetch-mode"] || "",
    req.headers["sec-fetch-site"] || "",
    req.headers["sec-ch-ua"] || "",
    req.headers["sec-ch-ua-platform"] || "",
    req.headers["connection"] || ""
  ]
  return crypto.createHash("sha256").update(fields.join("|")).digest("hex").slice(0, 16)
}

// TODO: integrate MaxMind GeoIP2 for country/ASN/datacenter lookup
function geoLookup(_ip: string): { country: string | null; asn: number | null; isDatacenter: boolean } {
  return { country: null, asn: null, isDatacenter: false }
}

// TODO: extract JA3 hash from TLS terminator (e.g. nginx ssl_ja3 module or Envoy)
// TODO: extract HTTP/2 settings hash from TLS terminator
export function enrichEvent(req: Request): EnrichedEvent {
  const ip = getIp(req)
  const ua = req.headers["user-agent"] || ""
  const parsed = parseUserAgent(ua)
  const geo = geoLookup(ip)
  const now = new Date().toISOString()

  return {
    clientIpHash: hashIp(ip),
    clientIpCountry: geo.country,
    clientIpAsn: geo.asn,
    clientIpIsDatacenter: geo.isDatacenter,

    userAgentHash: hashValue(ua),
    userAgentEngine: parsed.engine,
    userAgentOs: parsed.os,
    userAgentIsBot: parsed.isBot,

    ja3Hash: null,
    headerOrderHash: computeHeaderOrderHash(req),
    h2SettingsHash: null,

    serverFingerprint: computeServerFingerprint(req),

    timestamp: req.headers["x-request-start"] as string || now,
    serverTimestamp: now
  }
}
