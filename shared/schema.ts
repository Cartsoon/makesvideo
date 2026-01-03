import { z } from "zod";
import { pgTable, text, integer, boolean, timestamp, jsonb, serial, varchar, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ============ DRIZZLE TABLES ============

// Settings table
export const settings = pgTable("settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(),
});

// Users table
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  personalNumber: serial("personal_number"),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  nickname: varchar("nickname", { length: 100 }),
  avatarId: integer("avatar_id").default(0).notNull(),
  language: varchar("language", { length: 10 }).default("ru").notNull(),
  theme: varchar("theme", { length: 10 }).default("dark").notNull(),
  subscriptionExpiresAt: timestamp("subscription_expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sessions table
export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Auth passwords table
export const authPasswords = pgTable("auth_passwords", {
  password: varchar("password", { length: 100 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
});

// Sources table
export const sources = pgTable("sources", {
  id: varchar("id", { length: 36 }).primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: varchar("category_id", { length: 50 }),
  config: jsonb("config").default({}).notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  priority: integer("priority").default(3).notNull(),
  health: jsonb("health").default({}).notNull(),
  lastCheckAt: timestamp("last_check_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Topics table
export const topics = pgTable("topics", {
  id: varchar("id", { length: 36 }).primaryKey(),
  sourceId: varchar("source_id", { length: 36 }).references(() => sources.id).notNull(),
  title: text("title").notNull(),
  generatedTitle: text("generated_title"),
  translatedTitle: text("translated_title"),
  translatedTitleEn: text("translated_title_en"),
  url: text("url"),
  rawText: text("raw_text"),
  fullContent: text("full_content"),
  insights: jsonb("insights"),
  tags: text("tags").array().default([]),
  extractionStatus: varchar("extraction_status", { length: 20 }).default("pending").notNull(),
  language: varchar("language", { length: 10 }).default("ru").notNull(),
  score: integer("score").default(0).notNull(),
  status: varchar("status", { length: 20 }).default("new").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Scripts table
export const scripts = pgTable("scripts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  topicId: varchar("topic_id", { length: 36 }).references(() => topics.id).notNull(),
  scriptNumber: serial("script_number"),
  displayName: varchar("display_name", { length: 255 }),
  language: varchar("language", { length: 10 }).default("ru").notNull(),
  durationSec: varchar("duration_sec", { length: 10 }).default("30").notNull(),
  stylePreset: varchar("style_preset", { length: 50 }).default("classic").notNull(),
  voiceStylePreset: varchar("voice_style_preset", { length: 50 }).default("classic").notNull(),
  accent: varchar("accent", { length: 50 }).default("classic").notNull(),
  platform: varchar("platform", { length: 50 }).default("youtube_shorts").notNull(),
  keywords: jsonb("keywords").default([]).notNull(),
  constraints: jsonb("constraints"),
  seo: jsonb("seo"),
  hook: text("hook"),
  voiceText: text("voice_text"),
  onScreenText: text("on_screen_text"),
  transcriptRich: jsonb("transcript_rich"),
  storyboard: jsonb("storyboard"),
  music: jsonb("music"),
  assets: jsonb("assets"),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Jobs table
export const jobs = pgTable("jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  kind: varchar("kind", { length: 50 }).notNull(),
  payload: jsonb("payload").default({}).notNull(),
  status: varchar("status", { length: 20 }).default("queued").notNull(),
  progress: integer("progress").default(0).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Trend signals table
export const trendSignals = pgTable("trend_signals", {
  id: varchar("id", { length: 36 }).primaryKey(),
  platform: varchar("platform", { length: 50 }).notNull(),
  categoryId: varchar("category_id", { length: 50 }),
  topicClusterId: varchar("topic_cluster_id", { length: 36 }),
  keywords: jsonb("keywords").default([]).notNull(),
  angles: jsonb("angles").default([]).notNull(),
  hookPatterns: jsonb("hook_patterns").default([]).notNull(),
  pacingHints: varchar("pacing_hints", { length: 20 }),
  durationModes: jsonb("duration_modes").default([]),
  exampleRefs: jsonb("example_refs").default([]),
  score: integer("score").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Trend topics table
export const trendTopics = pgTable("trend_topics", {
  id: varchar("id", { length: 36 }).primaryKey(),
  categoryId: varchar("category_id", { length: 50 }),
  clusterLabel: varchar("cluster_label", { length: 255 }),
  seedTitles: jsonb("seed_titles").default([]).notNull(),
  contextSnippets: jsonb("context_snippets").default([]).notNull(),
  entities: jsonb("entities").default([]),
  keywords: jsonb("keywords").default([]).notNull(),
  angles: jsonb("angles").default([]).notNull(),
  hookPatterns: jsonb("hook_patterns").default([]),
  pacingHints: varchar("pacing_hints", { length: 20 }),
  refs: jsonb("refs").default([]),
  trendSignalIds: jsonb("trend_signal_ids").default([]),
  score: integer("score").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Form state table for persisting form data across navigation
export const formStates = pgTable("form_states", {
  id: varchar("id", { length: 100 }).primaryKey(), // e.g., "userId:pageName" or just "pageName" for anonymous
  userId: varchar("user_id", { length: 36 }),
  pageName: varchar("page_name", { length: 100 }).notNull(),
  state: jsonb("state").default({}).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============ RELATIONS ============

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const sourcesRelations = relations(sources, ({ many }) => ({
  topics: many(topics),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  source: one(sources, {
    fields: [topics.sourceId],
    references: [sources.id],
  }),
  scripts: many(scripts),
}));

export const scriptsRelations = relations(scripts, ({ one }) => ({
  topic: one(topics, {
    fields: [scripts.topicId],
    references: [topics.id],
  }),
}));

// ============ ZOD ENUMS ============

export const SourceType = z.enum([
  "rss",
  "telegram", 
  "url",
  "manual",
  "api",
  "html",
  "reddit_rss",
  "youtube_api",
  "youtube_channel",
  "youtube_channel_rss",
  "youtube_search",
  "youtube_trending",
  "x_user",
  "telegram_channel"
]);
export type SourceType = z.infer<typeof SourceType>;

export const SourceHealthStatus = z.enum(["ok", "warning", "dead", "pending"]);
export type SourceHealthStatus = z.infer<typeof SourceHealthStatus>;

export const TopicStatus = z.enum(["new", "selected", "ignored"]);
export type TopicStatus = z.infer<typeof TopicStatus>;

export const ScriptStatus = z.enum(["draft", "in_progress", "done", "generating", "error"]);
export type ScriptStatus = z.infer<typeof ScriptStatus>;

export const scriptStatusLabels: Record<ScriptStatus, { ru: string; en: string }> = {
  draft: { ru: "Черновик", en: "Draft" },
  in_progress: { ru: "В работе", en: "In Progress" },
  done: { ru: "Готово", en: "Done" },
  generating: { ru: "Генерация", en: "Generating" },
  error: { ru: "Ошибка", en: "Error" },
};

export const JobStatus = z.enum(["queued", "running", "done", "error"]);
export type JobStatus = z.infer<typeof JobStatus>;

export const JobKind = z.enum([
  "fetch_topics",
  "extract_content",
  "translate_topic",
  "generate_hook",
  "generate_script",
  "generate_storyboard",
  "generate_voice",
  "pick_music",
  "export_package",
  "generate_all",
  "health_check",
  "health_check_all",
  "auto_discovery",
  "extract_trends"
]);
export type JobKind = z.infer<typeof JobKind>;

export const StylePreset = z.enum([
  "news",           
  "crime",          
  "detective",      
  "storytelling",   
  "comedy",         
  "classic",        
  "tarantino",      
  "anime",          
  "brainrot",       
  "adult",          
  "howto",          
  "mythbusting",    
  "top5",           
  "hottakes",       
  "pov",            
  "cinematic",      
  "science",        
  "motivation",     
  "versus",         
  "mistake"         
]);
export type StylePreset = z.infer<typeof StylePreset>;

export const Platform = z.enum(["youtube_shorts", "tiktok", "reels", "vk_clips"]);
export type Platform = z.infer<typeof Platform>;

export const Duration = z.enum(["30", "45", "60", "120"]);
export type Duration = z.infer<typeof Duration>;

export const AccentPreset = z.enum([
  "classic",
  "news",
  "military",
  "blogger",
  "meme",
  "dramatic",
  "ironic",
  "streamer"
]);
export type AccentPreset = z.infer<typeof AccentPreset>;

export const accentLabels: Record<AccentPreset, { ru: string; en: string; desc: string }> = {
  classic: { ru: "Классический", en: "Classic", desc: "Нейтрально, четко" },
  news: { ru: "Официальный", en: "News", desc: "Сухо, формально" },
  military: { ru: "Военный", en: "Military", desc: "Кратко, приказно" },
  blogger: { ru: "Блогер", en: "Blogger", desc: "Просто, как другу" },
  meme: { ru: "Мемный", en: "Meme", desc: "Легкие мемные обороты" },
  dramatic: { ru: "Драматический", en: "Dramatic", desc: "Паузы, напряжение" },
  ironic: { ru: "Ироничный", en: "Ironic", desc: "Сарказм, комментарии" },
  streamer: { ru: "Стример", en: "Streamer", desc: "Живо, с реакциями" }
};

export const Language = z.enum(["ru", "en"]);
export type Language = z.infer<typeof Language>;

// ============ SOURCE SCHEMAS ============

export const sourceHealthSchema = z.object({
  status: SourceHealthStatus.default("pending"),
  httpCode: z.number().nullable().optional(),
  avgLatencyMs: z.number().nullable().optional(),
  lastSuccessAt: z.string().nullable().optional(),
  failuresCount: z.number().default(0),
  freshnessHours: z.number().nullable().optional(),
  lastError: z.string().nullable().optional(),
  itemCount: z.number().nullable().optional(),
});

export type SourceHealth = z.infer<typeof sourceHealthSchema>;

export const sourceParseRulesSchema = z.object({
  titleSelector: z.string().optional(),
  linkSelector: z.string().optional(),
  dateSelector: z.string().optional(),
  contentSelector: z.string().optional(),
});

export type SourceParseRules = z.infer<typeof sourceParseRulesSchema>;

export const sourceConfigSchema = z.object({
  url: z.string().optional(),
  description: z.string().optional(),
  language: z.enum(["ru", "en"]).optional(),
  country: z.string().optional(),
  parseRules: sourceParseRulesSchema.optional(),
  apiKey: z.string().optional(),
  channelId: z.string().optional(),
  searchQuery: z.string().optional(),
});

export type SourceConfig = z.infer<typeof sourceConfigSchema>;

export type CategoryId = 
  | "world_news"
  | "russia_news"
  | "gaming"
  | "memes"
  | "trends"
  | "fashion"
  | "music"
  | "interesting"
  | "facts_research"
  | "movies"
  | "series"
  | "medicine"
  | "youtube_trends";

export interface Source {
  id: string;
  type: SourceType;
  name: string;
  categoryId: CategoryId | null;
  config: SourceConfig;
  isEnabled: boolean;
  priority: number;
  health: SourceHealth;
  lastCheckAt: string | null;
  notes: string | null;
  createdAt: string;
}

export const insertSourceSchema = z.object({
  type: SourceType,
  name: z.string().min(1, "Name is required"),
  categoryId: z.string().nullable().optional(),
  config: sourceConfigSchema,
  isEnabled: z.boolean().default(true),
  priority: z.number().min(1).max(5).default(3),
  health: sourceHealthSchema.optional(),
  notes: z.string().nullable().optional(),
});

export type InsertSource = z.infer<typeof insertSourceSchema>;

// ============ TREND SIGNAL ============

export const TrendPlatform = z.enum(["youtube_shorts", "youtube", "tiktok", "general"]);
export type TrendPlatform = z.infer<typeof TrendPlatform>;

export const trendSignalSchema = z.object({
  id: z.string(),
  platform: TrendPlatform,
  categoryId: z.string().nullable().optional(),
  topicClusterId: z.string().nullable().optional(),
  keywords: z.array(z.string()),
  angles: z.array(z.string()),
  hookPatterns: z.array(z.string()),
  pacingHints: z.enum(["fast", "medium", "slow"]).nullable().optional(),
  durationModes: z.array(z.string()).optional(),
  exampleRefs: z.array(z.string()).optional(),
  score: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TrendSignal = z.infer<typeof trendSignalSchema>;

export const insertTrendSignalSchema = trendSignalSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrendSignal = z.infer<typeof insertTrendSignalSchema>;

// ============ TREND TOPIC ============

export const trendTopicSchema = z.object({
  id: z.string(),
  categoryId: z.string().nullable().optional(),
  clusterLabel: z.string().optional(),
  seedTitles: z.array(z.string()),
  contextSnippets: z.array(z.string()),
  entities: z.array(z.string()).optional(),
  keywords: z.array(z.string()),
  angles: z.array(z.string()),
  hookPatterns: z.array(z.string()).optional(),
  pacingHints: z.enum(["fast", "medium", "slow"]).optional(),
  refs: z.array(z.string()).optional(),
  trendSignalIds: z.array(z.string()).optional(),
  score: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TrendTopic = z.infer<typeof trendTopicSchema>;

export const insertTrendTopicSchema = trendTopicSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrendTopic = z.infer<typeof insertTrendTopicSchema>;

// ============ TOPIC ============

export const ExtractionStatus = z.enum(["pending", "extracting", "done", "failed"]);
export type ExtractionStatus = z.infer<typeof ExtractionStatus>;

export const topicInsightsSchema = z.object({
  keyFacts: z.array(z.string()).optional(),
  trendingAngles: z.array(z.string()).optional(),
  emotionalHooks: z.array(z.string()).optional(),
  targetAudience: z.string().optional(),
  viralPotential: z.number().optional(),
  summary: z.string().optional(),
});

export type TopicInsights = z.infer<typeof topicInsightsSchema>;

export interface Topic {
  id: string;
  sourceId: string;
  title: string;
  generatedTitle: string | null;
  translatedTitle: string | null;
  translatedTitleEn: string | null;
  url: string | null;
  rawText: string | null;
  fullContent: string | null;
  insights: TopicInsights | null;
  tags: string[];
  extractionStatus: ExtractionStatus;
  language: Language;
  score: number;
  status: TopicStatus;
  createdAt: string;
}

export const insertTopicSchema = z.object({
  sourceId: z.string(),
  title: z.string().min(1, "Title is required"),
  generatedTitle: z.string().nullable().optional(),
  translatedTitle: z.string().nullable().optional(),
  translatedTitleEn: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  rawText: z.string().nullable().optional(),
  fullContent: z.string().nullable().optional(),
  insights: topicInsightsSchema.nullable().optional(),
  tags: z.array(z.string()).default([]),
  extractionStatus: ExtractionStatus.default("pending"),
  language: Language.default("ru"),
  score: z.number().default(0),
  status: TopicStatus.default("new"),
});

export type InsertTopic = z.infer<typeof insertTopicSchema>;

// ============ STORYBOARD SCENE ============

export const storyboardSceneSchema = z.object({
  sceneId: z.number(),
  sceneNumber: z.number(),
  startTime: z.number(),
  endTime: z.number(),
  voText: z.string(),
  onScreenText: z.string(),
  visual: z.string(),
  shotType: z.enum(["CU", "MS", "WS", "ECU", "OTS"]).optional(),
  motion: z.enum(["static", "pan", "zoom", "shake", "dolly"]).optional(),
  brollKeywords: z.array(z.string()).optional(),
  previewImageUrl: z.string().nullable().optional(),
  sfxMusicHint: z.string().optional(),
  sfx: z.string().optional(),
  durationHint: z.string().optional(),
  stockKeywords: z.array(z.string()).optional(),
  aiPrompt: z.string().optional(),
});

export type StoryboardScene = z.infer<typeof storyboardSceneSchema>;

// ============ SCRIPT CONSTRAINTS ============

export const scriptConstraintsSchema = z.object({
  targetWpm: z.number(),
  maxWordsVO: z.number(),
  hookMaxWords: z.tuple([z.number(), z.number()]),
  sceneCountRange: z.tuple([z.number(), z.number()]),
  onScreenTextMaxCharsPerScene: z.number(),
});

export type ScriptConstraints = z.infer<typeof scriptConstraintsSchema>;

// ============ SEO OUTPUTS ============

export const seoOutputsSchema = z.object({
  seoTitleOptions: z.array(z.string()).optional(),
  seoTitle: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
});

export type SeoOutputs = z.infer<typeof seoOutputsSchema>;

// ============ TRANSCRIPT RICH ============

export const transcriptSegmentSchema = z.object({
  type: z.enum(["speaker", "cutaway", "onscreen", "pause"]),
  text: z.string(),
  duration: z.number().optional(),
});

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const transcriptRichSchema = z.object({
  segments: z.array(transcriptSegmentSchema),
  totalWords: z.number().optional(),
  estimatedDuration: z.number().optional(),
});

export type TranscriptRich = z.infer<typeof transcriptRichSchema>;

// ============ MUSIC CONFIG ============

export const musicConfigSchema = z.object({
  mood: z.string(),
  bpm: z.number(),
  genre: z.string(),
  references: z.array(z.string()),
  licenseNote: z.string(),
  freeTrackSuggestions: z.array(z.object({
    name: z.string(),
    artist: z.string(),
    source: z.string(),
    url: z.string().optional(),
  })).optional(),
});

export type MusicConfig = z.infer<typeof musicConfigSchema>;

// ============ ASSETS ============

export const assetsSchema = z.object({
  voiceFile: z.string().nullable().optional(),
  exportZip: z.string().nullable().optional(),
});

export type Assets = z.infer<typeof assetsSchema>;

// ============ SCRIPT ============

export interface Script {
  id: string;
  topicId: string;
  scriptNumber: number;
  displayName: string | null;
  language: Language;
  durationSec: Duration;
  stylePreset: StylePreset;
  voiceStylePreset: StylePreset;
  accent: AccentPreset;
  platform: Platform;
  keywords: string[];
  constraints: ScriptConstraints | null;
  seo: SeoOutputs | null;
  hook: string | null;
  voiceText: string | null;
  onScreenText: string | null;
  transcriptRich: TranscriptRich | null;
  storyboard: StoryboardScene[] | null;
  music: MusicConfig | null;
  assets: Assets | null;
  status: ScriptStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const insertScriptSchema = z.object({
  topicId: z.string(),
  scriptNumber: z.number().optional(),
  displayName: z.string().nullable().optional(),
  language: Language.default("ru"),
  durationSec: Duration.default("30"),
  stylePreset: StylePreset.default("classic"),
  voiceStylePreset: StylePreset.default("classic"),
  accent: AccentPreset.default("classic"),
  platform: Platform.default("youtube_shorts"),
  keywords: z.array(z.string()).default([]),
  constraints: scriptConstraintsSchema.nullable().optional(),
  seo: seoOutputsSchema.nullable().optional(),
  hook: z.string().nullable().optional(),
  voiceText: z.string().nullable().optional(),
  onScreenText: z.string().nullable().optional(),
  transcriptRich: transcriptRichSchema.nullable().optional(),
  storyboard: z.array(storyboardSceneSchema).nullable().optional(),
  music: musicConfigSchema.nullable().optional(),
  assets: assetsSchema.nullable().optional(),
  status: ScriptStatus.default("draft"),
  error: z.string().nullable().optional(),
});

export type InsertScript = z.input<typeof insertScriptSchema>;

export const updateScriptSchema = insertScriptSchema.partial();
export type UpdateScript = z.infer<typeof updateScriptSchema>;

// ============ JOB ============

export interface Job {
  id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  status: JobStatus;
  progress: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export const insertJobSchema = z.object({
  kind: JobKind,
  payload: z.record(z.unknown()).default({}),
  status: JobStatus.default("queued"),
  progress: z.number().default(0),
  error: z.string().nullable().optional(),
});

export type InsertJob = z.input<typeof insertJobSchema>;

// ============ SETTINGS ============

export interface Setting {
  key: string;
  value: string;
}

export const insertSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export type InsertSetting = z.infer<typeof insertSettingSchema>;

// ============ FORM STATE ============

export interface FormState {
  id: string;
  userId: string | null;
  pageName: string;
  state: Record<string, unknown>;
  updatedAt: string;
}

export const insertFormStateSchema = z.object({
  pageName: z.string(),
  state: z.record(z.unknown()).default({}),
});

export type InsertFormState = z.infer<typeof insertFormStateSchema>;

// ============ STYLE LIBRARY ============

export interface ScriptStyleConfig {
  id: StylePreset;
  nameRu: string;
  nameEn: string;
  descRu: string;
  descEn: string;
  tempo: "low" | "medium" | "high";
  hookType: "question" | "promise" | "shock" | "conflict" | "mystery";
  ctaType: "subscribe" | "comment" | "save" | "share" | "question";
  structureHint: string;
}

export const scriptStyleLibrary: ScriptStyleConfig[] = [
  { id: "news", nameRu: "Новостной", nameEn: "Breaking News", descRu: "Факт → контекст → последствия", descEn: "Fact → context → consequences", tempo: "high", hookType: "shock", ctaType: "comment", structureHint: "hook(1) + facts(3) + conclusion(1)" },
  { id: "crime", nameRu: "Криминал", nameEn: "True Crime", descRu: "Загадка → версия → поворот → морал", descEn: "Mystery → theory → twist → moral", tempo: "medium", hookType: "mystery", ctaType: "subscribe", structureHint: "clue + suspects + twist + resolution" },
  { id: "detective", nameRu: "Детектив", nameEn: "Detective", descRu: "Улика → подозреваемые → поворот → развязка", descEn: "Clue → suspects → twist → reveal", tempo: "medium", hookType: "mystery", ctaType: "comment", structureHint: "short phrases, pauses, intrigue" },
  { id: "storytelling", nameRu: "Сторителлинг", nameEn: "Storytelling", descRu: "Я думал... потом случилось... вот что понял", descEn: "I thought... then happened... here's what I learned", tempo: "medium", hookType: "conflict", ctaType: "save", structureHint: "emotional markers, personal arc" },
  { id: "comedy", nameRu: "Комедия", nameEn: "Comedy", descRu: "Сетап → панч → эскалация → финал", descEn: "Setup → punch → escalation → punchline", tempo: "high", hookType: "conflict", ctaType: "share", structureHint: "contrasts, everyday examples" },
  { id: "classic", nameRu: "Классический", nameEn: "Classic", descRu: "Хук → 3 пункта → итог → CTA", descEn: "Hook → 3 points → summary → CTA", tempo: "medium", hookType: "promise", ctaType: "subscribe", structureHint: "universal, balanced structure" },
  { id: "tarantino", nameRu: "Тарантино", nameEn: "Tarantino", descRu: "Диалоговость, сарказм, резкие переходы", descEn: "Dialogue-driven, sarcasm, sharp cuts", tempo: "high", hookType: "conflict", ctaType: "comment", structureHint: "scene-based, unexpected cuts" },
  { id: "anime", nameRu: "Манга/Аниме", nameEn: "Manga/Anime", descRu: "Внутренний монолог, драма, гиперболы", descEn: "Inner monologue, drama, hyperbole", tempo: "medium", hookType: "conflict", ctaType: "save", structureHint: "panels: scene 1/2/3, dramatic stakes" },
  { id: "brainrot", nameRu: "Брейнрот", nameEn: "Brainrot", descRu: "Хаос, fast-cut, простые слова", descEn: "Chaos, fast-cut, simple words", tempo: "high", hookType: "shock", ctaType: "share", structureHint: "rapid thoughts, short lines" },
  { id: "adult", nameRu: "18+ с изюминкой", nameEn: "Spicy 18+", descRu: "Флирт и пикантность на уровне намеков", descEn: "Flirty hints, tasteful spice", tempo: "medium", hookType: "mystery", ctaType: "comment", structureHint: "hints only, no explicit content" },
  { id: "howto", nameRu: "How-to", nameEn: "How-to", descRu: "Проблема → шаги → результат за 60 сек", descEn: "Problem → steps → result in 60s", tempo: "high", hookType: "promise", ctaType: "save", structureHint: "numbered steps, clear outcome" },
  { id: "mythbusting", nameRu: "Мифы и факты", nameEn: "Mythbusting", descRu: "Миф → разоблачение → правда", descEn: "Myth → debunk → truth", tempo: "medium", hookType: "question", ctaType: "comment", structureHint: "contrast myth vs reality" },
  { id: "top5", nameRu: "Топ-5", nameEn: "Top 5", descRu: "Рейтинг от 5 до 1 с интригой", descEn: "Ranking 5 to 1 with suspense", tempo: "high", hookType: "promise", ctaType: "subscribe", structureHint: "countdown, save best for last" },
  { id: "hottakes", nameRu: "Hot Takes", nameEn: "Hot Takes", descRu: "Провокационное мнение + аргументы", descEn: "Provocative opinion + arguments", tempo: "high", hookType: "conflict", ctaType: "comment", structureHint: "bold statement, defend it" },
  { id: "pov", nameRu: "POV/Ситуация", nameEn: "POV", descRu: "Погружение от первого лица", descEn: "First-person immersion", tempo: "medium", hookType: "conflict", ctaType: "share", structureHint: "you are... scenario unfolds" },
  { id: "cinematic", nameRu: "Кинематографичный", nameEn: "Cinematic", descRu: "Визуальный сторителлинг под монтаж", descEn: "Visual storytelling for editing", tempo: "low", hookType: "mystery", ctaType: "save", structureHint: "slow burns, dramatic visuals" },
  { id: "science", nameRu: "Научпоп", nameEn: "Science Pop", descRu: "Сложное простым языком", descEn: "Complex made simple", tempo: "medium", hookType: "question", ctaType: "subscribe", structureHint: "analogy, visualization, aha moment" },
  { id: "motivation", nameRu: "Мотивационный", nameEn: "Motivation", descRu: "Вдохновение без инфоцыганства", descEn: "Inspiration without BS", tempo: "medium", hookType: "promise", ctaType: "save", structureHint: "struggle → breakthrough → lesson" },
  { id: "versus", nameRu: "Сравнение/VS", nameEn: "Versus", descRu: "A vs B: честный разбор", descEn: "A vs B: honest comparison", tempo: "high", hookType: "question", ctaType: "comment", structureHint: "criteria, pros/cons, verdict" },
  { id: "mistake", nameRu: "История ошибки", nameEn: "Mistake Story", descRu: "Ошибка → последствия → урок", descEn: "Mistake → consequences → lesson", tempo: "medium", hookType: "conflict", ctaType: "save", structureHint: "confession, vulnerability, takeaway" }
];

export const stylePresetLabels: Record<StylePreset, string> = {
  news: "Breaking News",
  crime: "True Crime",
  detective: "Detective",
  storytelling: "Storytelling",
  comedy: "Comedy",
  classic: "Classic",
  tarantino: "Tarantino",
  anime: "Manga/Anime",
  brainrot: "Brainrot",
  adult: "18+ Spicy",
  howto: "How-to",
  mythbusting: "Mythbusting",
  top5: "Top 5",
  hottakes: "Hot Takes",
  pov: "POV",
  cinematic: "Cinematic",
  science: "Science Pop",
  motivation: "Motivation",
  versus: "Versus",
  mistake: "Mistake Story"
};

export const platformLabels: Record<Platform, string> = {
  youtube_shorts: "YouTube Shorts",
  tiktok: "TikTok",
  reels: "Instagram Reels",
  vk_clips: "VK Clips"
};

export const sourceTypeLabels: Record<SourceType, string> = {
  rss: "RSS Feed",
  telegram: "Telegram",
  url: "URL",
  manual: "Manual",
  api: "API",
  html: "HTML Parser",
  reddit_rss: "Reddit RSS",
  youtube_api: "YouTube API",
  youtube_channel: "YouTube Channel",
  youtube_channel_rss: "YouTube Channel RSS",
  youtube_search: "YouTube Search",
  youtube_trending: "YouTube Trending",
  x_user: "X (Twitter) User",
  telegram_channel: "Telegram Channel",
};

export const sourceHealthLabels: Record<SourceHealthStatus, { ru: string; en: string }> = {
  ok: { ru: "Работает", en: "Healthy" },
  warning: { ru: "Предупреждение", en: "Warning" },
  dead: { ru: "Не работает", en: "Dead" },
  pending: { ru: "Не проверен", en: "Pending" },
};

export const categoryLabels: Record<CategoryId, { ru: string; en: string }> = {
  world_news: { ru: "Мировые новости", en: "World News" },
  russia_news: { ru: "Новости России", en: "Russia News" },
  gaming: { ru: "Игры", en: "Gaming" },
  memes: { ru: "Мемы", en: "Memes" },
  trends: { ru: "Тренды", en: "Trends" },
  fashion: { ru: "Мода", en: "Fashion" },
  music: { ru: "Музыка", en: "Music" },
  interesting: { ru: "Интересное", en: "Interesting" },
  facts_research: { ru: "Факты и исследования", en: "Facts & Research" },
  movies: { ru: "Кино", en: "Movies" },
  series: { ru: "Сериалы", en: "Series" },
  medicine: { ru: "Медицина", en: "Medicine" },
  youtube_trends: { ru: "YouTube тренды", en: "YouTube Trends" },
};

export const topicStatusLabels: Record<TopicStatus, string> = {
  new: "New",
  selected: "Selected",
  ignored: "Ignored",
};


export const jobKindLabels: Record<JobKind, string> = {
  fetch_topics: "Fetching Topics",
  extract_content: "Extracting Content",
  translate_topic: "Translating Topic",
  generate_hook: "Generating Hook",
  generate_script: "Generating Script",
  generate_storyboard: "Generating Storyboard",
  generate_voice: "Generating Voice",
  pick_music: "Picking Music",
  export_package: "Exporting Package",
  generate_all: "Full Generation",
  health_check: "Checking Source Health",
  health_check_all: "Checking All Sources",
  auto_discovery: "Auto-discovering Sources",
  extract_trends: "Extracting Trends",
};

// ============ USER / AUTH ============

export interface User {
  id: string;
  personalNumber: number;
  passwordHash: string;
  nickname: string | null;
  avatarId: number;
  language: Language;
  theme: "light" | "dark";
  subscriptionExpiresAt: string;
  createdAt: string;
}

export const insertUserSchema = z.object({
  passwordHash: z.string(),
  nickname: z.string().nullable().optional(),
  language: Language.default("ru"),
  theme: z.enum(["light", "dark"]).default("dark"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;

export const updateUserSchema = z.object({
  nickname: z.string().nullable().optional(),
  avatarId: z.number().min(1).max(6).optional(),
  language: Language.optional(),
  theme: z.enum(["light", "dark"]).optional(),
});

export type UpdateUser = z.infer<typeof updateUserSchema>;

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthPassword {
  password: string;
  userId: string | null;
}

export const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ============ AI ASSISTANT CHAT ============

export const assistantChats = pgTable("assistant_chats", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id).notNull(),
  role: varchar("role", { length: 20 }).notNull(), // "user" or "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
});

export const insertAssistantChatSchema = createInsertSchema(assistantChats).omit({
  id: true,
  createdAt: true,
  archivedAt: true,
});

export type AssistantChat = typeof assistantChats.$inferSelect;
export type InsertAssistantChat = z.infer<typeof insertAssistantChatSchema>;

// ============ ASSISTANT NOTES ============

export const assistantNotes = pgTable("assistant_notes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id).notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAssistantNoteSchema = createInsertSchema(assistantNotes).omit({
  id: true,
  updatedAt: true,
});

export type AssistantNote = typeof assistantNotes.$inferSelect;
export type InsertAssistantNote = z.infer<typeof insertAssistantNoteSchema>;

// ============ ASSISTANT FEEDBACK ============

export const feedbackReasons = [
  "too_generic",
  "wrong_style", 
  "poor_structure",
  "no_practical",
  "not_trendy",
] as const;

export type FeedbackReason = typeof feedbackReasons[number];

export const assistantFeedback = pgTable("assistant_feedback", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id).notNull(),
  messageId: integer("message_id").references(() => assistantChats.id).notNull(),
  rating: varchar("rating", { length: 10 }).notNull(), // "positive" or "negative"
  reason: varchar("reason", { length: 50 }), // only for negative ratings
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssistantFeedbackSchema = createInsertSchema(assistantFeedback).omit({
  id: true,
  createdAt: true,
});

export type AssistantFeedback = typeof assistantFeedback.$inferSelect;
export type InsertAssistantFeedback = z.infer<typeof insertAssistantFeedbackSchema>;
