import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { db } from "../db";
import { kbDocuments, kbChunks, kbEmbeddings } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import { ingestFile, deleteDocumentByFilePath } from "../kb/ingest";
import { getProviderWithSettings } from "../ai/provider";

const router = Router();
const SEED_DIR = path.join(process.cwd(), "server/kb/seed");

function sanitizePath(inputPath: string): string | null {
  const normalized = path.normalize(inputPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(SEED_DIR, normalized);
  if (!resolved.startsWith(SEED_DIR)) {
    return null;
  }
  return resolved;
}

function getRelativePath(absolutePath: string): string {
  return path.relative(SEED_DIR, absolutePath);
}

interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
  modifiedAt?: string;
  size?: number;
}

function buildTree(dir: string, relativeTo: string = SEED_DIR): FileNode[] {
  if (!fs.existsSync(dir)) return [];
  
  const items = fs.readdirSync(dir);
  const nodes: FileNode[] = [];
  
  for (const name of items) {
    if (name.startsWith('.')) continue;
    const fullPath = path.join(dir, name);
    const relPath = path.relative(relativeTo, fullPath);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      nodes.push({
        name,
        path: relPath,
        type: "folder",
        children: buildTree(fullPath, relativeTo),
      });
    } else {
      nodes.push({
        name,
        path: relPath,
        type: "file",
        modifiedAt: stat.mtime.toISOString(),
        size: stat.size,
      });
    }
  }
  
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function transliterate(text: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  };
  
  return text.toLowerCase().split('').map(c => map[c] || c).join('');
}

function generateFileName(title: string): string {
  const date = new Date();
  const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  
  const slug = transliterate(title)
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  
  return `${timestamp}_${slug}.md`;
}

const TEMPLATES: Record<string, string> = {
  style_guide: `tags: style, guide

# Style Guide: [Title]

## Overview
Brief description of this style.

## Visual Style
- Camera angles
- Color palette
- Transitions

## Audio Style
- Music genre
- Voice tone
- Sound effects

## Script Structure
1. Hook (0-3s)
2. Build (3-15s)
3. Climax (15-25s)
4. CTA (25-30s)

## Examples
- Reference 1
- Reference 2
`,
  checklist: `tags: checklist

# Checklist: [Title]

## Pre-Production
- [ ] Topic researched
- [ ] Script written
- [ ] Hook approved

## Production
- [ ] Footage captured
- [ ] B-roll ready
- [ ] Audio recorded

## Post-Production
- [ ] Edited
- [ ] Color graded
- [ ] Subtitles added
- [ ] Thumbnail created

## Publishing
- [ ] Title optimized
- [ ] Hashtags added
- [ ] Published
`,
  template: `tags: template

# Template: [Title]

## Purpose
What this template is used for.

## Structure
\`\`\`
[0-3s] HOOK
[3-6s] INTEREST
[6-15s] BODY
[15-25s] ESCALATION
[25-30s] CTA
\`\`\`

## Variables
- {TOPIC}: Main subject
- {HOOK}: Attention grabber
- {CTA}: Call to action

## Example Output
...
`,
  example: `tags: example

# Example: [Title]

## Source
Original reference or inspiration.

## Analysis
What makes this effective:
1. Strong hook
2. Clear structure
3. Emotional engagement

## Key Takeaways
- Lesson 1
- Lesson 2
- Lesson 3
`,
};

router.get("/fs/tree", async (_req: Request, res: Response) => {
  try {
    const tree = buildTree(SEED_DIR);
    res.json({ tree, root: "server/kb/seed" });
  } catch (err) {
    console.error("[KB Admin] Tree error:", err);
    res.status(500).json({ error: "Failed to read file tree" });
  }
});

router.get("/fs/file", async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: "Path required" });
    }
    
    const safePath = sanitizePath(filePath);
    if (!safePath) {
      return res.status(403).json({ error: "Invalid path" });
    }
    
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const content = fs.readFileSync(safePath, "utf-8");
    const stat = fs.statSync(safePath);
    
    res.json({
      path: filePath,
      content,
      modifiedAt: stat.mtime.toISOString(),
      size: stat.size,
    });
  } catch (err) {
    console.error("[KB Admin] Read file error:", err);
    res.status(500).json({ error: "Failed to read file" });
  }
});

router.post("/fs/file", async (req: Request, res: Response) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: "Path and content required" });
    }
    
    const safePath = sanitizePath(filePath);
    if (!safePath) {
      return res.status(403).json({ error: "Invalid path" });
    }
    
    fs.writeFileSync(safePath, content, "utf-8");
    res.json({ success: true, path: filePath });
  } catch (err) {
    console.error("[KB Admin] Write file error:", err);
    res.status(500).json({ error: "Failed to write file" });
  }
});

router.post("/fs/create", async (req: Request, res: Response) => {
  try {
    const { folderPath = "", title, tags = [], templateKey } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Title required" });
    }
    
    const fileName = generateFileName(title);
    const relativePath = folderPath ? path.join(folderPath, fileName) : fileName;
    const safePath = sanitizePath(relativePath);
    
    if (!safePath) {
      return res.status(403).json({ error: "Invalid path" });
    }
    
    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let content = TEMPLATES[templateKey] || `tags: ${tags.join(", ")}\n\n# ${title}\n\n`;
    content = content.replace("[Title]", title);
    if (tags.length > 0 && !templateKey) {
      content = `tags: ${tags.join(", ")}\n\n# ${title}\n\n`;
    } else if (tags.length > 0 && templateKey) {
      const lines = content.split("\n");
      lines[0] = `tags: ${tags.join(", ")}`;
      content = lines.join("\n");
    }
    
    fs.writeFileSync(safePath, content, "utf-8");
    res.json({ success: true, path: relativePath, fileName });
  } catch (err) {
    console.error("[KB Admin] Create file error:", err);
    res.status(500).json({ error: "Failed to create file" });
  }
});

router.post("/fs/folder", async (req: Request, res: Response) => {
  try {
    const { path: folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ error: "Path required" });
    }
    
    const safePath = sanitizePath(folderPath);
    if (!safePath) {
      return res.status(403).json({ error: "Invalid path" });
    }
    
    fs.mkdirSync(safePath, { recursive: true });
    res.json({ success: true, path: folderPath });
  } catch (err) {
    console.error("[KB Admin] Create folder error:", err);
    res.status(500).json({ error: "Failed to create folder" });
  }
});

router.delete("/fs/file", async (req: Request, res: Response) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "Path required" });
    }
    
    const safePath = sanitizePath(filePath);
    if (!safePath) {
      return res.status(403).json({ error: "Invalid path" });
    }
    
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    
    fs.unlinkSync(safePath);
    res.json({ success: true });
  } catch (err) {
    console.error("[KB Admin] Delete file error:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

router.post("/fs/rename", async (req: Request, res: Response) => {
  try {
    const { from, to, reindex } = req.body;
    if (!from || !to) {
      return res.status(400).json({ error: "From and to paths required" });
    }
    
    const safeFrom = sanitizePath(from);
    const safeTo = sanitizePath(to);
    
    if (!safeFrom || !safeTo) {
      return res.status(403).json({ error: "Invalid path" });
    }
    
    if (!fs.existsSync(safeFrom)) {
      return res.status(404).json({ error: "Source file not found" });
    }
    
    fs.renameSync(safeFrom, safeTo);
    
    // Update document in database if it exists
    const existingDoc = await db.select().from(kbDocuments).where(eq(kbDocuments.filePath, from)).limit(1);
    if (existingDoc.length > 0) {
      // Get new title from filename
      const newTitle = path.basename(to, path.extname(to));
      await db.update(kbDocuments)
        .set({ filePath: to, title: newTitle, updatedAt: new Date() })
        .where(eq(kbDocuments.id, existingDoc[0].id));
      console.log(`[KB Admin] Updated document path: ${from} -> ${to}`);
      
      // Optionally reindex the file
      if (reindex) {
        await deleteDocumentByFilePath(to);
        await ingestFile(safeTo, to);
        console.log(`[KB Admin] Reindexed file: ${to}`);
      }
    }
    
    res.json({ success: true, from, to });
  } catch (err) {
    console.error("[KB Admin] Rename error:", err);
    res.status(500).json({ error: "Failed to rename" });
  }
});

router.get("/index/stats", async (_req: Request, res: Response) => {
  try {
    const docs = await db.select({
      id: kbDocuments.id,
      title: kbDocuments.title,
      filePath: kbDocuments.filePath,
      tags: kbDocuments.tags,
      isActive: kbDocuments.isActive,
      createdAt: kbDocuments.createdAt,
      updatedAt: kbDocuments.updatedAt,
    }).from(kbDocuments).orderBy(desc(kbDocuments.createdAt));
    
    const docsWithChunks = await Promise.all(docs.map(async (doc) => {
      const chunks = await db.select({
        id: kbChunks.id,
        chunkIndex: kbChunks.chunkIndex,
        content: kbChunks.content,
        contentHash: kbChunks.contentHash,
        level: kbChunks.level,
        anchor: kbChunks.anchor,
      }).from(kbChunks).where(eq(kbChunks.docId, doc.id));
      
      return {
        ...doc,
        chunksCount: chunks.length,
        chunks: chunks.slice(0, 10).map(c => ({
          id: c.id,
          chunkIndex: c.chunkIndex,
          contentHash: c.contentHash,
          preview: c.content.substring(0, 150) + (c.content.length > 150 ? "..." : ""),
          level: c.level,
          anchor: c.anchor,
        })),
      };
    }));
    
    const totalChunks = await db.select({ count: sql<number>`count(*)` }).from(kbChunks);
    const totalEmbeddings = await db.select({ count: sql<number>`count(*)` }).from(kbEmbeddings);
    
    res.json({
      documents: docsWithChunks,
      totalDocs: docs.length,
      totalChunks: Number(totalChunks[0]?.count || 0),
      totalEmbeddings: Number(totalEmbeddings[0]?.count || 0),
    });
  } catch (err) {
    console.error("[KB Admin] Stats error:", err);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

router.post("/index/reindexAll", async (_req: Request, res: Response) => {
  try {
    console.log("[KB Admin] Starting full reindex...");
    await db.delete(kbEmbeddings);
    await db.delete(kbChunks);
    await db.delete(kbDocuments);
    console.log("[KB Admin] Cleared existing data");
    
    const { ingestSeedFolder } = await import("../kb/ingest");
    await ingestSeedFolder(SEED_DIR);
    
    const totalDocs = await db.select({ count: sql<number>`count(*)` }).from(kbDocuments);
    const totalChunks = await db.select({ count: sql<number>`count(*)` }).from(kbChunks);
    const totalEmbeddings = await db.select({ count: sql<number>`count(*)` }).from(kbEmbeddings);
    
    console.log(`[KB Admin] Reindex complete: ${totalDocs[0]?.count} docs, ${totalChunks[0]?.count} chunks, ${totalEmbeddings[0]?.count} embeddings`);
    res.json({
      success: true,
      documentsIngested: Number(totalDocs[0]?.count || 0),
      chunksCreated: Number(totalChunks[0]?.count || 0),
      embeddingsCreated: Number(totalEmbeddings[0]?.count || 0),
    });
  } catch (err: any) {
    console.error("[KB Admin] Reindex all error:", err);
    const errorMessage = err?.message || "Unknown error";
    res.status(500).json({ error: `Failed to reindex: ${errorMessage}` });
  }
});

router.post("/index/reindexFile", async (req: Request, res: Response) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "Path required" });
    }
    
    const safePath = sanitizePath(filePath);
    if (!safePath) {
      return res.status(403).json({ error: "Invalid path" });
    }
    
    await deleteDocumentByFilePath(filePath);
    const result = await ingestFile(safePath, filePath);
    
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[KB Admin] Reindex file error:", err);
    res.status(500).json({ error: "Failed to reindex file" });
  }
});

router.delete("/index/document", async (req: Request, res: Response) => {
  try {
    const { docId, keepFile } = req.body;
    if (!docId) {
      return res.status(400).json({ error: "Document ID required" });
    }
    
    const doc = await db.select().from(kbDocuments).where(eq(kbDocuments.id, docId)).limit(1);
    if (doc.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    if (!keepFile && doc[0].filePath) {
      const safePath = sanitizePath(doc[0].filePath);
      if (safePath && fs.existsSync(safePath)) {
        fs.unlinkSync(safePath);
      }
    }
    
    await db.delete(kbDocuments).where(eq(kbDocuments.id, docId));
    res.json({ success: true });
  } catch (err) {
    console.error("[KB Admin] Delete document error:", err);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

router.delete("/index/chunk", async (req: Request, res: Response) => {
  try {
    const { chunkId } = req.body;
    if (!chunkId) {
      return res.status(400).json({ error: "Chunk ID required" });
    }
    
    await db.delete(kbEmbeddings).where(eq(kbEmbeddings.chunkId, chunkId));
    await db.delete(kbChunks).where(eq(kbChunks.id, chunkId));
    res.json({ success: true });
  } catch (err) {
    console.error("[KB Admin] Delete chunk error:", err);
    res.status(500).json({ error: "Failed to delete chunk" });
  }
});

router.get("/index/chunk/:chunkId", async (req: Request, res: Response) => {
  try {
    const { chunkId } = req.params;
    const chunk = await db.select().from(kbChunks).where(eq(kbChunks.id, chunkId)).limit(1);
    if (chunk.length === 0) {
      return res.status(404).json({ error: "Chunk not found" });
    }
    res.json(chunk[0]);
  } catch (err) {
    console.error("[KB Admin] Get chunk error:", err);
    res.status(500).json({ error: "Failed to get chunk" });
  }
});

router.put("/index/chunk/:chunkId", async (req: Request, res: Response) => {
  try {
    const { chunkId } = req.params;
    const { content, level, anchor } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: "Content required" });
    }
    
    const { sha256Hex } = await import("../utils/text");
    const contentHash = sha256Hex(content);
    
    // Build update object with optional level/anchor
    const updateData: Record<string, unknown> = { content, contentHash };
    if (level) updateData.level = level;
    if (anchor) updateData.anchor = anchor;
    
    await db.update(kbChunks).set(updateData).where(eq(kbChunks.id, chunkId));
    
    const provider = await getProviderWithSettings();
    const embedModel = process.env.AI_EMBED_MODEL ?? "text-embedding-3-large";
    const [embedding] = await provider.embed([content]);
    
    await db.delete(kbEmbeddings).where(eq(kbEmbeddings.chunkId, chunkId));
    await db.insert(kbEmbeddings).values({
      chunkId,
      model: embedModel,
      vector: embedding,
    });
    
    res.json({ success: true });
  } catch (err: any) {
    console.error("[KB Admin] Update chunk error:", err);
    res.status(500).json({ error: `Failed to update chunk: ${err?.message || "Unknown error"}` });
  }
});

router.post("/index/previewChunks", async (req: Request, res: Response) => {
  try {
    const { content, chunkSize = 1200, overlap = 200 } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Content required" });
    }
    
    const { chunkText } = await import("../utils/text");
    const chunks = chunkText(content, chunkSize, overlap);
    
    res.json({ chunks });
  } catch (err) {
    console.error("[KB Admin] Preview chunks error:", err);
    res.status(500).json({ error: "Failed to preview chunks" });
  }
});

router.post("/index/generateChunks", async (req: Request, res: Response) => {
  try {
    const { content, chunkCount = 5 } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Content required" });
    }
    
    const provider = await getProviderWithSettings();
    
    const prompt = `Ты эксперт по созданию базы знаний для RAG-системы.

ЗАДАЧА: Разбей текст на ${chunkCount} смысловых чанков для поиска.

ПРАВИЛА:
1. Каждый чанк должен быть самодостаточным (понятен без контекста)
2. Чанк = 100-400 слов, фокус на одну тему/идею
3. Сохраняй ключевые термины и имена
4. Не теряй важные детали
5. Формулируй так, чтобы чанк отвечал на возможный вопрос пользователя

Для каждого чанка определи:
- level: critical/important/normal/supplementary (насколько важен для темы)
- anchor: hooks/scripts/storyboard/montage/sfx/music/voice/style/platform/trends/workflow/general

ТЕКСТ:
${content.substring(0, 8000)}

ФОРМАТ ОТВЕТА (строго JSON массив):
[
  {
    "content": "текст чанка...",
    "level": "normal",
    "anchor": "general",
    "summary": "краткое описание о чем чанк"
  }
]

Верни только JSON массив, без markdown.`;

    const chatModel = process.env.AI_CHAT_MODEL ?? "gpt-4o-mini";
    const response = await provider.chat({
      model: chatModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });
    
    // Parse JSON from response
    let chunks = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        chunks = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error("[KB Admin] Failed to parse AI chunks:", parseErr);
      return res.status(500).json({ error: "AI returned invalid format" });
    }
    
    // Validate and normalize chunks
    const validatedChunks = chunks.map((c: any, i: number) => ({
      content: c.content || "",
      level: ["critical", "important", "normal", "supplementary"].includes(c.level) ? c.level : "normal",
      anchor: c.anchor || "general",
      summary: c.summary || `Chunk ${i + 1}`,
      chunkIndex: i,
    }));
    
    console.log(`[KB Admin] AI generated ${validatedChunks.length} chunks`);
    res.json({ chunks: validatedChunks });
  } catch (err: any) {
    console.error("[KB Admin] Generate chunks error:", err);
    res.status(500).json({ error: `Failed to generate chunks: ${err?.message || "Unknown error"}` });
  }
});

router.post("/index/saveGeneratedChunks", async (req: Request, res: Response) => {
  try {
    const { docId, chunks } = req.body;
    if (!docId || !chunks || !Array.isArray(chunks)) {
      return res.status(400).json({ error: "docId and chunks array required" });
    }
    
    // Validate chunks before any destructive operations
    const validChunks = chunks.filter((c: any) => 
      c && typeof c.content === "string" && c.content.trim().length > 0
    );
    
    if (validChunks.length === 0) {
      return res.status(400).json({ error: "No valid chunks to save (empty content)" });
    }
    
    // Verify document exists
    const doc = await db.select().from(kbDocuments).where(eq(kbDocuments.id, docId)).limit(1);
    if (doc.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    // Import utilities first
    const { sha256Hex } = await import("../utils/text");
    const { v4: uuidv4 } = await import("uuid");
    const provider = await getProviderWithSettings();
    const embedModel = process.env.AI_EMBED_MODEL ?? "text-embedding-3-large";
    
    // Delete existing chunks and embeddings for this document
    const existingChunks = await db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.docId, docId));
    for (const chunk of existingChunks) {
      await db.delete(kbEmbeddings).where(eq(kbEmbeddings.chunkId, chunk.id));
    }
    await db.delete(kbChunks).where(eq(kbChunks.docId, docId));
    
    // Insert new chunks and create embeddings
    const savedChunks = [];
    const validLevels = ["critical", "important", "normal", "supplementary"];
    const validAnchors = ["hooks", "scripts", "storyboard", "montage", "sfx", "music", "voice", "style", "platform", "trends", "workflow", "general"];
    
    for (let i = 0; i < validChunks.length; i++) {
      const chunk = validChunks[i];
      const chunkId = uuidv4();
      const contentHash = sha256Hex(chunk.content);
      const level = validLevels.includes(chunk.level) ? chunk.level : "normal";
      const anchor = validAnchors.includes(chunk.anchor) ? chunk.anchor : "general";
      
      await db.insert(kbChunks).values({
        id: chunkId,
        docId,
        chunkIndex: i,
        content: chunk.content,
        contentHash,
        level,
        anchor,
      });
      
      // Generate embedding
      const [embedding] = await provider.embed([chunk.content]);
      await db.insert(kbEmbeddings).values({
        chunkId,
        model: embedModel,
        vector: embedding,
      });
      
      savedChunks.push({ id: chunkId, chunkIndex: i });
    }
    
    console.log(`[KB Admin] Saved ${savedChunks.length} AI-generated chunks for doc ${docId}`);
    res.json({ success: true, chunksCount: savedChunks.length, chunks: savedChunks });
  } catch (err: any) {
    console.error("[KB Admin] Save generated chunks error:", err);
    res.status(500).json({ error: `Failed to save chunks: ${err?.message || "Unknown error"}` });
  }
});

router.post("/index/deactivate", async (req: Request, res: Response) => {
  try {
    const { docId, isActive } = req.body;
    if (!docId || isActive === undefined) {
      return res.status(400).json({ error: "Document ID and isActive required" });
    }
    
    await db.update(kbDocuments).set({ isActive }).where(eq(kbDocuments.id, docId));
    res.json({ success: true });
  } catch (err) {
    console.error("[KB Admin] Deactivate error:", err);
    res.status(500).json({ error: "Failed to update document" });
  }
});

router.post("/index/addChunk", async (req: Request, res: Response) => {
  try {
    const { docId, content, level, anchor } = req.body;
    if (!docId || !content?.trim()) {
      return res.status(400).json({ error: "Document ID and content required" });
    }
    
    const doc = await db.select().from(kbDocuments).where(eq(kbDocuments.id, docId)).limit(1);
    if (doc.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    const { sha256Hex } = await import("../utils/text");
    const { v4: uuidv4 } = await import("uuid");
    const provider = await getProviderWithSettings();
    const embedModel = process.env.AI_EMBED_MODEL ?? "text-embedding-3-large";
    
    const existingChunks = await db.select({ chunkIndex: kbChunks.chunkIndex })
      .from(kbChunks)
      .where(eq(kbChunks.docId, docId))
      .orderBy(kbChunks.chunkIndex);
    
    const maxIndex = existingChunks.length > 0 
      ? Math.max(...existingChunks.map(c => c.chunkIndex)) + 1 
      : 0;
    
    const validLevels = ["critical", "important", "normal", "supplementary"];
    const validAnchors = ["hooks", "scripts", "storyboard", "montage", "sfx", "music", "voice", "style", "platform", "trends", "workflow", "general"];
    
    const chunkId = uuidv4();
    const contentHash = sha256Hex(content.trim());
    
    await db.insert(kbChunks).values({
      id: chunkId,
      docId,
      chunkIndex: maxIndex,
      content: content.trim(),
      contentHash,
      level: validLevels.includes(level) ? level : "normal",
      anchor: validAnchors.includes(anchor) ? anchor : "general",
    });
    
    const [embedding] = await provider.embed([content.trim()]);
    await db.insert(kbEmbeddings).values({
      chunkId,
      model: embedModel,
      vector: embedding,
    });
    
    console.log(`[KB Admin] Added chunk ${chunkId} to doc ${docId}`);
    res.json({ success: true, chunkId });
  } catch (err: any) {
    console.error("[KB Admin] Add chunk error:", err);
    res.status(500).json({ error: `Failed to add chunk: ${err?.message || "Unknown error"}` });
  }
});

router.post("/retrieve", async (req: Request, res: Response) => {
  try {
    const { query, topK = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Query required" });
    }
    
    const provider = await getProviderWithSettings();
    const [queryEmbedding] = await provider.embed([query]);
    
    const allEmbeddings = await db.select({
      embeddingId: kbEmbeddings.id,
      chunkId: kbEmbeddings.chunkId,
      vector: kbEmbeddings.vector,
    }).from(kbEmbeddings);
    
    const scored = allEmbeddings.map(e => {
      const vec = e.vector as number[];
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < vec.length; i++) {
        dot += queryEmbedding[i] * vec[i];
        normA += queryEmbedding[i] ** 2;
        normB += vec[i] ** 2;
      }
      const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
      return { ...e, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, topK);
    
    const results = await Promise.all(topResults.map(async (r) => {
      const chunk = await db.select().from(kbChunks).where(eq(kbChunks.id, r.chunkId)).limit(1);
      if (chunk.length === 0) return null;
      
      const doc = await db.select().from(kbDocuments).where(eq(kbDocuments.id, chunk[0].docId)).limit(1);
      
      return {
        score: r.score,
        chunkId: r.chunkId,
        docId: chunk[0].docId,
        docTitle: doc[0]?.title || "Unknown",
        filePath: doc[0]?.filePath,
        preview: chunk[0].content.substring(0, 300) + (chunk[0].content.length > 300 ? "..." : ""),
        chunkIndex: chunk[0].chunkIndex,
      };
    }));
    
    res.json({ results: results.filter(Boolean) });
  } catch (err) {
    console.error("[KB Admin] Retrieve error:", err);
    res.status(500).json({ error: "Failed to retrieve" });
  }
});

export function registerKbAdminRoutes(app: any) {
  app.use("/api/kb-admin", router);
}
