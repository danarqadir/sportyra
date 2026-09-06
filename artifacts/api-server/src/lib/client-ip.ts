// Derives the client IP strictly from Express's authoritative `req.ip`, which is
// computed from the socket (and, only when behind a trusted reverse proxy, the
// trusted proxy's forwarded address) according to the configured `trust proxy`
// setting. We intentionally never read `x-forwarded-for`, `x-real-ip`, or
// `forwarded` headers directly here: those values are client-controllable and
// would let an attacker spoof the identity used by rate limiting and fraud
// detection. Correctness therefore depends on `trust proxy` matching the real
// deployment topology (see app.ts).
export type ClientIpSource = {
  ip?: string;
  socket?: { remoteAddress?: string | null } | null;
};

export function getClientIp(source: ClientIpSource): string {
  const ip = source.ip;
  if (ip && ip !== "" && ip !== "::" && ip !== "::ffff:") return ip;
  const remote = source.socket?.remoteAddress;
  if (remote && remote !== "") return remote;
  return "";
}