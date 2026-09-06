import { Readable } from "node:stream";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { requireAdmin, requireAdminMutation } from "../lib/auth";
import { isSafeObjectPath } from "../lib/object-path";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.post("/storage/uploads/request-url", requireAdminMutation, async (req, res): Promise<void> => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.contentType.startsWith("image/") || parsed.data.size > 10_000_000) {
    res.status(400).json({ error: "Upload an image smaller than 10 MB." });
    return;
  }
  try {
    const { name, size, contentType } = parsed.data;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json(RequestUploadUrlResponse.parse({
      uploadURL,
      objectPath,
      metadata: { name, size, contentType },
    }));
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/storage/public-objects/*filePath", async (req, res): Promise<void> => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    if (!isSafeObjectPath(filePath)) {
      res.status(400).json({ error: "Invalid object path" });
      return;
    }
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) Readable.fromWeb(response.body as never).pipe(res);
    else res.end();
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

router.get("/storage/objects/*path", requireAdmin, async (req, res): Promise<void> => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    if (!isSafeObjectPath(wildcardPath)) {
      res.status(400).json({ error: "Invalid object path" });
      return;
    }
    const objectFile = await objectStorageService.getObjectEntityFile(`/objects/${wildcardPath}`);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) Readable.fromWeb(response.body as never).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
