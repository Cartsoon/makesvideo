import * as fs from "fs";
import * as path from "path";
import { CategoryId, InsertSource, SourceType } from "@shared/schema";
import { storage } from "./storage";

interface SeedSource {
  name: string;
  type: string;
  url: string;
  language: string;
  priority: number;
}

interface SeedFile {
  category: string;
  target_ok_min: number;
  target_ok_max: number;
  sources: SeedSource[];
}

const CATEGORY_MAP: Record<string, CategoryId> = {
  world_news: "world_news",
  ru_news: "russia_news",
  games: "gaming",
  memes: "memes",
  trends: "trends",
  fashion: "fashion",
  music: "music",
  interesting: "interesting",
  facts_research: "facts_research",
  movies: "movies",
  series: "series",
  medicine: "medicine",
  youtube_trends: "youtube_trends",
};

const SEEDS_DIR = path.join(process.cwd(), "data", "seeds");

export async function loadSeedFile(filename: string): Promise<SeedFile | null> {
  const filepath = path.join(SEEDS_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    console.log(`[SeedLoader] File not found: ${filepath}`);
    return null;
  }
  
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    return JSON.parse(content) as SeedFile;
  } catch (error) {
    console.error(`[SeedLoader] Error reading ${filename}:`, error);
    return null;
  }
}

export async function loadAllSeeds(): Promise<Map<CategoryId, SeedFile>> {
  const seeds = new Map<CategoryId, SeedFile>();
  
  if (!fs.existsSync(SEEDS_DIR)) {
    console.log(`[SeedLoader] Seeds directory not found: ${SEEDS_DIR}`);
    return seeds;
  }
  
  const files = fs.readdirSync(SEEDS_DIR).filter(f => f.endsWith(".seed.json"));
  
  for (const file of files) {
    const seed = await loadSeedFile(file);
    if (seed) {
      const categoryId = CATEGORY_MAP[seed.category];
      if (categoryId) {
        seeds.set(categoryId, seed);
        console.log(`[SeedLoader] Loaded ${seed.sources.length} sources for ${categoryId}`);
      }
    }
  }
  
  return seeds;
}

export async function importSeedsForCategory(categoryId: CategoryId): Promise<number> {
  const categoryKey = Object.entries(CATEGORY_MAP).find(([_, v]) => v === categoryId)?.[0];
  if (!categoryKey) {
    console.log(`[SeedLoader] Unknown category: ${categoryId}`);
    return 0;
  }
  
  const filename = `${categoryKey}.seed.json`;
  const seed = await loadSeedFile(filename);
  
  if (!seed) {
    console.log(`[SeedLoader] No seed file for ${categoryId}`);
    return 0;
  }
  
  const existingSources = await storage.getSources();
  const existingUrls = new Set(existingSources.map(s => s.config?.url).filter(Boolean));
  
  let imported = 0;
  
  for (const seedSource of seed.sources) {
    if (existingUrls.has(seedSource.url)) {
      continue;
    }
    
    const sourceType = seedSource.type as SourceType;
    
    const insertSource: InsertSource = {
      type: sourceType,
      name: seedSource.name,
      categoryId,
      config: {
        url: seedSource.url,
        language: seedSource.language as "ru" | "en" | undefined,
      },
      isEnabled: true,
      priority: seedSource.priority,
      health: {
        status: "pending",
        failuresCount: 0,
      },
    };
    
    try {
      await storage.createSource(insertSource);
      imported++;
    } catch (error) {
      console.error(`[SeedLoader] Failed to import ${seedSource.name}:`, error);
    }
  }
  
  console.log(`[SeedLoader] Imported ${imported} sources for ${categoryId}`);
  return imported;
}

export async function ensureMinimumSources(categoryId: CategoryId, minCount: number = 20): Promise<void> {
  const sources = await storage.getSources();
  const categorySources = sources.filter(s => s.categoryId === categoryId && s.isEnabled);
  const okSources = categorySources.filter(s => s.health.status === "ok" || s.health.status === "pending");
  
  if (okSources.length < minCount) {
    console.log(`[SeedLoader] Category ${categoryId} has ${okSources.length}/${minCount} OK sources, importing from seeds...`);
    await importSeedsForCategory(categoryId);
  }
}

export async function importAllSeeds(): Promise<number> {
  const categories: CategoryId[] = [
    "world_news", "russia_news", "gaming", "memes", "trends",
    "fashion", "music", "interesting", "facts_research",
    "movies", "series", "medicine", "youtube_trends"
  ];
  
  let totalImported = 0;
  
  for (const categoryId of categories) {
    const imported = await importSeedsForCategory(categoryId);
    totalImported += imported;
  }
  
  console.log(`[SeedLoader] Total imported: ${totalImported} sources`);
  return totalImported;
}

export async function getCategoryStats(): Promise<Record<CategoryId, { total: number; ok: number; warning: number; dead: number; pending: number }>> {
  const sources = await storage.getSources();
  const stats: Record<string, { total: number; ok: number; warning: number; dead: number; pending: number }> = {};
  
  const categories: CategoryId[] = [
    "world_news", "russia_news", "gaming", "memes", "trends",
    "fashion", "music", "interesting", "facts_research",
    "movies", "series", "medicine", "youtube_trends"
  ];
  
  for (const categoryId of categories) {
    stats[categoryId] = { total: 0, ok: 0, warning: 0, dead: 0, pending: 0 };
  }
  
  for (const source of sources) {
    if (source.categoryId && stats[source.categoryId]) {
      stats[source.categoryId].total++;
      const status = source.health.status;
      if (status === "ok") stats[source.categoryId].ok++;
      else if (status === "warning") stats[source.categoryId].warning++;
      else if (status === "dead") stats[source.categoryId].dead++;
      else stats[source.categoryId].pending++;
    }
  }
  
  return stats as Record<CategoryId, { total: number; ok: number; warning: number; dead: number; pending: number }>;
}
