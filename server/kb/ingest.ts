import fs from "fs";
import path from "path";
import { db } from "../db";
import { kbDocuments, kbChunks, kbEmbeddings } from "@shared/schema";
import { chunkText, sha256Hex } from "../utils/text";
import { getProvider } from "../ai/provider";
import { parseFile } from "./parsers";

export async function ingestSeedFolder(seedDir: string) {
  const provider = getProvider();
  const embedModel = process.env.AI_EMBED_MODEL ?? "text-embedding-3-large";

  const files = walkFiles(seedDir).filter(f => [".md", ".txt", ".json"].includes(path.extname(f).toLowerCase()));
  console.log(`[KB Ingest] Found ${files.length} files to process`);
  
  for (const f of files) {
    try {
      const parsed = parseFile(f);
      console.log(`[KB Ingest] Processing: ${parsed.title}`);
      
      const docId = (await db.insert(kbDocuments).values({
        title: parsed.title,
        source: parsed.source,
        tags: parsed.tags,
      }).returning({ id: kbDocuments.id }))[0].id;

      const chunks = chunkText(parsed.content, 1200, 200);
      console.log(`[KB Ingest] ${parsed.title}: ${chunks.length} chunks`);
      
      if (chunks.length === 0) continue;
      
      const embeddings = await provider.embed(chunks);

      for (let i = 0; i < chunks.length; i++) {
        const content = chunks[i];
        const contentHash = sha256Hex(content);
        const chunkId = (await db.insert(kbChunks).values({
          docId,
          chunkIndex: i,
          content,
          contentHash,
          tags: parsed.tags,
        }).returning({ id: kbChunks.id }))[0].id;

        await db.insert(kbEmbeddings).values({
          chunkId,
          model: embedModel,
          vector: embeddings[i],
        });
      }
    } catch (err) {
      console.error(`[KB Ingest] Error processing ${f}:`, err);
    }
  }
  
  console.log(`[KB Ingest] Complete`);
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}
