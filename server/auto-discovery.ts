import { storage } from "./storage";
import type { CategoryId, InsertSource, Source } from "@shared/schema";
import { getCategoryHealthStats } from "./health-check";

const MIN_SOURCES_PER_CATEGORY = 20;
const MAX_SOURCES_PER_CATEGORY = 30;

interface DiscoveryResult {
  categoryId: CategoryId;
  discovered: number;
  added: number;
  skipped: number;
  errors: string[];
}

const RSS_DISCOVERY_SOURCES: Record<string, string[]> = {
  world_news: [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://feeds.washingtonpost.com/rss/world",
    "https://www.theguardian.com/world/rss",
    "https://www.aljazeera.com/xml/rss/all.xml"
  ],
  russia_news: [
    "https://lenta.ru/rss",
    "https://meduza.io/rss/all",
    "https://www.rbc.ru/rss/main",
    "https://ria.ru/export/rss2/index.xml",
    "https://tass.ru/rss/v2.xml"
  ],
  gaming: [
    "https://www.ign.com/rss/articles",
    "https://kotaku.com/rss",
    "https://www.gamespot.com/feeds/mashup/",
    "https://www.polygon.com/rss/index.xml"
  ],
  memes: [
    "https://www.reddit.com/r/memes/.rss",
    "https://www.reddit.com/r/dankmemes/.rss",
    "https://knowyourmeme.com/memes.rss"
  ],
  trends: [
    "https://trends.google.com/trends/trendingsearches/daily/rss?geo=RU",
    "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US"
  ],
  fashion: [
    "https://www.vogue.com/feed/rss",
    "https://www.harpersbazaar.com/rss/all.xml/",
    "https://www.elle.com/rss/all.xml/"
  ],
  music: [
    "https://pitchfork.com/rss/news/",
    "https://www.rollingstone.com/music/music-news/feed/",
    "https://www.billboard.com/feed/"
  ],
  interesting: [
    "https://www.reddit.com/r/todayilearned/.rss",
    "https://www.reddit.com/r/interestingasfuck/.rss",
    "https://www.atlasobscura.com/feeds/latest"
  ],
  facts_research: [
    "https://www.sciencedaily.com/rss/all.xml",
    "https://www.nature.com/nature.rss",
    "https://www.newscientist.com/feed/home"
  ],
  movies: [
    "https://www.hollywoodreporter.com/feed/",
    "https://variety.com/feed/",
    "https://www.slashfilm.com/feed/"
  ],
  series: [
    "https://tvline.com/feed/",
    "https://www.tvinsider.com/feed/",
    "https://deadline.com/feed/"
  ],
  medicine: [
    "https://www.medicalnewstoday.com/rss",
    "https://www.webmd.com/rss/default.rss",
    "https://www.health.harvard.edu/blog/feed"
  ],
  youtube_trends: []
};

async function checkRSSFeedHealth(url: string): Promise<{ healthy: boolean; itemCount: number }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IDEngine/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*"
      }
    });
    clearTimeout(timeout);
    
    if (!response.ok) return { healthy: false, itemCount: 0 };
    
    const xml = await response.text();
    const rssCount = (xml.match(/<item[^>]*>/gi) || []).length;
    const atomCount = (xml.match(/<entry[^>]*>/gi) || []).length;
    const itemCount = Math.max(rssCount, atomCount);
    
    return { healthy: itemCount > 0, itemCount };
  } catch {
    return { healthy: false, itemCount: 0 };
  }
}

function extractSourceName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.replace('www.', '').split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  } catch {
    return 'Unknown';
  }
}

export async function discoverSourcesForCategory(categoryId: CategoryId): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    categoryId,
    discovered: 0,
    added: 0,
    skipped: 0,
    errors: []
  };
  
  const existingSources = await storage.getSources();
  const existingUrls = new Set(
    existingSources
      .filter(s => s.categoryId === categoryId)
      .map(s => s.config.url)
      .filter(Boolean)
  );
  
  const categorySourceCount = existingSources.filter(s => s.categoryId === categoryId && s.isEnabled).length;
  
  if (categorySourceCount >= MAX_SOURCES_PER_CATEGORY) {
    console.log(`[AutoDiscovery] Category ${categoryId} already has ${categorySourceCount} sources, skipping`);
    return result;
  }
  
  const potentialUrls = RSS_DISCOVERY_SOURCES[categoryId] || [];
  const neededCount = Math.min(MAX_SOURCES_PER_CATEGORY - categorySourceCount, potentialUrls.length);
  
  for (const url of potentialUrls.slice(0, neededCount + 5)) {
    if (existingUrls.has(url)) {
      result.skipped++;
      continue;
    }
    
    result.discovered++;
    
    try {
      const healthCheck = await checkRSSFeedHealth(url);
      
      if (!healthCheck.healthy) {
        result.errors.push(`${url}: Feed not healthy`);
        continue;
      }
      
      const sourceName = extractSourceName(url);
      
      const newSource: InsertSource = {
        type: "rss",
        name: `${sourceName} (Auto)`,
        categoryId,
        config: { url },
        isEnabled: true,
        priority: 3,
        health: {
          status: "ok",
          itemCount: healthCheck.itemCount,
          failuresCount: 0
        }
      };
      
      await storage.createSource(newSource);
      result.added++;
      console.log(`[AutoDiscovery] Added source: ${sourceName} for ${categoryId}`);
      
      if (categorySourceCount + result.added >= MAX_SOURCES_PER_CATEGORY) {
        break;
      }
    } catch (error) {
      result.errors.push(`${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`[AutoDiscovery] ${categoryId}: discovered=${result.discovered}, added=${result.added}, skipped=${result.skipped}`);
  return result;
}

export async function discoverAllCategories(): Promise<DiscoveryResult[]> {
  const stats = await getCategoryHealthStats();
  const results: DiscoveryResult[] = [];
  
  for (const [categoryId, stat] of Object.entries(stats)) {
    if (stat.needsMore || stat.enabled < MIN_SOURCES_PER_CATEGORY) {
      const result = await discoverSourcesForCategory(categoryId as CategoryId);
      results.push(result);
    }
  }
  
  return results;
}

export async function getCategoriesNeedingDiscovery(): Promise<CategoryId[]> {
  const stats = await getCategoryHealthStats();
  return Object.entries(stats)
    .filter(([_, stat]) => stat.needsMore || stat.enabled < MIN_SOURCES_PER_CATEGORY)
    .map(([categoryId]) => categoryId as CategoryId);
}
