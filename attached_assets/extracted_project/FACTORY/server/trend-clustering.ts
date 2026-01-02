import { Topic, TrendTopic, InsertTrendTopic, CategoryId } from "@shared/schema";
import { storage } from "./storage";
import { normalizeText, extractKeywords, computeTextSimilarity } from "./text-utils";

const SIMILARITY_THRESHOLD = 0.3;
const MIN_CLUSTER_SIZE = 2;
const MAX_CLUSTER_SIZE = 10;

interface TopicCluster {
  topics: Topic[];
  seedTitles: string[];
  contextSnippets: string[];
  keywords: string[];
  entities: string[];
  angles: string[];
  hookPatterns: string[];
  refs: string[];
  score: number;
}

function extractAngles(topics: Topic[]): string[] {
  const anglePatterns: Record<string, RegExp[]> = {
    scandal: [/скандал|scandal|controversy|outrage/i],
    benefit: [/польза|benefit|helpful|useful|tips?/i],
    comparison: [/сравнени|vs\.?|versus|compare|better than/i],
    mistake: [/ошибк|mistake|fail|wrong|never do/i],
    release: [/релиз|release|launch|announce|new/i],
    patch: [/патч|patch|update|fix|hotfix/i],
    rumor: [/слух|rumor|leak|reportedly|allegedly/i],
    explanation: [/объяснени|explain|how to|why|what is/i],
    list: [/топ|top|best|worst|\d+ (things|ways|reasons)/i],
    shocking: [/шок|shock|unbelievable|incredible|insane/i],
  };
  
  const foundAngles: Set<string> = new Set();
  
  for (const topic of topics) {
    const text = `${topic.title} ${topic.rawText || ""}`.toLowerCase();
    
    for (const [angle, patterns] of Object.entries(anglePatterns)) {
      if (patterns.some(p => p.test(text))) {
        foundAngles.add(angle);
      }
    }
  }
  
  return Array.from(foundAngles);
}

function extractHookPatterns(topics: Topic[]): string[] {
  const patterns: string[] = [];
  
  for (const topic of topics) {
    const title = topic.title.toLowerCase();
    
    if (title.includes("?") || /^(why|what|how|when|who|где|как|почему|что|когда|кто)/i.test(title)) {
      patterns.push("question");
    }
    if (/^(never|don't|не|никогда)/i.test(title)) {
      patterns.push("warning");
    }
    if (/^(this|эт[оиа])/i.test(title)) {
      patterns.push("demonstrative");
    }
    if (/\d+/.test(title)) {
      patterns.push("number");
    }
    if (/(but|однако|however|vs|versus)/i.test(title)) {
      patterns.push("contrast");
    }
    if (/(secret|скрыт|hidden|unknown)/i.test(title)) {
      patterns.push("secret");
    }
  }
  
  return Array.from(new Set(patterns));
}

function getFullTopicText(topic: Topic): string {
  return normalizeText(`${topic.title} ${topic.rawText || topic.fullContent || ""}`);
}

function generateStableClusterId(seedTitles: string[], categoryId: CategoryId): string {
  const sortedTitles = [...seedTitles].sort();
  const hash = sortedTitles.slice(0, 3).join("|").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  return `tt_${categoryId}_${hash}`;
}

function clusterTopicsBySimilarity(topics: Topic[]): TopicCluster[] {
  const clusters: TopicCluster[] = [];
  const assigned = new Set<string>();
  
  const sortedTopics = [...topics].sort((a, b) => b.score - a.score);
  
  for (const topic of sortedTopics) {
    if (assigned.has(topic.id)) continue;
    
    const cluster: Topic[] = [topic];
    assigned.add(topic.id);
    
    const topicFullText = getFullTopicText(topic);
    
    for (const other of sortedTopics) {
      if (assigned.has(other.id)) continue;
      if (cluster.length >= MAX_CLUSTER_SIZE) break;
      
      const otherFullText = getFullTopicText(other);
      const similarity = computeTextSimilarity(topicFullText, otherFullText);
      
      if (similarity >= SIMILARITY_THRESHOLD) {
        cluster.push(other);
        assigned.add(other.id);
      }
    }
    
    if (cluster.length >= MIN_CLUSTER_SIZE) {
      const seedTitles = cluster.map(t => t.title);
      const contextSnippets = cluster
        .map(t => t.rawText || t.fullContent || "")
        .filter(s => s.length > 0)
        .slice(0, 5);
      
      const allText = cluster.map(t => `${t.title} ${t.rawText || ""}`).join(" ");
      const keywords = extractKeywords(allText, 10);
      
      clusters.push({
        topics: cluster,
        seedTitles,
        contextSnippets,
        keywords,
        entities: [],
        angles: extractAngles(cluster),
        hookPatterns: extractHookPatterns(cluster),
        refs: cluster.map(t => t.url).filter(Boolean) as string[],
        score: cluster.reduce((sum, t) => sum + t.score, 0) / cluster.length,
      });
    }
  }
  
  return clusters.sort((a, b) => b.score - a.score);
}

export async function buildTrendTopicsForCategory(categoryId: CategoryId): Promise<TrendTopic[]> {
  const topics = await storage.getTopics();
  const sources = await storage.getSources();
  const sourceMap = new Map(sources.map(s => [s.id, s]));
  
  const categoryTopics = topics.filter(t => {
    const source = sourceMap.get(t.sourceId);
    return source?.categoryId === categoryId && t.status === "new";
  });
  
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const freshTopics = categoryTopics.filter(t => 
    new Date(t.createdAt).getTime() > oneDayAgo
  );
  
  const clusters = clusterTopicsBySimilarity(freshTopics);
  
  const trendTopics: TrendTopic[] = [];
  
  for (const cluster of clusters) {
    const now = new Date().toISOString();
    const stableId = generateStableClusterId(cluster.seedTitles, categoryId);
    const trendTopic: TrendTopic = {
      id: stableId,
      categoryId,
      clusterLabel: cluster.keywords.slice(0, 3).join(" "),
      seedTitles: cluster.seedTitles,
      contextSnippets: cluster.contextSnippets,
      entities: cluster.entities,
      keywords: cluster.keywords,
      angles: cluster.angles,
      hookPatterns: cluster.hookPatterns,
      pacingHints: cluster.score > 70 ? "fast" : cluster.score > 40 ? "medium" : "slow",
      refs: cluster.refs,
      trendSignalIds: [],
      score: Math.round(cluster.score),
      createdAt: now,
      updatedAt: now,
    };
    
    trendTopics.push(trendTopic);
  }
  
  return trendTopics;
}

export async function buildAllTrendTopics(): Promise<TrendTopic[]> {
  const categories: CategoryId[] = [
    "world_news", "russia_news", "gaming", "memes", "trends",
    "fashion", "music", "interesting", "facts_research",
    "movies", "series", "medicine", "youtube_trends"
  ];
  
  const allTrendTopics: TrendTopic[] = [];
  
  for (const categoryId of categories) {
    const trendTopics = await buildTrendTopicsForCategory(categoryId);
    allTrendTopics.push(...trendTopics);
  }
  
  return allTrendTopics;
}

export async function getOrBuildTrendTopics(categoryId?: CategoryId): Promise<TrendTopic[]> {
  if (categoryId) {
    return buildTrendTopicsForCategory(categoryId);
  }
  return buildAllTrendTopics();
}
