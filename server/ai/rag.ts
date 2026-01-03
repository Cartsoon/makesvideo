import { db } from "../db";
import { kbChunks, kbEmbeddings, kbDocuments, type ChunkLevel, type ChunkAnchor } from "@shared/schema";
import { getProvider } from "./provider";
import { cosineSimilarity } from "../utils/text";
import { eq, inArray } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

export type RagHit = { 
  chunkId: string; 
  docId: string;
  content: string; 
  score: number;
  level?: ChunkLevel;
  anchor?: ChunkAnchor;
};

// Keywords that trigger deep article access
const DEEP_CONTEXT_KEYWORDS = [
  "подробнее", "подробно", "глубже", "детальнее", "развернуто",
  "объясни", "explain", "расскажи больше", "more details",
  "почему", "why", "как именно", "how exactly", 
  "примеры", "examples", "покажи", "show me"
];

// Level-based score multipliers
const LEVEL_BOOSTS: Record<ChunkLevel, number> = {
  critical: 1.5,      // +50% boost
  important: 1.25,    // +25% boost
  normal: 1.0,        // no change
  supplementary: 0.75 // -25% penalty
};

// Anchor keywords for automatic relevance detection
const ANCHOR_KEYWORDS: Record<ChunkAnchor, string[]> = {
  hooks: ["хук", "hook", "зацеп", "внимание", "начало", "старт"],
  scripts: ["сценарий", "script", "текст", "диалог", "реплик"],
  storyboard: ["раскадровка", "storyboard", "кадр", "план", "shot"],
  montage: ["монтаж", "edit", "нарезка", "склейка", "transition"],
  sfx: ["звук", "sfx", "эффект", "sound", "шум"],
  music: ["музыка", "music", "трек", "саундтрек", "мелодия"],
  voice: ["голос", "voice", "озвучка", "речь", "дикция", "tts"],
  style: ["стиль", "style", "жанр", "формат", "тон"],
  platform: ["youtube", "tiktok", "reels", "shorts", "вк", "платформ"],
  trends: ["тренд", "trend", "вирус", "viral", "хайп"],
  workflow: ["процесс", "workflow", "чеклист", "этап", "pipeline"],
  general: []
};

function detectRelevantAnchors(query: string): ChunkAnchor[] {
  const lowerQuery = query.toLowerCase();
  const matches: ChunkAnchor[] = [];
  
  for (const [anchor, keywords] of Object.entries(ANCHOR_KEYWORDS)) {
    if (keywords.some(kw => lowerQuery.includes(kw))) {
      matches.push(anchor as ChunkAnchor);
    }
  }
  
  return matches;
}

export async function ragRetrieve(query: string, topK: number): Promise<RagHit[]> {
  const provider = getProvider();
  const [qVec] = await provider.embed([query]);

  const rows = await db.select().from(kbEmbeddings).innerJoin(kbChunks, eq(kbEmbeddings.chunkId, kbChunks.id));

  // Detect relevant anchors from query
  const relevantAnchors = detectRelevantAnchors(query);
  
  const scored = rows.map(r => {
    const vec = r.kb_embeddings.vector as number[];
    let baseScore = cosineSimilarity(qVec, vec);
    
    const level = (r.kb_chunks.level as ChunkLevel) || "normal";
    const anchor = (r.kb_chunks.anchor as ChunkAnchor) || "general";
    
    // Apply level boost
    let adjustedScore = baseScore * (LEVEL_BOOSTS[level] || 1.0);
    
    // Apply anchor relevance boost (+10% if anchor matches query context)
    if (relevantAnchors.length > 0 && relevantAnchors.includes(anchor)) {
      adjustedScore *= 1.1;
    }
    
    return { 
      chunkId: r.kb_chunks.id, 
      docId: r.kb_chunks.docId,
      content: r.kb_chunks.content, 
      score: adjustedScore,
      level,
      anchor
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const minScore = Number(process.env.RAG_MIN_SCORE ?? 0.2);
  return scored.filter(s => s.score >= minScore).slice(0, topK);
}

// Detect if full article access is needed based on query
export function checkRequiresArticle(query: string, hits: RagHit[]): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Check if user explicitly asks for more detail
  const explicitRequest = DEEP_CONTEXT_KEYWORDS.some(kw => lowerQuery.includes(kw));
  if (explicitRequest) return true;
  
  // Check if chunks are insufficient (low scores or too few)
  if (hits.length === 0) return false; // No chunks = no articles either
  if (hits.length < 3 && hits[0]?.score < 0.4) return true;
  
  // Check if best score is mediocre (might need more context)
  const avgScore = hits.reduce((sum, h) => sum + h.score, 0) / hits.length;
  if (avgScore < 0.35) return true;
  
  return false;
}

// Fetch full article content for relevant documents
export async function getArticleContext(docIds: string[], maxArticles: number = 2): Promise<string> {
  if (!docIds.length) return "";
  
  // Get unique doc IDs
  const uniqueDocIds = [...new Set(docIds)].slice(0, maxArticles);
  
  // Fetch documents with file paths
  const docs = await db.select({
    id: kbDocuments.id,
    title: kbDocuments.title,
    filePath: kbDocuments.filePath,
  }).from(kbDocuments).where(inArray(kbDocuments.id, uniqueDocIds));
  
  const articles: string[] = [];
  
  for (const doc of docs) {
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      try {
        const content = fs.readFileSync(doc.filePath, "utf-8");
        // Limit article size to prevent context overflow
        const truncated = content.length > 4000 
          ? content.substring(0, 4000) + "\n...[статья обрезана]"
          : content;
        articles.push(`=== СТАТЬЯ: ${doc.title} ===\n${truncated}`);
      } catch (err) {
        console.error(`Failed to read article ${doc.filePath}:`, err);
      }
    }
  }
  
  return articles.join("\n\n");
}

export function formatRagContext(hits: RagHit[], articleContext?: string) {
  if (!hits.length && !articleContext) return "";
  
  let context = "";
  
  // Primary: Chunks (the "thinking interface")
  if (hits.length > 0) {
    context += `
=== ЧАНКИ ИЗ БАЗЫ ЗНАНИЙ (основной источник для ответа) ===
${hits.map((h, i) => {
  const levelTag = h.level && h.level !== "normal" ? ` [${h.level}]` : "";
  const anchorTag = h.anchor && h.anchor !== "general" ? ` #${h.anchor}` : "";
  return `[KB${i + 1}${levelTag}${anchorTag}] ${h.content}`;
}).join("\n\n")}
`;
  }
  
  // Secondary: Full articles (background, deeper context)
  if (articleContext) {
    context += `

=== ПОЛНЫЕ СТАТЬИ (для глубокого контекста, НЕ пересказывать дословно) ===
ПРАВИЛА ИСПОЛЬЗОВАНИЯ СТАТЕЙ:
- Статья — это источник, бэкграунд, "память", НЕ для прямого цитирования
- Выжимай только релевантные смыслы для ответа
- Формулируй ответ как набор идей, а не как пересказ
- Используй статьи только для расширения/уточнения информации из чанков

${articleContext}
`;
  }
  
  return context;
}
