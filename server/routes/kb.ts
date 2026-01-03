import { Router } from "express";
import path from "path";
import { ingestSeedFolder } from "../kb/ingest";
import { db } from "../db";
import { kbDocuments, kbChunks, kbEmbeddings } from "@shared/schema";
import { sql } from "drizzle-orm";

export const kbRouter = Router();

kbRouter.post("/reindex", async (_req, res) => {
  try {
    const seedDir = path.join(process.cwd(), "server", "kb", "seed");
    
    await db.delete(kbEmbeddings);
    await db.delete(kbChunks);
    await db.delete(kbDocuments);
    
    await ingestSeedFolder(seedDir);
    
    const stats = await db.select({ count: sql<number>`count(*)` }).from(kbDocuments);
    
    return res.json({ ok: true, seedDir, documentsIngested: stats[0]?.count ?? 0 });
  } catch (err) {
    console.error("[KB Reindex Error]", err);
    return res.status(500).json({ error: "Reindex failed" });
  }
});

kbRouter.get("/stats", async (_req, res) => {
  try {
    const docs = await db.select({ count: sql<number>`count(*)` }).from(kbDocuments);
    const chunks = await db.select({ count: sql<number>`count(*)` }).from(kbChunks);
    const embeds = await db.select({ count: sql<number>`count(*)` }).from(kbEmbeddings);
    
    return res.json({
      documents: docs[0]?.count ?? 0,
      chunks: chunks[0]?.count ?? 0,
      embeddings: embeds[0]?.count ?? 0,
    });
  } catch (err) {
    console.error("[KB Stats Error]", err);
    return res.status(500).json({ error: "Stats failed" });
  }
});
