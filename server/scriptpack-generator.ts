import { 
  TrendTopic, Language, Platform, Duration, StylePreset, AccentPreset,
  Script, InsertScript, StoryboardScene, TranscriptRich
} from "@shared/schema";
import { 
  buildSeoTitlePrompt, buildHookPrompt, buildTranscriptRichPrompt,
  buildTimelinePrompt, buildFramePromptsPrompt, buildSubtitlesPrompt,
  trendTopicToPromptParams, checkAntiCopy,
  ScriptPack, SeoTitleResult, HookResult, TranscriptRichResult,
  TimelineResult, FramePromptsResult, SubtitlesResult, PromptParams
} from "./prompts";
import { storage } from "./storage";
import { providers } from "./providers";

const MAX_REGEN_ATTEMPTS = 2;

export interface GenerationOptions {
  language: Language;
  platform: Platform;
  durationSec: Duration;
  stylePreset: StylePreset;
  accent: AccentPreset;
  goal?: string;
  audience?: string;
}

async function callLLMWithParsing<T>(
  systemPrompt: string,
  userPrompt: string,
  options: GenerationOptions
): Promise<T | null> {
  try {
    const response = await providers.llm.generateScript(
      `${systemPrompt}\n\n${userPrompt}`,
      "",
      options.stylePreset,
      options.durationSec,
      options.language
    );
    
    const cleaned = response
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    
    return JSON.parse(cleaned) as T;
  } catch (error) {
    console.error("[ScriptPackGenerator] LLM call failed:", error);
    return null;
  }
}

function validateTranscriptAntiCopy(
  transcriptLines: string[],
  seedTitles: string[]
): { passed: boolean; reason?: string } {
  for (const line of transcriptLines) {
    const check = checkAntiCopy(line, seedTitles);
    if (!check.passed) {
      return { passed: false, reason: `Transcript line failed: ${check.reason}` };
    }
  }
  return { passed: true };
}

export async function generateSeoTitles(
  trendTopic: TrendTopic,
  options: GenerationOptions
): Promise<SeoTitleResult | null> {
  const params = trendTopicToPromptParams(trendTopic, options);
  const prompt = buildSeoTitlePrompt(params);
  
  for (let attempt = 0; attempt < MAX_REGEN_ATTEMPTS; attempt++) {
    const result = await callLLMWithParsing<SeoTitleResult>(
      "You are a YouTube SEO expert. Return valid JSON only.",
      prompt,
      options
    );
    
    if (!result) continue;
    
    const bestTitle = result.titles[result.best_pick_index]?.text || result.titles[0]?.text;
    if (bestTitle) {
      const check = checkAntiCopy(bestTitle, trendTopic.seedTitles);
      if (check.passed) {
        return result;
      }
      console.log(`[ScriptPackGenerator] SEO title anti-copy failed, attempt ${attempt + 1}: ${check.reason}`);
    }
  }
  
  return null;
}

export async function generateHooks(
  trendTopic: TrendTopic,
  options: GenerationOptions
): Promise<HookResult | null> {
  const params = trendTopicToPromptParams(trendTopic, options);
  const prompt = buildHookPrompt(params);
  
  for (let attempt = 0; attempt < MAX_REGEN_ATTEMPTS; attempt++) {
    const result = await callLLMWithParsing<HookResult>(
      "You are a viral video hook writer. Return valid JSON only.",
      prompt,
      options
    );
    
    if (!result) continue;
    
    const bestHook = result.hooks[result.best_pick_index]?.text || result.hooks[0]?.text;
    if (bestHook) {
      const check = checkAntiCopy(bestHook, trendTopic.seedTitles);
      if (check.passed) {
        return result;
      }
      console.log(`[ScriptPackGenerator] Hook anti-copy failed, attempt ${attempt + 1}: ${check.reason}`);
    }
  }
  
  return null;
}

export async function generateTranscriptRich(
  trendTopic: TrendTopic,
  options: GenerationOptions
): Promise<TranscriptRichResult | null> {
  const params = trendTopicToPromptParams(trendTopic, options);
  const prompt = buildTranscriptRichPrompt(params);
  
  for (let attempt = 0; attempt < MAX_REGEN_ATTEMPTS; attempt++) {
    const result = await callLLMWithParsing<TranscriptRichResult>(
      "You are a vertical video scriptwriter. Return valid JSON only.",
      prompt,
      options
    );
    
    if (!result) continue;
    
    const check = validateTranscriptAntiCopy(
      result.speaker_lines,
      trendTopic.seedTitles
    );
    
    if (check.passed) {
      return result;
    }
    console.log(`[ScriptPackGenerator] Transcript anti-copy failed, attempt ${attempt + 1}: ${check.reason}`);
  }
  
  return null;
}

export async function generateTimeline(
  speakerLines: string[],
  trendTopic: TrendTopic,
  options: GenerationOptions
): Promise<TimelineResult | null> {
  const params: PromptParams & { speakerLines: string[] } = {
    language: options.language,
    platform: options.platform,
    durationSec: options.durationSec,
    seedTitles: trendTopic.seedTitles,
    contextSnippets: trendTopic.contextSnippets,
    speakerLines,
  };
  
  const prompt = buildTimelinePrompt(params);
  
  return callLLMWithParsing<TimelineResult>(
    "You are a video editor. Return valid JSON only.",
    prompt,
    options
  );
}

export async function generateFramePrompts(
  scenes: any[],
  trendTopic: TrendTopic,
  options: GenerationOptions,
  frameStyle: string = "cinematic"
): Promise<FramePromptsResult | null> {
  const sceneDescriptions = scenes.map((s: any) => 
    `Scene ${s.id}: ${s.visualDescription} - "${s.voText}"`
  ).join("\n");
  
  const prompt = `
${buildFramePromptsPrompt({ 
  language: options.language, 
  platform: options.platform, 
  durationSec: options.durationSec,
  seedTitles: trendTopic.seedTitles,
  contextSnippets: trendTopic.contextSnippets,
  frameStyle
})}

Scenes:
${sceneDescriptions}
`;
  
  return callLLMWithParsing<FramePromptsResult>(
    "You are an AI image prompt engineer. Return valid JSON only.",
    prompt,
    options
  );
}

export async function generateSubtitles(
  scenes: any[],
  options: GenerationOptions
): Promise<SubtitlesResult | null> {
  const sceneData = scenes.map((s: any) => 
    `${s.start} -> ${s.end}: ${s.voText}`
  ).join("\n");
  
  const prompt = `
${buildSubtitlesPrompt()}

Scenes:
${sceneData}
`;
  
  return callLLMWithParsing<SubtitlesResult>(
    "You are a subtitle editor. Return valid JSON only.",
    prompt,
    options
  );
}

export function extractHashtags(
  seoResult: SeoTitleResult,
  trendTopic: TrendTopic
): string[] {
  const hashtags = new Set<string>();
  
  for (const keyword of trendTopic.keywords.slice(0, 5)) {
    hashtags.add(`#${keyword.replace(/\s+/g, "")}`);
  }
  
  for (const title of seoResult.titles) {
    for (const kw of title.keywords_used || []) {
      hashtags.add(`#${kw.replace(/\s+/g, "")}`);
    }
  }
  
  return Array.from(hashtags).slice(0, 10);
}

export async function generateScriptPack(
  trendTopic: TrendTopic,
  options: GenerationOptions
): Promise<ScriptPack | null> {
  console.log(`[ScriptPackGenerator] Generating ScriptPack for: ${trendTopic.clusterLabel}`);
  console.log(`[ScriptPackGenerator] Options: ${JSON.stringify({ language: options.language, platform: options.platform, style: options.stylePreset })}`);
  
  const seoTitles = await generateSeoTitles(trendTopic, options);
  if (!seoTitles) {
    console.error("[ScriptPackGenerator] Failed to generate SEO titles after anti-copy validation");
    return null;
  }
  
  const hooks = await generateHooks(trendTopic, options);
  if (!hooks) {
    console.error("[ScriptPackGenerator] Failed to generate hooks after anti-copy validation");
    return null;
  }
  
  const transcriptRich = await generateTranscriptRich(trendTopic, options);
  if (!transcriptRich) {
    console.error("[ScriptPackGenerator] Failed to generate transcript after anti-copy validation");
    return null;
  }
  
  const timeline = await generateTimeline(transcriptRich.speaker_lines, trendTopic, options);
  if (!timeline) {
    console.error("[ScriptPackGenerator] Failed to generate timeline");
    return null;
  }
  
  const framePrompts = await generateFramePrompts(timeline.scenes, trendTopic, options);
  
  const subtitles = await generateSubtitles(timeline.scenes, options);
  
  const hashtags = extractHashtags(seoTitles, trendTopic);
  
  console.log(`[ScriptPackGenerator] Successfully generated ScriptPack with ${seoTitles.titles.length} SEO titles, ${hooks.hooks.length} hooks, ${timeline.scenes.length} scenes`);
  
  return {
    seoTitles,
    hashtags,
    hooks,
    transcriptRich,
    timeline,
    framePrompts: framePrompts || { frames: [] },
    subtitles: subtitles || { srt: "", vtt: "", csv: "", tsv: "" },
  };
}

export function scriptPackToScript(
  scriptPack: ScriptPack,
  trendTopic: TrendTopic,
  topicId: string,
  options: GenerationOptions
): InsertScript {
  const bestSeoTitle = scriptPack.seoTitles.titles[scriptPack.seoTitles.best_pick_index]?.text 
    || scriptPack.seoTitles.titles[0]?.text;
  
  const bestHook = scriptPack.hooks.hooks[scriptPack.hooks.best_pick_index]?.text
    || scriptPack.hooks.hooks[0]?.text;
  
  const transcriptRich: TranscriptRich = {
    segments: [
      ...scriptPack.transcriptRich.speaker_lines.map(text => ({ type: "speaker" as const, text })),
      ...scriptPack.transcriptRich.cutaways.map(text => ({ type: "cutaway" as const, text })),
      ...scriptPack.transcriptRich.onscreen_lines.map(text => ({ type: "onscreen" as const, text })),
    ],
    totalWords: scriptPack.transcriptRich.speaker_lines.join(" ").split(/\s+/).length,
    estimatedDuration: parseInt(options.durationSec),
  };
  
  const storyboard: StoryboardScene[] = scriptPack.timeline.scenes.map((scene, index) => {
    const framePrompt = scriptPack.framePrompts.frames.find(f => f.sceneId === scene.id);
    
    return {
      sceneId: index + 1,
      sceneNumber: index + 1,
      startTime: parseTimeToSeconds(scene.start),
      endTime: parseTimeToSeconds(scene.end),
      voText: scene.voText,
      onScreenText: scene.onScreenText.join(" | "),
      visual: scene.visualDescription,
      shotType: scene.shot.type as any,
      motion: scene.shot.motion as any,
      brollKeywords: scene.brollKeywords,
      sfxMusicHint: scene.sfxMusicHint,
      aiPrompt: framePrompt?.prompt,
    };
  });
  
  return {
    topicId,
    language: options.language,
    durationSec: options.durationSec,
    stylePreset: options.stylePreset,
    voiceStylePreset: options.stylePreset,
    accent: options.accent,
    platform: options.platform,
    keywords: trendTopic.keywords,
    seo: {
      seoTitleOptions: scriptPack.seoTitles.titles.map(t => t.text),
      seoTitle: bestSeoTitle,
      hashtags: scriptPack.hashtags,
    },
    hook: bestHook,
    voiceText: scriptPack.transcriptRich.speaker_lines.join("\n"),
    onScreenText: scriptPack.transcriptRich.onscreen_lines.join("\n"),
    transcriptRich,
    storyboard,
    status: "draft",
  };
}

function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length === 2) {
    const [mins, secs] = parts;
    return parseFloat(mins) * 60 + parseFloat(secs);
  } else if (parts.length === 3) {
    const [hours, mins, secs] = parts;
    return parseFloat(hours) * 3600 + parseFloat(mins) * 60 + parseFloat(secs);
  }
  return parseFloat(timeStr) || 0;
}
