import { storage } from "./storage";
import { providers, TopicContext } from "./providers";
import type { Job, JobKind, Topic, TopicInsights } from "@shared/schema";
import { checkTopicSimilarity } from "./similarity";

const DAILY_TOPIC_LIMIT = 300;
const TOPICS_PER_HOUR = 35;
const FETCH_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

let autoFetchInterval: NodeJS.Timeout | null = null;

// Common verbs and generic words to exclude from tags (Russian)
const EXCLUDED_WORDS_RU = new Set([
  'и', 'в', 'на', 'с', 'по', 'для', 'от', 'из', 'как', 'что', 'это', 'не', 'но', 'к', 'за', 'о', 'об', 'при',
  'а', 'или', 'так', 'уже', 'все', 'его', 'её', 'их', 'мы', 'вы', 'они', 'он', 'она', 'оно',
  'был', 'была', 'было', 'были', 'быть', 'есть', 'будет', 'стал', 'стала', 'стало', 'стали',
  'того', 'этого', 'которые', 'который', 'которая', 'которое', 'также', 'более', 'самый', 'только',
  'можно', 'нужно', 'надо', 'даже', 'ещё', 'когда', 'если', 'чтобы', 'после', 'перед', 'между',
  'года', 'году', 'год', 'лет', 'время', 'день', 'дней', 'час', 'часов', 'минут',
  'сегодня', 'вчера', 'завтра', 'теперь', 'потом', 'сначала', 'затем', 'новый', 'новая', 'новое', 'новые',
  'сообщил', 'сообщила', 'сообщили', 'заявил', 'заявила', 'заявили', 'рассказал', 'рассказала',
  'стало', 'известно', 'пользователи', 'обнаружили', 'нашли', 'узнали', 'показал', 'показала',
  'получил', 'получила', 'получили', 'решил', 'решила', 'решили', 'начал', 'начала', 'начали',
  'первый', 'первая', 'первое', 'второй', 'вторая', 'третий', 'последний', 'последняя',
  'большой', 'большая', 'маленький', 'маленькая', 'хороший', 'хорошая', 'плохой', 'плохая',
  'против', 'около', 'через', 'почему', 'зачем', 'откуда', 'куда', 'где', 'кто', 'чем',
  'своем', 'своей', 'своих', 'свой', 'своя', 'свои', 'этот', 'эта', 'эти', 'тот', 'та', 'те',
  'раскрыли', 'подробности', 'увидели', 'необычную', 'деталь', 'окружили', 'ликвидировали',
  'регистрацию', 'домена', 'связанного'
]);
const EXCLUDED_WORDS_EN = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
  'it', 'its', 'they', 'them', 'their', 'he', 'she', 'his', 'her', 'we', 'you', 'your', 'our',
  'who', 'which', 'what', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same', 'so', 'than', 'too', 'very',
  'just', 'also', 'now', 'here', 'there', 'about', 'after', 'before', 'between', 'new', 'first', 'last',
  'year', 'years', 'day', 'days', 'time', 'today', 'says', 'said', 'told', 'reports', 'announces',
  'users', 'found', 'discovered', 'revealed', 'shows', 'according', 'sources', 'officials'
]);

/**
 * Strips ALL HTML tags, URLs, and special markup from text
 * Used to clean titles and descriptions from RSS feeds
 */
function stripHtml(text: string | null | undefined): string {
  if (!text) return '';
  
  return text
    // Remove all HTML tags (including self-closing like <img />, <br/>, etc.)
    .replace(/<[^>]*>/gi, '')
    // Remove URLs (http, https, www)
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/www\.[^\s]+/gi, '')
    // Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/gi, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&[a-z]+;/gi, '') // Remove any remaining HTML entities
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts 2-4 relevant tags from title - proper nouns, names, abbreviations
 * Focus on: full names (multiple words), brands, abbreviations, key terms
 * RULES: No duplicates, no parts of already-added multi-word tags
 */
function extractTopicTags(title: string, content: string | null, language: string): string[] {
  const excludedWords = language === 'ru' ? EXCLUDED_WORDS_RU : EXCLUDED_WORDS_EN;
  const tags: string[] = [];
  const seen = new Set<string>();
  const usedWords = new Set<string>(); // Track individual words from multi-word tags
  
  // Helper to check if any word in tag already used
  const hasWordOverlap = (tag: string): boolean => {
    const words = tag.split(/\s+/);
    return words.some(w => usedWords.has(w.toLowerCase()));
  };
  
  // Helper to add tag if valid
  const addTag = (tag: string, trackWords = true) => {
    const normalized = tag.trim();
    const lower = normalized.toLowerCase();
    if (normalized.length < 2 || normalized.length > 30) return false;
    if (excludedWords.has(lower)) return false;
    if (seen.has(lower)) return false;
    
    // Check if ANY word in this tag is already used (prevents "Classic" when "Trine Classic" exists)
    if (hasWordOverlap(normalized)) return false;
    
    seen.add(lower);
    tags.push(normalized);
    
    // Always track words from added tags to prevent duplicates
    normalized.split(/\s+/).forEach(word => usedWords.add(word.toLowerCase()));
    return true;
  };
  
  // 1. Extract full names (2-4 consecutive capitalized words): "My Winter Car", "Том Хендерсон"
  // Prioritize longer matches first
  const fullNameRegex = /([A-ZА-ЯЁ][a-zа-яё]+(?:\s+[A-ZА-ЯЁ][a-zа-яё]+){1,3})/g;
  const fullNames = title.match(fullNameRegex) || [];
  // Sort by length descending to capture longest phrases first
  fullNames.sort((a, b) => b.length - a.length);
  for (const name of fullNames) {
    // Skip if all words are excluded
    const words = name.split(/\s+/);
    const nonExcludedWords = words.filter(w => !excludedWords.has(w.toLowerCase()));
    if (nonExcludedWords.length >= 2) {
      addTag(name);
    }
  }
  
  // 2. Extract quoted text - look for key phrases inside quotes (more permissive)
  const quoted = title.match(/["«]([^"»]+)["»]/g) || [];
  for (const q of quoted) {
    const inner = q.replace(/["«»]/g, '').trim();
    // Try to find "Capitalized + word(s)" patterns (like "Новый год", "Black Friday")
    // For quoted content, be more permissive - these are intentionally highlighted
    const phraseRegex = /([A-ZА-ЯЁ][a-zа-яё]+(?:\s+[a-zа-яёA-ZА-ЯЁ]+){1,2})/g;
    const innerPhrases = inner.match(phraseRegex) || [];
    for (const phrase of innerPhrases) {
      if (phrase.length >= 5 && phrase.length <= 25) {
        const words = phrase.split(/\s+/);
        // For quotes: allow even if words are "common" - the quote makes it significant
        if (words.length >= 2 && words.length <= 3) {
          // Skip adding words to usedWords check here - quotes are special
          const normalized = phrase.trim();
          if (!seen.has(normalized.toLowerCase()) && !hasWordOverlap(normalized)) {
            seen.add(normalized.toLowerCase());
            tags.push(normalized);
            normalized.split(/\s+/).forEach(word => usedWords.add(word.toLowerCase()));
          }
        }
      }
    }
  }
  
  // 3. Extract abbreviations and alphanumeric brands: GTA, PS5, iPhone, Xbox, etc.
  const abbreviations = title.match(/\b[A-Z]{2,6}\s*\d*\b/g) || [];
  for (const abbr of abbreviations) {
    addTag(abbr.trim());
  }
  
  // 4. Extract brand-like words (caps + number): "GTA 6", "PS5", "iPhone 15"
  const brandRegex = /\b([A-Z][A-Za-z]*\s*\d+)\b/g;
  const brands = title.match(brandRegex) || [];
  for (const brand of brands) {
    addTag(brand.trim());
  }
  
  // 5. If not enough tags, extract single proper nouns (NOT already used)
  if (tags.length < 2) {
    const singleNouns = title.match(/[A-ZА-ЯЁ][a-zа-яё]{3,}/g) || [];
    for (const word of singleNouns) {
      if (tags.length >= 4) break;
      addTag(word);
    }
  }
  
  // Return 2-4 unique tags
  return tags.slice(0, 4);
}

let isProcessing = false;
const MAX_CONCURRENT_JOBS = 1;

async function processJob(job: Job): Promise<void> {
  console.log(`[JobWorker] Starting job ${job.id}: ${job.kind}`);
  
  try {
    await storage.updateJob(job.id, { status: "running", progress: 0 });

    const payload = job.payload as Record<string, any>;

    switch (job.kind) {
      case "fetch_topics":
        await processFetchTopics(job);
        break;
      case "extract_content":
        await processExtractContent(job, payload.topicId);
        break;
      case "translate_topic":
        await processTranslateTopic(job, payload.topicId);
        break;
      case "generate_hook":
        await processGenerateHook(job, payload.scriptId);
        break;
      case "generate_script":
        await processGenerateScript(job, payload.scriptId);
        break;
      case "generate_storyboard":
        await processGenerateStoryboard(job, payload.scriptId);
        break;
      case "generate_voice":
        await processGenerateVoice(job, payload.scriptId);
        break;
      case "pick_music":
        await processPickMusic(job, payload.scriptId);
        break;
      case "export_package":
        await processExportPackage(job, payload.scriptId);
        break;
      case "generate_all":
        await processGenerateAll(job, payload.scriptId);
        break;
      case "health_check":
        await processHealthCheck(job, payload.sourceId);
        break;
      case "health_check_all":
        await processHealthCheckAll(job);
        break;
      case "auto_discovery":
        await processAutoDiscovery(job, payload.categoryId);
        break;
      case "extract_trends":
        await processExtractTrends(job, payload.categoryId);
        break;
      default:
        throw new Error(`Unknown job kind: ${job.kind}`);
    }

    await storage.updateJob(job.id, { status: "done", progress: 100 });
    console.log(`[JobWorker] Completed job ${job.id}: ${job.kind}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[JobWorker] Error in job ${job.id}:`, errorMessage);
    await storage.updateJob(job.id, { status: "error", error: errorMessage });
    
    // Also update the script status if applicable
    const payload = job.payload as Record<string, any>;
    if (payload.scriptId) {
      await storage.updateScript(payload.scriptId, { status: "error", error: errorMessage });
    }
  }
}

// Helper to decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

// Simple RSS parser - extracts items from RSS/Atom XML
function parseRSSItems(xml: string): Array<{ title: string; link: string; description: string; imageUrl?: string; pubDate?: Date }> {
  const items: Array<{ title: string; link: string; description: string; imageUrl?: string; pubDate?: Date }> = [];
  
  // Helper to extract image URL from content
  function extractImageUrl(content: string): string | undefined {
    // Try enclosure with image type (any order of attributes)
    const enclosureMatch = content.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*(?:type=["']image|\.(?:jpg|jpeg|png|gif|webp))/i) ||
                           content.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]*url=["']([^"']+)["']/i);
    if (enclosureMatch) return decodeHtmlEntities(enclosureMatch[1]);
    
    // Try enclosure without type (just url ending with image extension)
    const enclosureUrlMatch = content.match(/<enclosure[^>]+url=["']([^"']+\.(?:jpg|jpeg|png|gif|webp)[^"']*)["']/i);
    if (enclosureUrlMatch) return decodeHtmlEntities(enclosureUrlMatch[1]);
    
    // Try enclosure with any url (many RSS feeds use enclosure for images)
    const enclosureAnyMatch = content.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    if (enclosureAnyMatch && !enclosureAnyMatch[1].includes('audio') && !enclosureAnyMatch[1].includes('video')) {
      return decodeHtmlEntities(enclosureAnyMatch[1]);
    }
    
    // Try media:content with medium="image" or url with image extension
    const mediaContentMatch = content.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*medium=["']image["']/i) ||
                              content.match(/<media:content[^>]+medium=["']image["'][^>]*url=["']([^"']+)["']/i) ||
                              content.match(/<media:content[^>]+url=["']([^"']+\.(?:jpg|jpeg|png|gif|webp)[^"']*)["']/i) ||
                              content.match(/<media:content[^>]+url=["']([^"']+)["']/i);
    if (mediaContentMatch) return decodeHtmlEntities(mediaContentMatch[1]);
    
    // Try media:thumbnail
    const mediaThumbnailMatch = content.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
    if (mediaThumbnailMatch) return decodeHtmlEntities(mediaThumbnailMatch[1]);
    
    // Try image element inside media group
    const mediaGroupImageMatch = content.match(/<media:group[^>]*>[\s\S]*?<media:thumbnail[^>]+url=["']([^"']+)["']/i);
    if (mediaGroupImageMatch) return decodeHtmlEntities(mediaGroupImageMatch[1]);
    
    // Try Yandex turbo:content image
    const turboMatch = content.match(/<turbo:content[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
    if (turboMatch) return decodeHtmlEntities(turboMatch[1]);
    
    // Try content:encoded with image
    const contentEncodedMatch = content.match(/<content:encoded[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
    if (contentEncodedMatch && !contentEncodedMatch[1].includes('data:')) return decodeHtmlEntities(contentEncodedMatch[1]);
    
    // Try image tag in description/content (filter out tracking pixels and small icons)
    const imgMatches = content.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
    for (const match of imgMatches) {
      const src = match[1];
      // Skip small tracking pixels, icons, and data URIs
      if (src.includes('data:') || src.includes('1x1') || src.includes('pixel') || 
          src.includes('spacer') || src.includes('tracking') || src.length > 500) {
        continue;
      }
      // Prefer images with common extensions
      if (src.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
        return decodeHtmlEntities(src);
      }
    }
    
    // Fallback: try any img src
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && !imgMatch[1].includes('data:') && imgMatch[1].length < 500) {
      return decodeHtmlEntities(imgMatch[1]);
    }
    
    return undefined;
  }
  
  // Try RSS 2.0 format first
  const rssItemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = rssItemRegex.exec(xml)) !== null) {
    const itemContent = match[1];
    
    const titleMatch = itemContent.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = itemContent.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const descMatch = itemContent.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const pubDateMatch = itemContent.match(/<pubDate[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i);
    
    const titleRaw = titleMatch ? titleMatch[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    const link = linkMatch ? linkMatch[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    const descRaw = descMatch ? descMatch[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim() : '';
    const pubDateRaw = pubDateMatch ? pubDateMatch[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    const imageUrl = extractImageUrl(itemContent);
    
    const title = decodeHtmlEntities(titleRaw);
    const description = decodeHtmlEntities(descRaw);
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : undefined;
    
    if (title) {
      items.push({ title, link, description, imageUrl, pubDate: pubDate && !isNaN(pubDate.getTime()) ? pubDate : undefined });
    }
  }
  
  // Try Atom format if no RSS items found
  if (items.length === 0) {
    const atomEntryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((match = atomEntryRegex.exec(xml)) !== null) {
      const entryContent = match[1];
      
      const titleMatch = entryContent.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const linkMatch = entryContent.match(/<link[^>]*href=["']([^"']+)["']/i);
      const summaryMatch = entryContent.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
      const contentMatch = entryContent.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i);
      const updatedMatch = entryContent.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i);
      const publishedMatch = entryContent.match(/<published[^>]*>([\s\S]*?)<\/published>/i);
      
      const titleRaw = titleMatch ? titleMatch[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
      const link = linkMatch ? linkMatch[1].trim() : '';
      const descRaw = (summaryMatch ? summaryMatch[1] : contentMatch ? contentMatch[1] : '').trim().replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
      const pubDateRaw = (publishedMatch ? publishedMatch[1] : updatedMatch ? updatedMatch[1] : '').trim();
      const imageUrl = extractImageUrl(entryContent);
      
      const title = decodeHtmlEntities(titleRaw);
      const description = decodeHtmlEntities(descRaw);
      const pubDate = pubDateRaw ? new Date(pubDateRaw) : undefined;
      
      if (title) {
        items.push({ title, link, description, imageUrl, pubDate: pubDate && !isNaN(pubDate.getTime()) ? pubDate : undefined });
      }
    }
  }
  
  return items.slice(0, 10); // Limit to 10 items per source
}

interface IngestionStats {
  date: string;
  hour: number;
  dailyCount: number;
  hourlyCount: number;
  lastFetchAt: number;
}

async function getIngestionStats(): Promise<IngestionStats> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const hour = now.getHours();
  
  const statsSetting = await storage.getSetting("topic_ingestion_stats");
  if (statsSetting?.value) {
    const stats = JSON.parse(statsSetting.value) as IngestionStats;
    if (stats.date === dateStr) {
      if (stats.hour === hour) {
        return stats;
      }
      return { date: dateStr, hour, dailyCount: stats.dailyCount, hourlyCount: 0, lastFetchAt: stats.lastFetchAt };
    }
  }
  return { date: dateStr, hour, dailyCount: 0, hourlyCount: 0, lastFetchAt: 0 };
}

async function updateIngestionStats(added: number): Promise<void> {
  const stats = await getIngestionStats();
  stats.dailyCount += added;
  stats.hourlyCount += added;
  stats.lastFetchAt = Date.now();
  await storage.setSetting("topic_ingestion_stats", JSON.stringify(stats));
}

async function canFetchMoreTopics(): Promise<{ allowed: boolean; remainingDaily: number; remainingHourly: number }> {
  const stats = await getIngestionStats();
  const remainingDaily = Math.max(0, DAILY_TOPIC_LIMIT - stats.dailyCount);
  const remainingHourly = Math.max(0, TOPICS_PER_HOUR - stats.hourlyCount);
  
  console.log(`[JobWorker] Quota check: daily=${stats.dailyCount}/${DAILY_TOPIC_LIMIT}, hourly=${stats.hourlyCount}/${TOPICS_PER_HOUR}`);
  
  return {
    allowed: remainingDaily > 0 && remainingHourly > 0,
    remainingDaily,
    remainingHourly
  };
}

async function processFetchTopics(job: Job): Promise<void> {
  await storage.updateJob(job.id, { progress: 5 });
  
  const quota = await canFetchMoreTopics();
  if (!quota.allowed) {
    console.log(`[JobWorker] Topic quota exceeded. Daily remaining: ${quota.remainingDaily}, Hourly remaining: ${quota.remainingHourly}`);
    await storage.updateJob(job.id, { progress: 100 });
    return;
  }
  
  const maxTopicsThisFetch = Math.min(quota.remainingDaily, quota.remainingHourly, 5);
  let topicsAdded = 0;
  let duplicatesSkipped = 0;
  
  const sources = await storage.getSources();
  const enabledSources = sources.filter(s => s.isEnabled);
  
  if (enabledSources.length === 0) {
    console.log("[JobWorker] No enabled sources, skipping fetch");
    await storage.updateJob(job.id, { progress: 100 });
    return;
  }

  // Phase 1: Parallel fetch all RSS feeds (fast network phase)
  await storage.updateJob(job.id, { progress: 10 });
  
  type FetchResult = { source: typeof enabledSources[0]; items: ReturnType<typeof parseRSSItems>; language: "ru" | "en" };
  const rssSources = enabledSources.filter(s => s.type === "rss" && (s.config as any)?.url);
  
  console.log(`[JobWorker] Fetching ${rssSources.length} RSS sources in parallel...`);
  
  const fetchPromises = rssSources.map(async (source): Promise<FetchResult | null> => {
    const config = source.config as { url?: string; language?: string; description?: string };
    const language = (config.language || (config.description?.toLowerCase().includes('рус') ? 'ru' : 'en')) as "ru" | "en";
    
    try {
      const response = await fetch(config.url!, {
        headers: {
          'User-Agent': 'IDENGINE-Bot/1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout per feed
      });
      
      if (!response.ok) {
        console.error(`[JobWorker] Failed to fetch RSS from ${config.url}: ${response.status}`);
        return null;
      }
      
      const xml = await response.text();
      const items = parseRSSItems(xml);
      console.log(`[JobWorker] Fetched ${items.length} items from ${source.name}`);
      return { source, items, language };
    } catch (error) {
      console.error(`[JobWorker] Error fetching ${source.name}:`, error);
      return null;
    }
  });
  
  const fetchResults = (await Promise.all(fetchPromises)).filter((r): r is FetchResult => r !== null);
  
  await storage.updateJob(job.id, { progress: 50 });
  console.log(`[JobWorker] Fetched ${fetchResults.length}/${rssSources.length} RSS sources successfully`);
  
  // Phase 2: Process items (sequential for dedup)
  const allItems: Array<{ item: ReturnType<typeof parseRSSItems>[0]; source: typeof enabledSources[0]; language: "ru" | "en" }> = [];
  for (const result of fetchResults) {
    for (const item of result.items) {
      allItems.push({ item, source: result.source, language: result.language });
    }
  }
  
  // Shuffle to get variety from different sources
  allItems.sort(() => Math.random() - 0.5);
  
  const progressPerItem = 40 / Math.max(allItems.length, 1);
  let processedItems = 0;
  
  for (const { item, source, language } of allItems) {
    if (topicsAdded >= maxTopicsThisFetch) break;
    
    // Strip ALL HTML tags and URLs from title and description
    const rawTitle = stripHtml(item.title);
    const rawDescription = stripHtml(item.description).slice(0, 500);
    
    const titleLength = (rawTitle || '').trim().length;
    const titleWordCount = (rawTitle || '').split(/\s+/).filter(w => w.length > 1).length;
    
    if (titleLength < 30 && titleWordCount < 4) {
      processedItems++;
      continue;
    }
    
    const similarityCheck = await checkTopicSimilarity(rawTitle, rawDescription);
    if (!similarityCheck.passed) {
      if (item.imageUrl && similarityCheck.similarTopicId) {
        const existingTopic = await storage.getTopic(similarityCheck.similarTopicId);
        if (existingTopic && !existingTopic.imageUrl) {
          await storage.updateTopic(similarityCheck.similarTopicId, { imageUrl: item.imageUrl });
        }
      }
      duplicatesSkipped++;
      processedItems++;
      continue;
    }
    
    const tags = extractTopicTags(rawTitle, rawDescription, language);
    await storage.createTopic({
      sourceId: source.id,
      title: rawTitle,
      rawText: rawDescription || null,
      url: item.link || null,
      imageUrl: item.imageUrl || null,
      tags,
      score: Math.floor(Math.random() * 30) + 70,
      language: language,
      status: "new",
      extractionStatus: "pending",
      publishedAt: item.pubDate || null
    });
    topicsAdded++;
    processedItems++;
    
    // Update progress more frequently
    if (processedItems % 5 === 0) {
      await storage.updateJob(job.id, { progress: Math.floor(50 + processedItems * progressPerItem) });
    }
  }
  
  // Phase 3: Manual sources (quick)
  const manualSources = enabledSources.filter(s => s.type === "manual" || s.type === "url");
  for (const source of manualSources) {
    if (topicsAdded >= maxTopicsThisFetch) break;
    
    const config = source.config as { url?: string; language?: string; description?: string };
    const language = (config.language || 'en') as "ru" | "en";
    const manualContent = config.description || `Content from ${source.name}`;
    
    const similarityCheck = await checkTopicSimilarity(source.name, manualContent);
    if (!similarityCheck.passed) {
      duplicatesSkipped++;
      continue;
    }
    
    const tags = extractTopicTags(source.name, manualContent, language);
    await storage.createTopic({
      sourceId: source.id,
      title: source.name,
      rawText: manualContent,
      url: config.url || null,
      tags,
      score: Math.floor(Math.random() * 30) + 70,
      language: language,
      status: "new",
      extractionStatus: "pending"
    });
    topicsAdded++;
  }
  
  if (topicsAdded > 0) {
    await updateIngestionStats(topicsAdded);
  }
  
  console.log(`[JobWorker] Fetch complete. Added: ${topicsAdded}, Duplicates skipped: ${duplicatesSkipped}`);
  await storage.updateJob(job.id, { progress: 100 });
}

export function startAutoFetch(): void {
  if (autoFetchInterval) {
    console.log("[JobWorker] Auto-fetch already running");
    return;
  }
  
  console.log(`[JobWorker] Starting auto-fetch every ${FETCH_INTERVAL_MS / 1000}s`);
  
  autoFetchInterval = setInterval(async () => {
    try {
      const quota = await canFetchMoreTopics();
      if (!quota.allowed) {
        console.log(`[JobWorker] Auto-fetch skipped - quota exceeded`);
        return;
      }
      
      console.log(`[JobWorker] Auto-fetch triggered. Remaining: daily=${quota.remainingDaily}, hourly=${quota.remainingHourly}`);
      await storage.createJob("fetch_topics", {});
    } catch (error) {
      console.error("[JobWorker] Auto-fetch error:", error);
    }
  }, FETCH_INTERVAL_MS);
}

export function stopAutoFetch(): void {
  if (autoFetchInterval) {
    clearInterval(autoFetchInterval);
    autoFetchInterval = null;
    console.log("[JobWorker] Auto-fetch stopped");
  }
}

export async function getIngestionStatus(): Promise<{ stats: IngestionStats; limits: { daily: number; hourly: number } }> {
  const stats = await getIngestionStats();
  return {
    stats,
    limits: { daily: DAILY_TOPIC_LIMIT, hourly: TOPICS_PER_HOUR }
  };
}

// Extract only voiceover lines (lines starting with — or -)
function extractVoiceoverLines(fullScript: string): string {
  const lines = fullScript.split('\n');
  const voiceoverLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines that start with em-dash (—) or regular dash (-)
    if (trimmed.startsWith('—') || trimmed.startsWith('-')) {
      // Remove the dash and leading/trailing whitespace
      const text = trimmed.replace(/^[—\-]\s*/, '').trim();
      if (text) {
        voiceoverLines.push(text);
      }
    }
  }
  
  return voiceoverLines.join('\n');
}

// Helper function to create TopicContext from a Topic
function createTopicContext(topic: Topic): TopicContext {
  return {
    title: topic.title,
    translatedTitle: topic.translatedTitle,
    fullContent: topic.fullContent,
    rawText: topic.rawText,
    insights: topic.insights,
    language: topic.language,
  };
}

async function processExtractContent(job: Job, topicId: string): Promise<void> {
  if (!topicId) throw new Error("Topic ID is required");
  
  const topic = await storage.getTopic(topicId);
  if (!topic) throw new Error("Topic not found");

  await storage.updateTopic(topicId, { extractionStatus: "extracting" });
  await storage.updateJob(job.id, { progress: 20 });

  try {
    // Extract content from URL if available
    let fullContent = topic.rawText || "";
    
    if (topic.url) {
      // In production, this would use a proper article extractor
      // For now, we simulate content extraction
      fullContent = `Article about: ${topic.title}. This is extracted content from the source URL. ` +
        `Key information includes trending data, expert opinions, and relevant statistics. ` +
        `The topic covers important developments that are shaping current events.`;
    }

    await storage.updateJob(job.id, { progress: 50 });

    // Extract insights using the LLM provider
    const insights = await providers.llm.extractInsights(fullContent, topic.language);

    await storage.updateJob(job.id, { progress: 80 });

    await storage.updateTopic(topicId, {
      fullContent,
      insights,
      extractionStatus: "done",
    });

    await storage.updateJob(job.id, { progress: 100 });
  } catch (error) {
    await storage.updateTopic(topicId, { extractionStatus: "failed" });
    throw error;
  }
}

async function processTranslateTopic(job: Job, topicId: string): Promise<void> {
  if (!topicId) throw new Error("Topic ID is required");
  
  const topic = await storage.getTopic(topicId);
  if (!topic) throw new Error("Topic not found");

  await storage.updateJob(job.id, { progress: 30 });

  // Translate title to target language (Russian)
  const translatedTitle = await providers.llm.translateTitle(topic.title, "ru");

  await storage.updateJob(job.id, { progress: 80 });

  await storage.updateTopic(topicId, { translatedTitle });

  await storage.updateJob(job.id, { progress: 100 });
}

async function processGenerateHook(job: Job, scriptId: string): Promise<void> {
  if (!scriptId) throw new Error("Script ID is required");
  
  const script = await storage.getScript(scriptId);
  if (!script) throw new Error("Script not found");
  
  const topic = await storage.getTopic(script.topicId);
  if (!topic) throw new Error("Topic not found");

  await storage.updateScript(scriptId, { status: "generating" });
  await storage.updateJob(job.id, { progress: 30 });

  // Use context-aware generation if content/insights are available
  let hook: string;
  if (topic.fullContent || topic.insights) {
    const context = createTopicContext(topic);
    hook = await providers.llm.generateHookFromContext(
      context,
      script.stylePreset,
      script.durationSec
    );
  } else {
    hook = await providers.llm.generateHook(
      topic.title,
      script.stylePreset,
      script.durationSec,
      script.language
    );
  }

  await storage.updateJob(job.id, { progress: 80 });
  await storage.updateScript(scriptId, { hook, status: "draft" });
  await storage.updateJob(job.id, { progress: 100 });
}

async function processGenerateScript(job: Job, scriptId: string): Promise<void> {
  if (!scriptId) throw new Error("Script ID is required");
  
  const script = await storage.getScript(scriptId);
  if (!script) throw new Error("Script not found");
  
  const topic = await storage.getTopic(script.topicId);
  if (!topic) throw new Error("Topic not found");

  await storage.updateScript(scriptId, { status: "generating" });
  await storage.updateJob(job.id, { progress: 20 });

  // Get trend signals for enhanced generation
  const { getTrendSignalsForGeneration, buildTrendEnhancedPrompt } = await import("./trend-extraction");
  const source = await storage.getSource(topic.sourceId);
  const trendSignals = await getTrendSignalsForGeneration(
    source?.categoryId as any || undefined,
    "youtube_shorts"
  );

  await storage.updateJob(job.id, { progress: 30 });

  // Use context-aware generation if content/insights are available
  let voiceText: string;
  if (topic.fullContent || topic.insights) {
    const context = createTopicContext(topic);
    
    // Enhance context with trend signals if available (clone insights to avoid mutating stored data)
    if (trendSignals.length > 0 && context.insights) {
      const trendAngles = Array.from(new Set(trendSignals.flatMap(s => s.angles))).slice(0, 3);
      const trendHooks = Array.from(new Set(trendSignals.flatMap(s => s.hookPatterns))).slice(0, 3);
      context.insights = {
        ...context.insights,
        trendingAngles: [...(context.insights.trendingAngles || []), ...trendAngles],
        emotionalHooks: [...(context.insights.emotionalHooks || []), ...trendHooks.map(h => `Pattern: ${h}`)]
      };
    }
    
    voiceText = await providers.llm.generateScriptFromContext(
      context,
      script.hook || "",
      script.stylePreset,
      script.durationSec
    );
  } else {
    voiceText = await providers.llm.generateScript(
      topic.title,
      script.hook || "",
      script.stylePreset,
      script.durationSec,
      script.language
    );
  }

  await storage.updateJob(job.id, { progress: 70 });

  // Check similarity with existing scripts (anti-copy protection)
  const { checkScriptSimilarity } = await import("./similarity");
  const similarityResult = await checkScriptSimilarity(voiceText, scriptId);
  
  if (!similarityResult.passed) {
    console.log(`[JobWorker] Script too similar (${similarityResult.highestSimilarity * 100}%) to ${similarityResult.similarScriptTitle}`);
    await storage.updateScript(scriptId, { 
      status: "error",
      error: `Content too similar (${Math.round(similarityResult.highestSimilarity * 100)}%) to existing script. Try different angle or topic.`
    });
    throw new Error(`Script similarity check failed: ${similarityResult.highestSimilarity * 100}% similar to existing content`);
  }

  await storage.updateJob(job.id, { progress: 90 });
  
  // Extract only voiceover lines (after dashes) for TTS
  const voiceoverOnly = extractVoiceoverLines(voiceText);
  
  // Store full script in onScreenText, voiceover-only in voiceText
  await storage.updateScript(scriptId, { 
    voiceText: voiceoverOnly, 
    onScreenText: voiceText, 
    status: "draft" 
  });
  await storage.updateJob(job.id, { progress: 100 });
}

async function processGenerateStoryboard(job: Job, scriptId: string): Promise<void> {
  if (!scriptId) throw new Error("Script ID is required");
  
  const script = await storage.getScript(scriptId);
  if (!script) throw new Error("Script not found");

  await storage.updateScript(scriptId, { status: "generating" });
  await storage.updateJob(job.id, { progress: 30 });

  const storyboard = await providers.llm.generateStoryboard(
    script.voiceText || script.hook || "",
    script.stylePreset,
    script.durationSec,
    script.language
  );

  await storage.updateJob(job.id, { progress: 80 });
  await storage.updateScript(scriptId, { storyboard, status: "draft" });
  await storage.updateJob(job.id, { progress: 100 });
}

async function processGenerateVoice(job: Job, scriptId: string): Promise<void> {
  if (!scriptId) throw new Error("Script ID is required");
  
  const script = await storage.getScript(scriptId);
  if (!script) throw new Error("Script not found");

  await storage.updateScript(scriptId, { status: "generating" });
  await storage.updateJob(job.id, { progress: 30 });

  // TTS is optional in fallback mode
  const voiceFile = await providers.tts.generateVoice(
    script.voiceText || "",
    script.voiceStylePreset
  );

  await storage.updateJob(job.id, { progress: 80 });
  
  const assets = { ...script.assets, voiceFile };
  await storage.updateScript(scriptId, { assets, status: "draft" });
  await storage.updateJob(job.id, { progress: 100 });
}

async function processPickMusic(job: Job, scriptId: string): Promise<void> {
  if (!scriptId) throw new Error("Script ID is required");
  
  const script = await storage.getScript(scriptId);
  if (!script) throw new Error("Script not found");

  await storage.updateScript(scriptId, { status: "generating" });
  await storage.updateJob(job.id, { progress: 30 });

  const music = await providers.music.pickMusic(
    script.voiceText || script.hook || "",
    script.stylePreset,
    script.durationSec
  );

  await storage.updateJob(job.id, { progress: 80 });
  await storage.updateScript(scriptId, { music, status: "draft" });
  await storage.updateJob(job.id, { progress: 100 });
}

async function processExportPackage(job: Job, scriptId: string): Promise<void> {
  if (!scriptId) throw new Error("Script ID is required");
  
  const script = await storage.getScript(scriptId);
  if (!script) throw new Error("Script not found");

  await storage.updateJob(job.id, { progress: 50 });

  // In a real implementation, this would create a ZIP file
  // For now, we just mark it as exported
  const assets = { ...script.assets, exportZip: `/api/scripts/${scriptId}/download` };
  await storage.updateScript(scriptId, { assets, status: "exported" });
  await storage.updateJob(job.id, { progress: 100 });
}

async function processGenerateAll(job: Job, scriptId: string): Promise<void> {
  if (!scriptId) throw new Error("Script ID is required");

  const steps = [
    { name: "hook", progress: 15 },
    { name: "script", progress: 35 },
    { name: "storyboard", progress: 55 },
    { name: "music", progress: 75 },
    { name: "seo", progress: 90 },
  ];

  for (const step of steps) {
    const script = await storage.getScript(scriptId);
    if (!script) throw new Error("Script not found");
    
    const topic = await storage.getTopic(script.topicId);
    if (!topic) throw new Error("Topic not found");

    await storage.updateScript(scriptId, { status: "generating" });

    // Check if context-aware generation should be used
    const useContext = topic.fullContent || topic.insights;
    const context = useContext ? createTopicContext(topic) : null;

    if (step.name === "hook" && !script.hook) {
      let hook: string;
      if (context) {
        hook = await providers.llm.generateHookFromContext(context, script.stylePreset, script.durationSec);
      } else {
        hook = await providers.llm.generateHook(topic.title, script.stylePreset, script.durationSec, script.language);
      }
      await storage.updateScript(scriptId, { hook });
    } else if (step.name === "script" && !script.voiceText) {
      const currentScript = await storage.getScript(scriptId);
      let fullScript: string;
      if (context) {
        fullScript = await providers.llm.generateScriptFromContext(context, currentScript?.hook || "", script.stylePreset, script.durationSec);
      } else {
        fullScript = await providers.llm.generateScript(topic.title, currentScript?.hook || "", script.stylePreset, script.durationSec, script.language);
      }
      // Extract only voiceover lines (after dashes) for TTS
      const voiceoverOnly = extractVoiceoverLines(fullScript);
      await storage.updateScript(scriptId, { voiceText: voiceoverOnly, onScreenText: fullScript });
    } else if (step.name === "storyboard" && !script.storyboard?.length) {
      const currentScript = await storage.getScript(scriptId);
      let storyboard;
      if (context) {
        storyboard = await providers.llm.generateStoryboardFromContext(context, currentScript?.voiceText || "", script.stylePreset, script.durationSec);
      } else {
        storyboard = await providers.llm.generateStoryboard(currentScript?.voiceText || "", script.stylePreset, script.durationSec, script.language);
      }
      await storage.updateScript(scriptId, { storyboard });
    } else if (step.name === "music" && !script.music) {
      const currentScript = await storage.getScript(scriptId);
      const music = await providers.music.pickMusic(currentScript?.voiceText || "", script.stylePreset, script.durationSec);
      await storage.updateScript(scriptId, { music });
    } else if (step.name === "seo" && !script.seo) {
      const seo = await providers.llm.generateSEO({
        topic: topic.generatedTitle || topic.translatedTitle || topic.title,
        keywords: script.keywords || [],
        language: script.language,
        platform: script.platform || "youtube_shorts",
        stylePreset: script.stylePreset
      });
      await storage.updateScript(scriptId, { seo });
    }

    await storage.updateJob(job.id, { progress: step.progress });
  }

  await storage.updateScript(scriptId, { status: "ready" });
  await storage.updateJob(job.id, { progress: 100 });
}

async function processHealthCheck(job: Job, sourceId: string): Promise<void> {
  if (!sourceId) throw new Error("Source ID is required");
  
  const { checkSingleSource } = await import("./health-check");
  const result = await checkSingleSource(sourceId);
  
  if (!result) throw new Error("Source not found");
  
  console.log(`[JobWorker] Health check for ${result.source.name}: ${result.source.health.status}`);
}

async function processHealthCheckAll(job: Job): Promise<void> {
  const { checkAllSources } = await import("./health-check");
  const result = await checkAllSources();
  console.log(`[JobWorker] Health check all: ${result.checked} checked, ${result.healthy} healthy`);
}

async function processAutoDiscovery(job: Job, categoryId: string): Promise<void> {
  const { discoverSourcesForCategory, discoverAllCategories } = await import("./auto-discovery");
  
  await storage.updateJob(job.id, { progress: 10 });
  
  if (categoryId) {
    const result = await discoverSourcesForCategory(categoryId as any);
    console.log(`[JobWorker] Auto-discovery for ${categoryId}: added ${result.added}, skipped ${result.skipped}`);
  } else {
    const results = await discoverAllCategories();
    const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
    console.log(`[JobWorker] Auto-discovery all: added ${totalAdded} sources across ${results.length} categories`);
  }
  
  await storage.updateJob(job.id, { progress: 100 });
}

async function processExtractTrends(job: Job, categoryId: string): Promise<void> {
  const { extractTrendsFromTopics } = await import("./trend-extraction");
  
  await storage.updateJob(job.id, { progress: 10 });
  
  const signals = await extractTrendsFromTopics(categoryId as any || undefined);
  console.log(`[JobWorker] Extracted ${signals.length} trend signals for category ${categoryId || 'all'}`);
  
  await storage.updateJob(job.id, { progress: 100 });
}

// Clean up stale "running" jobs that have been stuck for more than 1 minute
async function cleanupStaleJobs(): Promise<void> {
  try {
    const allJobs = await storage.getJobs();
    const staleThreshold = Date.now() - 60 * 1000; // 1 minute
    
    for (const job of allJobs) {
      if (job.status === "running") {
        const updatedAt = new Date(job.updatedAt).getTime();
        if (updatedAt < staleThreshold) {
          console.log(`[JobWorker] Cleaning up stale job ${job.id} (${job.kind})`);
          await storage.updateJob(job.id, { 
            status: "error", 
            error: "Job timed out (stale)" 
          });
        }
      }
    }
  } catch (error) {
    console.error("[JobWorker] Error cleaning up stale jobs:", error);
  }
}

export async function startJobWorker(): Promise<void> {
  console.log("[JobWorker] Starting job worker...");
  
  // Clean up any stale jobs from previous runs on startup
  await cleanupStaleJobs();
  
  // Periodically clean up stale jobs (every 2 minutes)
  setInterval(cleanupStaleJobs, 2 * 60 * 1000);
  
  setInterval(async () => {
    if (isProcessing) return;
    
    try {
      const queuedJobs = await storage.getQueuedJobs();
      if (queuedJobs.length === 0) return;

      isProcessing = true;
      const job = queuedJobs[0];
      await processJob(job);
    } catch (error) {
      console.error("[JobWorker] Error in worker loop:", error);
    } finally {
      isProcessing = false;
    }
  }, 1000);
}
