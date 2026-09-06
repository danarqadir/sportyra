// Normalizes and validates object paths used by the storage routes. Objects live in
// a flat GCS namespace (no filesystem traversal), but this keeps URLs predictable
// and prevents empty/dot/absolute/backslash segments from becoming odd object names.
export function isSafeObjectPath(value: string): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return false;
  if (trimmed.includes("\\")) return false;
  if (trimmed.startsWith("/")) return false;
  return trimmed.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}