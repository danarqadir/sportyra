import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { File, Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

function isGcpConfigured(): boolean {
  return Boolean(process.env.GCP_PROJECT_ID && process.env.GCP_SERVICE_ACCOUNT_JSON);
}

// Storage client is created lazily so importing this module never fails when GCP
// credentials are absent (e.g. production boots without them; storage endpoints then
// return a clean error instead of crashing the process at module load).
let storageClient: Storage | null = null;

function getStorageClient(): Storage {
  if (storageClient) return storageClient;

  if (isGcpConfigured()) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(Buffer.from(process.env.GCP_SERVICE_ACCOUNT_JSON!, "base64").toString("utf-8"));
    } catch {
      throw new Error("GCP_SERVICE_ACCOUNT_JSON is not valid base64-encoded JSON");
    }
    storageClient = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
      credentials,
    });
    return storageClient;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("GCP_PROJECT_ID and GCP_SERVICE_ACCOUNT_JSON must be set for production storage");
  }

  // Replit sidecar (development)
  storageClient = new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: "external_account",
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: { type: "json", subject_token_field_name: "access_token" },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
  return storageClient;
}

function stripBucketScheme(value: string): string {
  return value.replace(/^gs:\/\//, "");
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export class ObjectStorageService {
  private getPrivateObjectDir() {
    const dir = process.env["PRIVATE_OBJECT_DIR"];
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    return stripBucketScheme(dir).replace(/\/+$/, "");
  }

  private getPublicObjectSearchPaths() {
    const paths = (process.env["PUBLIC_OBJECT_SEARCH_PATHS"] ?? "")
      .split(",")
      .map((value) => stripBucketScheme(value.trim()))
      .filter(Boolean);
    if (!paths.length) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS is not configured");
    return paths;
  }

  /**
   * Issues a signed PUT URL for a public article image. Uploads target the first
   * configured public search path so the resulting object can be served through the
   * unauthenticated /api/storage/public-objects/* route.
   */
  async getObjectEntityUploadURL() {
    const publicPaths = this.getPublicObjectSearchPaths();
    const { bucketName, objectName } = parseObjectPath(`${publicPaths[0]}/uploads/${randomUUID()}`);
    return signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
  }

  /**
   * Converts a GCS object URL back to an app route path.
   * - Objects under a public search path -> /public-objects/<relative>
   * - Objects under the private dir        -> /objects/<relative>
   * - Anything else                         -> /<full pathname>
   */
  normalizeObjectEntityPath(rawPath: string) {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) return rawPath;
    const url = new URL(rawPath);
    const pathname = url.pathname.replace(/^\//, "");

    const publicPaths = (process.env["PUBLIC_OBJECT_SEARCH_PATHS"] ?? "")
      .split(",")
      .map((value) => stripBucketScheme(value.trim()))
      .filter(Boolean);
    for (const searchPath of publicPaths) {
      if (pathname.startsWith(`${searchPath}/`)) {
        return `/public-objects/${pathname.slice(searchPath.length + 1)}`;
      }
    }

    const privateDir = stripBucketScheme(process.env["PRIVATE_OBJECT_DIR"] ?? "").replace(/\/+$/, "");
    if (privateDir && pathname.startsWith(`${privateDir}/`)) {
      return `/objects/${pathname.slice(privateDir.length + 1)}`;
    }

    return `/${pathname}`;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const { bucketName, objectName } = parseObjectPath(`${searchPath}/${filePath}`);
      const file = getStorageClient().bucket(bucketName).file(objectName);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    return null;
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const entityPath = `${this.getPrivateObjectDir()}/${objectPath.slice("/objects/".length)}`;
    const { bucketName, objectName } = parseObjectPath(entityPath);
    const file = getStorageClient().bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async downloadObject(file: File): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream;
    const headers: Record<string, string> = {
      "Content-Type": String(metadata.contentType ?? "application/octet-stream"),
      "Cache-Control": "public, max-age=3600",
    };
    if (metadata.size) headers["Content-Length"] = String(metadata.size);
    return new Response(stream, { headers });
  }
}

function parseObjectPath(value: string) {
  const clean = stripBucketScheme(value);
  const normalized = clean.startsWith("/") ? clean : `/${clean}`;
  const [, bucketName, ...rest] = normalized.split("/");
  if (!bucketName || !rest.length) throw new Error("Invalid object storage path");
  return { bucketName, objectName: rest.join("/") };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT";
  ttlSec: number;
}) {
  if (isGcpConfigured()) {
    // Production: sign with the GCP service account.
    const client = getStorageClient();
    const [url] = await client.bucket(bucketName).file(objectName).getSignedUrl({
      action: method === "PUT" ? "write" : "read",
      expires: Date.now() + ttlSec * 1000,
      version: "v4",
    });
    return url;
  }

  // Development / Replit sidecar.
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Failed to sign object URL (${response.status})`);
  const payload = (await response.json()) as { signed_url?: string };
  if (!payload.signed_url) throw new Error("Storage did not return a signed URL");
  return payload.signed_url;
}