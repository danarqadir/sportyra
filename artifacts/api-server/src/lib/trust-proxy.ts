// Resolves the Express `trust proxy` setting from TRUST_PROXY.
//
// The application is deployed behind exactly one reverse proxy that terminates
// TLS and forwards to http://localhost:3000 (see README Deployment + `.env.example`
// note #6). The proxy therefore connects to the app over loopback.
//
// The safe default is "loopback": Express trusts X-Forwarded-For ONLY when the
// direct socket peer is a loopback address (i.e. the local reverse proxy). A
// remote client connecting directly (no proxy) has a non-loopback peer and so
// cannot spoof `req.ip`. Platforms whose proxy connects from a non-loopback
// private address (e.g. managed PaaS ingress) can set TRUST_PROXY explicitly.
//
// Accepted TRUST_PROXY values:
//   (unset | empty)  -> "loopback"  (safe default)
//   false|off|none|0 -> false       (never trust any forwarding header)
//   true|all         -> true        (trust all — only if a trusted proxy strips the header)
//   loopback|linklocal|uniquelocal -> that predefined trust
//   <number>         -> N hops
//   <ip or cidr>     -> a single address or CIDR, e.g. "10.0.0.1" or "10.0.0.0/8"
//   a,b              -> a comma-separated list of addresses/CIDRs
export type TrustProxySetting = boolean | number | string | string[];

export function resolveTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = (raw ?? "").trim();
  if (!value) return "loopback";
  if (/^(false|off|none|0)$/i.test(value)) return false;
  if (/^(true|all)$/i.test(value)) return true;
  if (/^(loopback|linklocal|uniquelocal)$/i.test(value)) return value.toLowerCase();
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return "loopback";
  return parts.length === 1 ? parts[0] : parts;
}
