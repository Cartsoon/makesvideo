import { storage } from "./storage";
import { providers, TopicContext } from "./providers";
import type { Job, JobKind, Topic, TopicInsights } from "@shared/schema";

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

// Simple RSS parser - extracts items from RSS/Atom XML
function parseRSSItems(xml: string): Array<{ title: string; link: string; description: string }> {
  const items: Array<{ title: string; link: string; description: string }> = [];
  
  // Try RSS 2.0 format first
  const rssItemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = rssItemRegex.exec(xml)) !== null) {
    const itemContent = match[1];
    
    const titleMatch = itemContent.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = itemContent.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const descMatch = itemContent.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    
    const title = titleMatch ? titleMatch[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    const link = linkMatch ? linkMatch[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    const description = descMatch ? descMatch[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim() : '';
    
    if (title) {
      items.push({ title, link, description });
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
      
      const title = titleMatch ? titleMatch[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
      const link = linkMatch ? linkMatch[1].trim() : '';
      const description = (summaryMatch ? summaryMatch[1] : contentMatch ? contentMatch[1] : '').trim().replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
      
      if (title) {
        items.push({ title, link, description });
      }
    }
  }
  
  return items.slice(0, 10); // Limit to 10 items per source
}

async function processFetchTopics(job: Job): Promise<void> {
  await storage.updateJob(job.id, { progress: 10 });
  
  const sources = await storage.getSources();
  const enabledSources = sources.filter(s => s.isEnabled);
  
  if (enabledSources.length === 0) {
    // Create some demo topics if no sources - with bilingual titles
    const demoTopics = [
      { 
        title: "AI is transforming content creation in 2025", 
        titleRu: "ИИ меняет создание контента в 2025 году",
        desc: "Artificial intelligence tools are revolutionizing how creators produce videos, from script writing to editing and voice synthesis.",
        descRu: "Инструменты искусственного интеллекта революционизируют создание видео - от написания сценариев до монтажа и синтеза голоса."
      },
      { 
        title: "The secret to viral short-form videos", 
        titleRu: "Секрет вирусных коротких видео",
        desc: "New research reveals the key elements that make short videos go viral on TikTok, YouTube Shorts, and Instagram Reels.",
        descRu: "Новое исследование раскрывает ключевые элементы вирусных видео на TikTok, YouTube Shorts и Instagram Reels."
      },
      { 
        title: "5 trends shaping social media this year", 
        titleRu: "5 трендов соцсетей этого года",
        desc: "From AI-generated content to interactive live streams, these trends are defining the social media landscape in 2025.",
        descRu: "От контента на ИИ до интерактивных стримов - эти тренды определяют ландшафт соцсетей в 2025."
      },
      { 
        title: "How creators are monetizing their content", 
        titleRu: "Как авторы монетизируют контент",
        desc: "Content creators are finding new revenue streams beyond ads, including subscriptions, merchandise, and brand partnerships.",
        descRu: "Создатели контента находят новые источники дохода: подписки, мерч и партнёрства с брендами."
      },
      { 
        title: "The rise of authentic storytelling online", 
        titleRu: "Рост популярности честного сторителлинга",
        desc: "Audiences are gravitating toward genuine, unpolished content over heavily produced videos, changing creator strategies.",
        descRu: "Аудитория предпочитает честный контент вместо постановочных видео, что меняет стратегии авторов."
      }
    ];

    for (let i = 0; i < demoTopics.length; i++) {
      await storage.createTopic({
        sourceId: "demo",
        title: demoTopics[i].title,
        translatedTitle: demoTopics[i].titleRu,
        translatedTitleEn: demoTopics[i].title,
        rawText: demoTopics[i].desc,
        insights: { summary: demoTopics[i].descRu },
        score: Math.floor(Math.random() * 50) + 50,
        language: "en",
        status: "new",
        extractionStatus: "done"
      });
      await storage.updateJob(job.id, { progress: 10 + Math.floor((i + 1) / demoTopics.length * 80) });
    }
  } else {
    // Fetch real data from sources
    let progress = 10;
    const progressPerSource = 80 / enabledSources.length;

    for (const source of enabledSources) {
      const config = source.config as { url?: string; language?: string; description?: string };
      const language = (config.language || (config.description?.toLowerCase().includes('рус') ? 'ru' : 'en')) as "ru" | "en";
      
      try {
        if (source.type === "rss" && config.url) {
          console.log(`[JobWorker] Fetching RSS from ${config.url}`);
          
          const response = await fetch(config.url, {
            headers: {
              'User-Agent': 'IDENGINE-Bot/1.0',
              'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml'
            }
          });
          
          if (!response.ok) {
            console.error(`[JobWorker] Failed to fetch RSS from ${config.url}: ${response.status}`);
            continue;
          }
          
          const xml = await response.text();
          const items = parseRSSItems(xml);
          
          console.log(`[JobWorker] Found ${items.length} items from ${source.name}`);
          
          for (const item of items) {
            // Use original RSS title and description
            const rawTitle = item.title;
            const rawDescription = item.description.slice(0, 500); // Limit description length
            
            await storage.createTopic({
              sourceId: source.id,
              title: rawTitle,
              rawText: rawDescription || null,
              url: item.link || null,
              score: Math.floor(Math.random() * 30) + 70, // 70-100 score for real content
              language: language,
              status: "new",
              extractionStatus: "pending"
            });
          }
        } else if (source.type === "manual" || source.type === "url") {
          // For manual/URL sources, create topic from config description
          const manualContent = config.description || `Content from ${source.name}`;
          
          await storage.createTopic({
            sourceId: source.id,
            title: source.name,
            rawText: manualContent,
            url: config.url || null,
            score: Math.floor(Math.random() * 30) + 70,
            language: language,
            status: "new",
            extractionStatus: "pending"
          });
        }
      } catch (error) {
        console.error(`[JobWorker] Error fetching from ${source.name}:`, error);
        // Continue with other sources even if one fails
      }
      
      progress += progressPerSource;
      await storage.updateJob(job.id, { progress: Math.floor(progress) });
    }
  }

  await storage.updateJob(job.id, { progress: 100 });
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

export async function startJobWorker(): Promise<void> {
  console.log("[JobWorker] Starting job worker...");
  
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
