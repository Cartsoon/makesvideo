import OpenAI from "openai";
import type { StockAsset, StockMediaType, StockOrientation, StockProvider, StockSearchResponse } from "@shared/schema";
import { logError, logInfo } from "./error-logger";

const stockCache = new Map<string, { data: StockSearchResponse; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface ProviderConfig {
  apiKey: string | undefined;
  baseUrl: string;
  rateLimit: number;
}

const providerConfigs: Record<StockProvider, ProviderConfig> = {
  pexels: {
    apiKey: process.env.PEXELS_API_KEY,
    baseUrl: "https://api.pexels.com",
    rateLimit: 200, // per hour
  },
  pixabay: {
    apiKey: process.env.PIXABAY_API_KEY,
    baseUrl: "https://pixabay.com/api",
    rateLimit: 5000, // per day
  },
  unsplash: {
    apiKey: process.env.UNSPLASH_ACCESS_KEY,
    baseUrl: "https://api.unsplash.com",
    rateLimit: 50, // per hour
  },
  freesound: {
    apiKey: process.env.FREESOUND_API_KEY,
    baseUrl: "https://freesound.org/apiv2",
    rateLimit: 60, // per minute
  },
};

async function translateToEnglish(query: string): Promise<string> {
  const isEnglish = /^[a-zA-Z0-9\s.,!?'-]+$/.test(query);
  if (isEnglish) return query;

  try {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    
    if (!apiKey) {
      logInfo("StockSearch", "No OpenAI API key, skipping translation");
      return query;
    }

    const openai = new OpenAI({ 
      apiKey,
      baseURL: baseUrl || "https://api.openai.com/v1"
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Translate the search query to English for stock media search. Return ONLY the translated query, nothing else. Keep it concise and search-optimized."
        },
        { role: "user", content: query }
      ],
      max_tokens: 50,
      temperature: 0.1,
    });

    const translated = response.choices[0]?.message?.content?.trim() || query;
    logInfo("StockSearch", `Translated "${query}" -> "${translated}"`);
    return translated;
  } catch (error) {
    logError("StockSearch", "Translation failed", error);
    return query;
  }
}

function getOrientationParam(orientation: StockOrientation, provider: "pexels" | "pixabay" | "unsplash"): string {
  if (orientation === "all") return "";
  if (provider === "pexels" || provider === "unsplash") {
    return `&orientation=${orientation}`;
  }
  if (provider === "pixabay") {
    return `&orientation=${orientation === "portrait" ? "vertical" : "horizontal"}`;
  }
  return "";
}

async function searchPexelsVideos(query: string, perPage: number = 15, orientation: StockOrientation = "all"): Promise<StockAsset[]> {
  const apiKey = providerConfigs.pexels.apiKey;
  if (!apiKey) return [];

  try {
    const orientationParam = getOrientationParam(orientation, "pexels");
    const url = `${providerConfigs.pexels.baseUrl}/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}${orientationParam}`;
    const response = await fetch(url, {
      headers: { Authorization: apiKey },
    });

    if (!response.ok) return [];
    const data = await response.json();

    return (data.videos || []).map((video: any): StockAsset => ({
      id: `pexels-v-${video.id}`,
      provider: "pexels",
      mediaType: "video",
      title: video.url?.split("/").pop()?.replace(/-/g, " ") || "Pexels Video",
      previewUrl: video.video_files?.[0]?.link || video.image,
      downloadUrl: video.video_files?.find((f: any) => f.quality === "hd")?.link || video.video_files?.[0]?.link,
      thumbnailUrl: video.image,
      duration: video.duration,
      width: video.width,
      height: video.height,
      author: video.user?.name,
      authorUrl: video.user?.url,
      license: "Pexels License (Free)",
      tags: video.tags || [],
    }));
  } catch (error) {
    logError("StockSearch", "Pexels video search failed", error);
    return [];
  }
}

async function searchPexelsPhotos(query: string, perPage: number = 15, orientation: StockOrientation = "all"): Promise<StockAsset[]> {
  const apiKey = providerConfigs.pexels.apiKey;
  if (!apiKey) return [];

  try {
    const orientationParam = getOrientationParam(orientation, "pexels");
    const url = `${providerConfigs.pexels.baseUrl}/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}${orientationParam}`;
    const response = await fetch(url, {
      headers: { Authorization: apiKey },
    });

    if (!response.ok) return [];
    const data = await response.json();

    return (data.photos || []).map((photo: any): StockAsset => ({
      id: `pexels-p-${photo.id}`,
      provider: "pexels",
      mediaType: "photo",
      title: photo.alt || "Pexels Photo",
      previewUrl: photo.src?.medium || photo.src?.original,
      downloadUrl: photo.src?.original,
      thumbnailUrl: photo.src?.small,
      width: photo.width,
      height: photo.height,
      author: photo.photographer,
      authorUrl: photo.photographer_url,
      license: "Pexels License (Free)",
    }));
  } catch (error) {
    logError("StockSearch", "Pexels photo search failed", error);
    return [];
  }
}

async function searchPixabayVideos(query: string, perPage: number = 15, orientation: StockOrientation = "all"): Promise<StockAsset[]> {
  const apiKey = providerConfigs.pixabay.apiKey;
  if (!apiKey) return [];

  try {
    const orientationParam = getOrientationParam(orientation, "pixabay");
    const url = `${providerConfigs.pixabay.baseUrl}/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${perPage}${orientationParam}`;
    const response = await fetch(url);

    if (!response.ok) return [];
    const data = await response.json();

    return (data.hits || []).map((video: any): StockAsset => {
      const videoWidth = video.videos?.large?.width || video.videos?.medium?.width || 1920;
      const videoHeight = video.videos?.large?.height || video.videos?.medium?.height || 1080;
      const isPortrait = videoHeight > videoWidth;
      const thumbSize = isPortrait ? "360x640" : "640x360";
      
      return {
        id: `pixabay-v-${video.id}`,
        provider: "pixabay",
        mediaType: "video",
        title: video.tags?.split(",")[0] || "Pixabay Video",
        description: video.tags,
        previewUrl: video.videos?.small?.url || video.videos?.medium?.url,
        downloadUrl: video.videos?.large?.url || video.videos?.medium?.url,
        thumbnailUrl: `https://i.vimeocdn.com/video/${video.picture_id}_${thumbSize}.jpg`,
        duration: video.duration,
        width: videoWidth,
        height: videoHeight,
        author: video.user,
        authorUrl: `https://pixabay.com/users/${video.user}-${video.user_id}/`,
        license: "Pixabay License (Free)",
        tags: video.tags?.split(", ") || [],
      };
    });
  } catch (error) {
    logError("StockSearch", "Pixabay video search failed", error);
    return [];
  }
}

async function searchPixabayPhotos(query: string, perPage: number = 15, orientation: StockOrientation = "all"): Promise<StockAsset[]> {
  const apiKey = providerConfigs.pixabay.apiKey;
  if (!apiKey) return [];

  try {
    const orientationParam = getOrientationParam(orientation, "pixabay");
    const url = `${providerConfigs.pixabay.baseUrl}/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${perPage}&image_type=photo${orientationParam}`;
    const response = await fetch(url);

    if (!response.ok) return [];
    const data = await response.json();

    return (data.hits || []).map((photo: any): StockAsset => ({
      id: `pixabay-p-${photo.id}`,
      provider: "pixabay",
      mediaType: "photo",
      title: photo.tags?.split(",")[0] || "Pixabay Photo",
      description: photo.tags,
      previewUrl: photo.webformatURL,
      downloadUrl: photo.largeImageURL,
      thumbnailUrl: photo.previewURL,
      width: photo.imageWidth,
      height: photo.imageHeight,
      author: photo.user,
      authorUrl: `https://pixabay.com/users/${photo.user}-${photo.user_id}/`,
      license: "Pixabay License (Free)",
      tags: photo.tags?.split(", ") || [],
    }));
  } catch (error) {
    logError("StockSearch", "Pixabay photo search failed", error);
    return [];
  }
}

async function searchPixabayAudio(query: string, perPage: number = 15): Promise<StockAsset[]> {
  const apiKey = providerConfigs.pixabay.apiKey;
  if (!apiKey) return [];

  try {
    const url = `${providerConfigs.pixabay.baseUrl}/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${perPage}&media_type=music`;
    const response = await fetch(url);

    if (!response.ok) return [];
    const data = await response.json();

    return (data.hits || []).map((audio: any): StockAsset => ({
      id: `pixabay-a-${audio.id}`,
      provider: "pixabay",
      mediaType: "audio",
      title: audio.tags?.split(",")[0] || "Pixabay Audio",
      description: audio.tags,
      previewUrl: audio.previewURL || audio.webformatURL,
      downloadUrl: audio.largeImageURL || audio.webformatURL,
      duration: audio.duration,
      author: audio.user,
      authorUrl: `https://pixabay.com/users/${audio.user}-${audio.user_id}/`,
      license: "Pixabay License (Free)",
      tags: audio.tags?.split(", ") || [],
    }));
  } catch (error) {
    logError("StockSearch", "Pixabay audio search failed", error);
    return [];
  }
}

async function searchUnsplashPhotos(query: string, perPage: number = 15, orientation: StockOrientation = "all"): Promise<StockAsset[]> {
  const apiKey = providerConfigs.unsplash.apiKey;
  if (!apiKey) return [];

  try {
    const orientationParam = getOrientationParam(orientation, "unsplash");
    const url = `${providerConfigs.unsplash.baseUrl}/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}${orientationParam}`;
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${apiKey}` },
    });

    if (!response.ok) return [];
    const data = await response.json();

    return (data.results || []).map((photo: any): StockAsset => ({
      id: `unsplash-p-${photo.id}`,
      provider: "unsplash",
      mediaType: "photo",
      title: photo.description || photo.alt_description || "Unsplash Photo",
      description: photo.description,
      previewUrl: photo.urls?.regular,
      downloadUrl: photo.urls?.full,
      thumbnailUrl: photo.urls?.small,
      width: photo.width,
      height: photo.height,
      author: photo.user?.name,
      authorUrl: photo.user?.links?.html,
      license: "Unsplash License (Free)",
      tags: photo.tags?.map((t: any) => t.title) || [],
    }));
  } catch (error) {
    logError("StockSearch", "Unsplash photo search failed", error);
    return [];
  }
}

async function searchFreesoundAudio(query: string, perPage: number = 15): Promise<StockAsset[]> {
  const apiKey = providerConfigs.freesound.apiKey;
  if (!apiKey) return [];

  try {
    const url = `${providerConfigs.freesound.baseUrl}/search/text/?query=${encodeURIComponent(query)}&page_size=${perPage}&token=${apiKey}&fields=id,name,description,duration,username,previews,tags,license`;
    const response = await fetch(url);

    if (!response.ok) return [];
    const data = await response.json();

    return (data.results || []).map((sound: any): StockAsset => ({
      id: `freesound-a-${sound.id}`,
      provider: "freesound",
      mediaType: "audio",
      title: sound.name || "Freesound Audio",
      description: sound.description?.substring(0, 200),
      previewUrl: sound.previews?.["preview-hq-mp3"] || sound.previews?.["preview-lq-mp3"],
      downloadUrl: sound.previews?.["preview-hq-mp3"],
      duration: Math.round(sound.duration),
      author: sound.username,
      authorUrl: `https://freesound.org/people/${sound.username}/`,
      license: sound.license || "Creative Commons",
      tags: sound.tags || [],
    }));
  } catch (error) {
    logError("StockSearch", "Freesound audio search failed", error);
    return [];
  }
}

export async function searchStock(
  query: string,
  mediaType: StockMediaType,
  limit: number = 30,
  orientation: StockOrientation = "all"
): Promise<StockSearchResponse> {
  const cacheKey = `${mediaType}:${orientation}:${query}:${limit}`;
  const cached = stockCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logInfo("StockSearch", `Cache hit for "${query}" (${mediaType}, ${orientation})`);
    return cached.data;
  }

  logInfo("StockSearch", `Searching for "${query}" (${mediaType}, ${orientation}), limit: ${limit}`);

  const translatedQuery = await translateToEnglish(query);
  const perProvider = Math.ceil(limit / 3);

  let assets: StockAsset[] = [];

  if (mediaType === "video") {
    const [pexelsVideos, pixabayVideos] = await Promise.all([
      searchPexelsVideos(translatedQuery, perProvider, orientation),
      searchPixabayVideos(translatedQuery, perProvider, orientation),
    ]);
    assets = [...pexelsVideos, ...pixabayVideos];
  } else if (mediaType === "photo") {
    const [pexelsPhotos, pixabayPhotos, unsplashPhotos] = await Promise.all([
      searchPexelsPhotos(translatedQuery, perProvider, orientation),
      searchPixabayPhotos(translatedQuery, perProvider, orientation),
      searchUnsplashPhotos(translatedQuery, perProvider, orientation),
    ]);
    assets = [...pexelsPhotos, ...pixabayPhotos, ...unsplashPhotos];
  } else if (mediaType === "audio") {
    const [freesoundAudio, pixabayAudio] = await Promise.all([
      searchFreesoundAudio(translatedQuery, perProvider),
      searchPixabayAudio(translatedQuery, perProvider),
    ]);
    assets = [...freesoundAudio, ...pixabayAudio];
  }

  const uniqueAssets = assets.filter((asset, index, self) => 
    index === self.findIndex(a => a.downloadUrl === asset.downloadUrl)
  );

  const sortedAssets = uniqueAssets
    .sort(() => Math.random() - 0.5)
    .slice(0, limit);

  const response: StockSearchResponse = {
    assets: sortedAssets,
    query,
    translatedQuery,
    mediaType,
    totalResults: sortedAssets.length,
  };

  stockCache.set(cacheKey, { data: response, timestamp: Date.now() });
  if (stockCache.size > 100) {
    const oldestKey = stockCache.keys().next().value;
    if (oldestKey) stockCache.delete(oldestKey);
  }

  logInfo("StockSearch", `Found ${sortedAssets.length} ${mediaType} results for "${query}"`);
  return response;
}

export function getStockProviderStatus(): Record<StockProvider, boolean> {
  return {
    pexels: !!providerConfigs.pexels.apiKey,
    pixabay: !!providerConfigs.pixabay.apiKey,
    unsplash: !!providerConfigs.unsplash.apiKey,
    freesound: !!providerConfigs.freesound.apiKey,
  };
}
