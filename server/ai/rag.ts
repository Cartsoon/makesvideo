import { db } from "../db";
import { kbChunks, kbEmbeddings, type ChunkLevel, type ChunkAnchor } from "@shared/schema";
import { getProvider } from "./provider";
import { cosineSimilarity } from "../utils/text";
import { eq } from "drizzle-orm";

export type RagHit = { 
  chunkId: string; 
  content: string; 
  score: number;
  level?: ChunkLevel;
  anchor?: ChunkAnchor;
};

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

export function formatRagContext(hits: RagHit[]) {
  if (!hits.length) return "";
  return `
КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ (используй как подсказку, не копируй дословно):
${hits.map((h, i) => {
  const levelTag = h.level && h.level !== "normal" ? ` level=${h.level}` : "";
  const anchorTag = h.anchor && h.anchor !== "general" ? ` anchor=${h.anchor}` : "";
  return `[KB${i + 1} score=${h.score.toFixed(3)}${levelTag}${anchorTag}] ${h.content}`;
}).join("\n\n")}
`;
}
