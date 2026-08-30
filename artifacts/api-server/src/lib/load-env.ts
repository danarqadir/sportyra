import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function findEnvFile(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function parseEnvLine(raw: string): { key: string; value: string } | null {
  const line = raw.trim();
  if (!line || line.startsWith("#")) return null;
  const eq = line.indexOf("=");
  if (eq <= 0) return null;
  let key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
  const comment = value.search(/[^\\]#/);
  if (comment !== -1) value = value.slice(0, comment).trim();
  if (key) return { key, value };
  return null;
}

export function loadEnvFile(): void {
  const candidates: string[] = [];
  const cwd = process.cwd();
  const fromCwd = findEnvFile(cwd);
  if (fromCwd) candidates.push(fromCwd);
  if (typeof globalThis.__dirname === "string") {
    const fromDist = findEnvFile(globalThis.__dirname);
    if (fromDist && !candidates.includes(fromDist)) candidates.push(fromDist);
  }
  if (candidates.length === 0) return;
  for (const envFile of candidates) {
    let raw: string;
    try {
      raw = readFileSync(envFile, "utf8");
    } catch {
      continue;
    }
    let loaded = 0;
    for (const line of raw.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      if (process.env[parsed.key] === undefined || process.env[parsed.key] === "") {
        process.env[parsed.key] = parsed.value;
        loaded++;
      }
    }
    if (loaded > 0) {
      console.log(`[env] Loaded ${loaded} variable(s) from ${envFile}`);
      return;
    }
  }
}

loadEnvFile();