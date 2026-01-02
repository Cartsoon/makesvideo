import { storage } from "./storage";
import type { Source, SourceHealth, SourceHealthStatus } from "@shared/schema";

const MAX_FAILURES_BEFORE_DISABLE = 12;
const MIN_SOURCES_PER_CATEGORY = 20;
const HEALTH_CHECK_TIMEOUT_MS = 10000;

interface HealthCheckResult {
  healthy: boolean;
  httpCode: number | null;
  latencyMs: number;
  itemCount: number;
  error: string | null;
  freshnessHours: number | null;
}

const NETWORKABLE_TYPES = ["rss", "api", "html", "url", "youtube_channel", "youtube_search", "youtube_trending"];

async function checkSourceHealth(source: Source): Promise<HealthCheckResult | null> {
  const startTime = Date.now();
  
  if (!NETWORKABLE_TYPES.includes(source.type)) {
    return null;
  }
  
  if (!source.config.url) {
    return {
      healthy: false,
      httpCode: null,
      latencyMs: 0,
      itemCount: 0,
      error: "No URL configured",
      freshnessHours: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(source.config.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IDEngine/1.0; +https://idengine.app)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    clearTimeout(timeout);
    
    const latencyMs = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        healthy: false,
        httpCode: response.status,
        latencyMs,
        itemCount: 0,
        error: `HTTP ${response.status}`,
        freshnessHours: null,
      };
    }

    const xml = await response.text();
    
    const rssCount = (xml.match(/<item[^>]*>/gi) || []).length;
    const atomCount = (xml.match(/<entry[^>]*>/gi) || []).length;
    const itemCount = Math.max(rssCount, atomCount);
    
    if (itemCount === 0) {
      return {
        healthy: false,
        httpCode: response.status,
        latencyMs,
        itemCount: 0,
        error: "No RSS items found",
        freshnessHours: null,
      };
    }

    const freshnessHours = parseFreshness(xml);

    return {
      healthy: true,
      httpCode: response.status,
      latencyMs,
      itemCount,
      error: null,
      freshnessHours,
    };
  } catch (error: any) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - startTime;
    return {
      healthy: false,
      httpCode: null,
      latencyMs,
      itemCount: 0,
      error: error.name === "AbortError" ? "Timeout" : error.message || "Connection failed",
      freshnessHours: null,
    };
  }
}

function parseFreshness(xml: string): number | null {
  try {
    const pubDateMatch = xml.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i);
    const updatedMatch = xml.match(/<updated[^>]*>([^<]+)<\/updated>/i);
    
    const dateStr = pubDateMatch?.[1] || updatedMatch?.[1];
    if (!dateStr) return null;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;

    const hoursAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    return Math.round(hoursAgo * 10) / 10;
  } catch {
    return null;
  }
}

function determineHealthStatus(result: HealthCheckResult, currentHealth: SourceHealth): SourceHealthStatus {
  if (!result.healthy) {
    const newFailureCount = (currentHealth.failuresCount || 0) + 1;
    if (newFailureCount >= 6) return "dead";
    if (newFailureCount >= 2) return "warning";
    return "pending";
  }

  if (result.freshnessHours !== null && result.freshnessHours > 72) {
    return "warning";
  }
  
  if (result.latencyMs > 5000) {
    return "warning";
  }

  return "ok";
}

export async function checkSingleSource(sourceId: string): Promise<{ source: Source; result: HealthCheckResult | null; skipped: boolean } | null> {
  const source = await storage.getSource(sourceId);
  if (!source) return null;

  const result = await checkSourceHealth(source);
  
  if (result === null) {
    const health = source.health;
    if (health.status === "pending") {
      await storage.updateSourceHealth(sourceId, { ...health, status: "ok" });
    }
    return { source, result: null, skipped: true };
  }
  
  const status = determineHealthStatus(result, source.health);

  const newHealth: SourceHealth = {
    status,
    httpCode: result.httpCode,
    avgLatencyMs: result.healthy 
      ? Math.round(((source.health.avgLatencyMs || result.latencyMs) + result.latencyMs) / 2)
      : source.health.avgLatencyMs,
    lastSuccessAt: result.healthy ? new Date().toISOString() : source.health.lastSuccessAt,
    failuresCount: result.healthy ? 0 : (source.health.failuresCount || 0) + 1,
    freshnessHours: result.freshnessHours ?? source.health.freshnessHours,
    lastError: result.error,
    itemCount: result.itemCount || source.health.itemCount,
  };

  const updatedSource = await storage.updateSourceHealth(sourceId, newHealth);
  
  if (newHealth.failuresCount >= MAX_FAILURES_BEFORE_DISABLE && source.isEnabled) {
    await storage.updateSource(sourceId, { isEnabled: false });
    console.log(`[HealthCheck] Auto-disabled source "${source.name}" after ${MAX_FAILURES_BEFORE_DISABLE} failures`);
  }

  return updatedSource ? { source: updatedSource, result, skipped: false } : null;
}

export async function checkAllSources(): Promise<{ checked: number; skipped: number; healthy: number; warnings: number; dead: number }> {
  const sources = await storage.getSources();
  
  let checked = 0;
  let skipped = 0;
  let healthy = 0;
  let warnings = 0;
  let dead = 0;

  for (const source of sources) {
    if (!source.isEnabled) continue;
    
    const result = await checkSingleSource(source.id);
    if (result) {
      if (result.skipped) {
        skipped++;
      } else {
        checked++;
        if (result.source.health.status === "ok") healthy++;
        else if (result.source.health.status === "warning") warnings++;
        else if (result.source.health.status === "dead") dead++;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`[HealthCheck] Checked ${checked} sources: ${healthy} healthy, ${warnings} warnings, ${dead} dead (${skipped} skipped)`);
  return { checked, skipped, healthy, warnings, dead };
}

export async function getSourcesNeedingAttention(): Promise<Source[]> {
  const sources = await storage.getSources();
  return sources.filter(s => 
    s.isEnabled && 
    (s.health.status === "warning" || s.health.status === "dead" || s.health.status === "pending")
  );
}

export async function getCategoryHealthStats(): Promise<Record<string, { total: number; enabled: number; healthy: number; needsMore: boolean }>> {
  const sources = await storage.getSources();
  const stats: Record<string, { total: number; enabled: number; healthy: number; needsMore: boolean }> = {};

  for (const source of sources) {
    if (!source.categoryId) continue;
    
    if (!stats[source.categoryId]) {
      stats[source.categoryId] = { total: 0, enabled: 0, healthy: 0, needsMore: false };
    }

    stats[source.categoryId].total++;
    if (source.isEnabled) stats[source.categoryId].enabled++;
    if (source.health.status === "ok") stats[source.categoryId].healthy++;
  }

  for (const categoryId of Object.keys(stats)) {
    stats[categoryId].needsMore = stats[categoryId].enabled < MIN_SOURCES_PER_CATEGORY;
  }

  return stats;
}
