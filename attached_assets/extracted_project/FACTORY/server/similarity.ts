import { storage } from "./storage";
import { extractNGrams, jaccardSimilarity, normalizeText } from "./text-utils";
import type { Script } from "@shared/schema";

const DEFAULT_SIMILARITY_THRESHOLD = 0.35;
const NGRAM_SIZE = 4;

export interface SimilarityCheckResult {
  passed: boolean;
  highestSimilarity: number;
  similarScriptId: string | null;
  similarScriptTitle: string | null;
}

export async function checkScriptSimilarity(
  newContent: string,
  excludeScriptId?: string,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): Promise<SimilarityCheckResult> {
  const scripts = await storage.getScripts();
  const newNgrams = extractNGrams(newContent, NGRAM_SIZE);
  
  if (newNgrams.size < 3) {
    return { passed: true, highestSimilarity: 0, similarScriptId: null, similarScriptTitle: null };
  }
  
  let highestSimilarity = 0;
  let similarScriptId: string | null = null;
  let similarScriptTitle: string | null = null;
  
  for (const script of scripts) {
    if (excludeScriptId && script.id === excludeScriptId) continue;
    if (!script.voiceText && !script.transcriptRich) continue;
    
    const existingText = script.voiceText || 
      (script.transcriptRich?.segments?.map(s => s.text).join(' ') || '');
    
    if (!existingText || existingText.length < 50) continue;
    
    const existingNgrams = extractNGrams(existingText, NGRAM_SIZE);
    const similarity = jaccardSimilarity(newNgrams, existingNgrams);
    
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      similarScriptId = script.id;
      similarScriptTitle = script.hook || script.topicId || 'Untitled';
    }
  }
  
  return {
    passed: highestSimilarity < threshold,
    highestSimilarity: Math.round(highestSimilarity * 100) / 100,
    similarScriptId: highestSimilarity >= threshold ? similarScriptId : null,
    similarScriptTitle: highestSimilarity >= threshold ? similarScriptTitle : null
  };
}

export async function checkTopicSimilarity(
  newTitle: string,
  excludeTopicId?: string,
  threshold: number = 0.5
): Promise<{ passed: boolean; highestSimilarity: number; similarTopicId: string | null }> {
  const topics = await storage.getTopics();
  const normalizedNew = normalizeText(newTitle);
  const newWords = new Set(normalizedNew.split(' ').filter(w => w.length > 2));
  
  if (newWords.size < 2) {
    return { passed: true, highestSimilarity: 0, similarTopicId: null };
  }
  
  let highestSimilarity = 0;
  let similarTopicId: string | null = null;
  
  for (const topic of topics) {
    if (excludeTopicId && topic.id === excludeTopicId) continue;
    
    const existingNormalized = normalizeText(topic.title);
    const existingWords = new Set(existingNormalized.split(' ').filter(w => w.length > 2));
    
    const similarity = jaccardSimilarity(newWords, existingWords);
    
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      similarTopicId = topic.id;
    }
  }
  
  return {
    passed: highestSimilarity < threshold,
    highestSimilarity: Math.round(highestSimilarity * 100) / 100,
    similarTopicId: highestSimilarity >= threshold ? similarTopicId : null
  };
}

export function computeContentHash(text: string): string {
  const normalized = normalizeText(text);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
