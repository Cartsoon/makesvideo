import { storage } from "./storage";
import type { CategoryId, SourceType } from "@shared/schema";
import seedData from "./sources.seed.json";

interface SeedSource {
  name: string;
  type: SourceType;
  url: string;
  language: "ru" | "en";
  priority: number;
}

interface CategorySeed {
  nameRu: string;
  nameEn: string;
  sources: SeedSource[];
}

export async function seedSources(): Promise<{ seeded: number; skipped: number }> {
  let seeded = 0;
  let skipped = 0;

  const existingSources = await storage.getSources();
  const existingUrls = new Set(existingSources.map(s => s.config.url?.toLowerCase()).filter(Boolean));

  for (const [categoryId, category] of Object.entries(seedData.categories) as [CategoryId, CategorySeed][]) {
    for (const source of category.sources) {
      const normalizedUrl = source.url.toLowerCase();
      
      if (existingUrls.has(normalizedUrl)) {
        skipped++;
        continue;
      }

      try {
        await storage.createSource({
          type: source.type,
          name: source.name,
          categoryId: categoryId,
          config: {
            url: source.url,
            language: source.language,
          },
          isEnabled: true,
          priority: source.priority,
          notes: `Seeded from ${category.nameEn} category`,
        });
        seeded++;
        existingUrls.add(normalizedUrl);
      } catch (error) {
        console.error(`[Seeder] Failed to seed source: ${source.name}`, error);
      }
    }
  }

  console.log(`[Seeder] Seeded ${seeded} sources, skipped ${skipped} existing`);
  return { seeded, skipped };
}

export async function getSourceStats(): Promise<Record<CategoryId, { total: number; enabled: number; healthy: number }>> {
  const sources = await storage.getSources();
  const stats: Record<string, { total: number; enabled: number; healthy: number }> = {};

  for (const source of sources) {
    if (!source.categoryId) continue;
    
    if (!stats[source.categoryId]) {
      stats[source.categoryId] = { total: 0, enabled: 0, healthy: 0 };
    }

    stats[source.categoryId].total++;
    if (source.isEnabled) stats[source.categoryId].enabled++;
    if (source.health.status === "ok") stats[source.categoryId].healthy++;
  }

  return stats as Record<CategoryId, { total: number; enabled: number; healthy: number }>;
}
