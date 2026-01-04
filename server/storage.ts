import { randomUUID } from "crypto";
import { eq, desc, and, lt, sql, isNull, isNotNull } from "drizzle-orm";
import { db } from "./db";
import {
  settings, users, sessions, authPasswords, sources, topics, scripts, jobs,
  trendSignals, trendTopics, formStates, assistantChats, assistantNotes, assistantFeedback
} from "@shared/schema";
import type {
  Source, InsertSource, SourceHealth, CategoryId,
  Topic, InsertTopic,
  Script, InsertScript, UpdateScript,
  Job, InsertJob,
  Setting, InsertSetting,
  TrendSignal, InsertTrendSignal,
  TrendTopic, InsertTrendTopic,
  TopicStatus, ScriptStatus, JobStatus,
  User, InsertUser, UpdateUser, Session, AuthPassword,
  FormState, InsertFormState, AssistantChat, AssistantNote, AssistantFeedback
} from "@shared/schema";

export interface IStorage {
  // Sources
  getSources(): Promise<Source[]>;
  getSourcesByCategory(categoryId: CategoryId): Promise<Source[]>;
  getSource(id: string): Promise<Source | undefined>;
  createSource(source: InsertSource): Promise<Source>;
  updateSource(id: string, updates: Partial<InsertSource>): Promise<Source | undefined>;
  updateSourceHealth(id: string, health: SourceHealth): Promise<Source | undefined>;
  deleteSource(id: string): Promise<boolean>;
  getSourcesNeedingHealthCheck(): Promise<Source[]>;

  // Topics
  getTopics(): Promise<Topic[]>;
  getTopic(id: string): Promise<Topic | undefined>;
  createTopic(topic: InsertTopic): Promise<Topic>;
  updateTopic(id: string, updates: Partial<InsertTopic>): Promise<Topic | undefined>;
  deleteTopic(id: string): Promise<boolean>;
  deleteAllTopics(): Promise<number>;
  deleteTopicsBySourceId(sourceId: string): Promise<number>;
  deleteScriptsBySourceId(sourceId: string): Promise<number>;

  // Scripts
  getScripts(): Promise<Script[]>;
  getScript(id: string): Promise<Script | undefined>;
  createScript(script: InsertScript): Promise<Script>;
  updateScript(id: string, updates: UpdateScript): Promise<Script | undefined>;
  deleteScript(id: string): Promise<boolean>;

  // Jobs
  getJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined>;
  getQueuedJobs(): Promise<Job[]>;

  // Settings
  getSettings(): Promise<Setting[]>;
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string): Promise<Setting>;
  deleteSetting(key: string): Promise<boolean>;
  
  // TrendSignals
  getTrendSignals(): Promise<TrendSignal[]>;
  getTrendSignal(id: string): Promise<TrendSignal | undefined>;
  createTrendSignal(signal: InsertTrendSignal): Promise<TrendSignal>;
  updateTrendSignal(id: string, updates: Partial<InsertTrendSignal>): Promise<TrendSignal | undefined>;
  deleteTrendSignal(id: string): Promise<boolean>;
  
  // TrendTopics
  getTrendTopics(): Promise<TrendTopic[]>;
  getTrendTopic(id: string): Promise<TrendTopic | undefined>;
  createTrendTopic(topic: InsertTrendTopic): Promise<TrendTopic>;
  deleteTrendTopic(id: string): Promise<boolean>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByPassword(password: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: UpdateUser): Promise<User | undefined>;
  resetUserSettings(id: string): Promise<User | undefined>;
  
  // Sessions
  getSession(id: string): Promise<Session | undefined>;
  createSession(userId: string): Promise<Session>;
  deleteSession(id: string): Promise<boolean>;
  cleanExpiredSessions(): Promise<void>;

  // Auth passwords (valid passwords that can create/link accounts)
  getAuthPasswords(): Promise<AuthPassword[]>;
  validatePassword(password: string): Promise<boolean>;
  
  // Form state
  getFormState(pageName: string, userId?: string): Promise<FormState | undefined>;
  saveFormState(pageName: string, state: Record<string, unknown>, userId?: string): Promise<FormState>;
  
  // Assistant chat
  getAssistantChats(userId: string, limit?: number): Promise<AssistantChat[]>;
  getAssistantChatsPaginated(userId: string, page: number, perPage: number): Promise<{ messages: AssistantChat[]; total: number; totalPages: number }>;
  addAssistantChat(userId: string, role: "user" | "assistant", content: string): Promise<AssistantChat>;
  clearAssistantChats(userId: string): Promise<void>;
  archiveAssistantChats(userId: string): Promise<number>;
  getArchivedChatsForContext(userId: string, limit?: number): Promise<AssistantChat[]>;
  getArchivedChatSessions(userId: string): Promise<{ archivedAt: string; messageCount: number; preview: string }[]>;
  unarchiveChatSession(userId: string, archivedAt: string): Promise<number>;
  
  // Assistant notes
  getAssistantNote(userId: string): Promise<AssistantNote | undefined>;
  saveAssistantNote(userId: string, content: string): Promise<AssistantNote>;
  
  // Assistant feedback
  saveAssistantFeedback(userId: string, messageId: number, rating: "positive" | "negative", reason?: string): Promise<AssistantFeedback>;
  getAssistantFeedback(userId: string, messageId: number): Promise<AssistantFeedback | undefined>;
}

// Helper to convert Date to ISO string
function toISOString(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export class DatabaseStorage implements IStorage {
  
  // ============ SOURCES ============
  
  async getSources(): Promise<Source[]> {
    const rows = await db.select().from(sources).orderBy(desc(sources.createdAt));
    return rows.map(this.mapSource);
  }

  async getSourcesByCategory(categoryId: CategoryId): Promise<Source[]> {
    const rows = await db.select().from(sources)
      .where(eq(sources.categoryId, categoryId))
      .orderBy(desc(sources.priority));
    return rows.map(this.mapSource);
  }

  async getSource(id: string): Promise<Source | undefined> {
    const [row] = await db.select().from(sources).where(eq(sources.id, id));
    return row ? this.mapSource(row) : undefined;
  }

  async createSource(source: InsertSource): Promise<Source> {
    const id = randomUUID();
    const defaultHealth: SourceHealth = {
      status: "pending",
      httpCode: null,
      avgLatencyMs: null,
      lastSuccessAt: null,
      failuresCount: 0,
      freshnessHours: null,
      lastError: null,
      itemCount: null,
    };
    
    const [row] = await db.insert(sources).values({
      id,
      type: source.type,
      name: source.name,
      categoryId: source.categoryId ?? null,
      config: source.config,
      isEnabled: source.isEnabled ?? true,
      priority: source.priority ?? 3,
      health: source.health ?? defaultHealth,
      notes: source.notes ?? null,
    }).returning();
    
    return this.mapSource(row);
  }

  async updateSource(id: string, updates: Partial<InsertSource>): Promise<Source | undefined> {
    const existing = await this.getSource(id);
    if (!existing) return undefined;

    const [row] = await db.update(sources)
      .set({
        ...updates,
        config: updates.config ? { ...existing.config, ...updates.config } : undefined,
        health: updates.health ? { ...existing.health, ...updates.health } : undefined,
      })
      .where(eq(sources.id, id))
      .returning();
    
    return row ? this.mapSource(row) : undefined;
  }

  async updateSourceHealth(id: string, health: SourceHealth): Promise<Source | undefined> {
    const [row] = await db.update(sources)
      .set({ health, lastCheckAt: new Date() })
      .where(eq(sources.id, id))
      .returning();
    
    return row ? this.mapSource(row) : undefined;
  }

  async deleteSource(id: string): Promise<boolean> {
    const result = await db.delete(sources).where(eq(sources.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getSourcesNeedingHealthCheck(): Promise<Source[]> {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const rows = await db.select().from(sources)
      .where(and(
        eq(sources.isEnabled, true),
        sql`${sources.lastCheckAt} IS NULL OR ${sources.lastCheckAt} < ${sixHoursAgo}`
      ));
    return rows.map(this.mapSource);
  }

  private mapSource(row: any): Source {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      categoryId: row.categoryId,
      config: row.config || {},
      isEnabled: row.isEnabled,
      priority: row.priority,
      health: row.health || { status: "pending", failuresCount: 0 },
      lastCheckAt: toISOString(row.lastCheckAt),
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ============ TOPICS ============

  async getTopics(): Promise<Topic[]> {
    const rows = await db.select().from(topics).orderBy(desc(topics.createdAt));
    return rows.map(this.mapTopic);
  }

  async getTopic(id: string): Promise<Topic | undefined> {
    const [row] = await db.select().from(topics).where(eq(topics.id, id));
    return row ? this.mapTopic(row) : undefined;
  }

  async createTopic(topic: InsertTopic): Promise<Topic> {
    const id = randomUUID();
    const [row] = await db.insert(topics).values({
      id,
      sourceId: topic.sourceId,
      title: topic.title,
      generatedTitle: topic.generatedTitle ?? null,
      translatedTitle: topic.translatedTitle ?? null,
      translatedTitleEn: topic.translatedTitleEn ?? null,
      url: topic.url ?? null,
      rawText: topic.rawText ?? null,
      fullContent: topic.fullContent ?? null,
      insights: topic.insights ?? null,
      tags: topic.tags ?? [],
      extractionStatus: topic.extractionStatus ?? "pending",
      language: topic.language ?? "ru",
      score: topic.score ?? 0,
      status: topic.status ?? "new",
    }).returning();
    
    return this.mapTopic(row);
  }

  async updateTopic(id: string, updates: Partial<InsertTopic>): Promise<Topic | undefined> {
    const [row] = await db.update(topics)
      .set(updates)
      .where(eq(topics.id, id))
      .returning();
    
    return row ? this.mapTopic(row) : undefined;
  }

  async deleteTopic(id: string): Promise<boolean> {
    const result = await db.delete(topics).where(eq(topics.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteAllTopics(): Promise<number> {
    const result = await db.delete(topics);
    return result.rowCount ?? 0;
  }

  async deleteTopicsBySourceId(sourceId: string): Promise<number> {
    const result = await db.delete(topics).where(eq(topics.sourceId, sourceId));
    return result.rowCount ?? 0;
  }

  async deleteScriptsBySourceId(sourceId: string): Promise<number> {
    // Get all topic IDs for this source
    const sourceTopics = await db.select({ id: topics.id }).from(topics).where(eq(topics.sourceId, sourceId));
    if (sourceTopics.length === 0) return 0;
    
    const topicIds = sourceTopics.map(t => t.id);
    let deleted = 0;
    for (const topicId of topicIds) {
      const result = await db.delete(scripts).where(eq(scripts.topicId, topicId));
      deleted += result.rowCount ?? 0;
    }
    return deleted;
  }

  private mapTopic(row: any): Topic {
    return {
      id: row.id,
      sourceId: row.sourceId,
      title: row.title,
      generatedTitle: row.generatedTitle,
      translatedTitle: row.translatedTitle,
      translatedTitleEn: row.translatedTitleEn,
      url: row.url,
      rawText: row.rawText,
      fullContent: row.fullContent,
      insights: row.insights,
      tags: row.tags || [],
      extractionStatus: row.extractionStatus,
      language: row.language,
      score: row.score,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ============ SCRIPTS ============

  async getScripts(): Promise<Script[]> {
    const rows = await db.select().from(scripts).orderBy(desc(scripts.updatedAt));
    return rows.map(this.mapScript);
  }

  async getScript(id: string): Promise<Script | undefined> {
    const [row] = await db.select().from(scripts).where(eq(scripts.id, id));
    return row ? this.mapScript(row) : undefined;
  }

  async createScript(script: InsertScript): Promise<Script> {
    const id = randomUUID();
    
    // Get next script number
    const numSetting = await this.getSetting("nextScriptNumber");
    const scriptNumber = script.scriptNumber ?? parseInt(numSetting?.value ?? "1", 10);
    const lang = script.language ?? "ru";
    const displayName = script.displayName ?? (lang === "ru" 
      ? `Скрипт #${String(scriptNumber).padStart(2, "0")}`
      : `Script #${String(scriptNumber).padStart(2, "0")}`);
    
    // Update counter
    if (!script.scriptNumber) {
      await this.setSetting("nextScriptNumber", String(scriptNumber + 1));
    }
    
    const [row] = await db.insert(scripts).values({
      id,
      topicId: script.topicId,
      displayName,
      language: lang,
      durationSec: script.durationSec ?? "30",
      stylePreset: script.stylePreset ?? "classic",
      voiceStylePreset: script.voiceStylePreset ?? "classic",
      accent: script.accent ?? "classic",
      platform: script.platform ?? "youtube_shorts",
      keywords: script.keywords ?? [],
      constraints: script.constraints ?? null,
      seo: script.seo ?? null,
      hook: script.hook ?? null,
      voiceText: script.voiceText ?? null,
      onScreenText: script.onScreenText ?? null,
      transcriptRich: script.transcriptRich ?? null,
      storyboard: script.storyboard ?? null,
      music: script.music ?? null,
      assets: script.assets ?? null,
      status: script.status ?? "draft",
      error: script.error ?? null,
    }).returning();
    
    return this.mapScript(row);
  }

  async updateScript(id: string, updates: UpdateScript): Promise<Script | undefined> {
    const [row] = await db.update(scripts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(scripts.id, id))
      .returning();
    
    return row ? this.mapScript(row) : undefined;
  }

  async deleteScript(id: string): Promise<boolean> {
    const result = await db.delete(scripts).where(eq(scripts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  private mapScript(row: any): Script {
    return {
      id: row.id,
      topicId: row.topicId,
      scriptNumber: row.scriptNumber,
      displayName: row.displayName,
      language: row.language,
      durationSec: row.durationSec,
      stylePreset: row.stylePreset,
      voiceStylePreset: row.voiceStylePreset,
      accent: row.accent,
      platform: row.platform,
      keywords: row.keywords || [],
      constraints: row.constraints,
      seo: row.seo,
      hook: row.hook,
      voiceText: row.voiceText,
      onScreenText: row.onScreenText,
      transcriptRich: row.transcriptRich,
      storyboard: row.storyboard,
      music: row.music,
      assets: row.assets,
      status: row.status,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ============ JOBS ============

  async getJobs(): Promise<Job[]> {
    const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt));
    return rows.map(this.mapJob);
  }

  async getJob(id: string): Promise<Job | undefined> {
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    return row ? this.mapJob(row) : undefined;
  }

  async createJob(job: InsertJob): Promise<Job> {
    const id = randomUUID();
    const [row] = await db.insert(jobs).values({
      id,
      kind: job.kind,
      payload: job.payload ?? {},
      status: job.status ?? "queued",
      progress: job.progress ?? 0,
      error: job.error ?? null,
    }).returning();
    
    return this.mapJob(row);
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined> {
    const [row] = await db.update(jobs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    
    return row ? this.mapJob(row) : undefined;
  }

  async getQueuedJobs(): Promise<Job[]> {
    const rows = await db.select().from(jobs)
      .where(eq(jobs.status, "queued"))
      .orderBy(jobs.createdAt);
    return rows.map(this.mapJob);
  }

  private mapJob(row: any): Job {
    return {
      id: row.id,
      kind: row.kind,
      payload: row.payload || {},
      status: row.status,
      progress: row.progress,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ============ SETTINGS ============

  async getSettings(): Promise<Setting[]> {
    const rows = await db.select().from(settings);
    return rows;
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    const [row] = await db.select().from(settings).where(eq(settings.key, key));
    return row || undefined;
  }

  async setSetting(key: string, value: string): Promise<Setting> {
    const [row] = await db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value }
      })
      .returning();
    return row;
  }

  async deleteSetting(key: string): Promise<boolean> {
    const result = await db.delete(settings).where(eq(settings.key, key));
    return (result.rowCount ?? 0) > 0;
  }

  // ============ TREND SIGNALS ============

  async getTrendSignals(): Promise<TrendSignal[]> {
    const rows = await db.select().from(trendSignals).orderBy(desc(trendSignals.updatedAt));
    return rows.map(this.mapTrendSignal);
  }

  async getTrendSignal(id: string): Promise<TrendSignal | undefined> {
    const [row] = await db.select().from(trendSignals).where(eq(trendSignals.id, id));
    return row ? this.mapTrendSignal(row) : undefined;
  }

  async createTrendSignal(signal: InsertTrendSignal): Promise<TrendSignal> {
    const id = randomUUID();
    const [row] = await db.insert(trendSignals).values({
      id,
      platform: signal.platform,
      categoryId: signal.categoryId ?? null,
      topicClusterId: signal.topicClusterId ?? null,
      keywords: signal.keywords,
      angles: signal.angles,
      hookPatterns: signal.hookPatterns,
      pacingHints: signal.pacingHints ?? null,
      durationModes: signal.durationModes ?? [],
      exampleRefs: signal.exampleRefs ?? [],
      score: signal.score ?? 0,
    }).returning();
    
    return this.mapTrendSignal(row);
  }

  async updateTrendSignal(id: string, updates: Partial<InsertTrendSignal>): Promise<TrendSignal | undefined> {
    const [row] = await db.update(trendSignals)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(trendSignals.id, id))
      .returning();
    
    return row ? this.mapTrendSignal(row) : undefined;
  }

  async deleteTrendSignal(id: string): Promise<boolean> {
    const result = await db.delete(trendSignals).where(eq(trendSignals.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  private mapTrendSignal(row: any): TrendSignal {
    return {
      id: row.id,
      platform: row.platform,
      categoryId: row.categoryId,
      topicClusterId: row.topicClusterId,
      keywords: row.keywords || [],
      angles: row.angles || [],
      hookPatterns: row.hookPatterns || [],
      pacingHints: row.pacingHints,
      durationModes: row.durationModes || [],
      exampleRefs: row.exampleRefs || [],
      score: row.score,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ============ TREND TOPICS ============

  async getTrendTopics(): Promise<TrendTopic[]> {
    const rows = await db.select().from(trendTopics).orderBy(desc(trendTopics.updatedAt));
    return rows.map(this.mapTrendTopic);
  }

  async getTrendTopic(id: string): Promise<TrendTopic | undefined> {
    const [row] = await db.select().from(trendTopics).where(eq(trendTopics.id, id));
    return row ? this.mapTrendTopic(row) : undefined;
  }

  async createTrendTopic(topic: InsertTrendTopic): Promise<TrendTopic> {
    const id = randomUUID();
    const [row] = await db.insert(trendTopics).values({
      id,
      categoryId: topic.categoryId ?? null,
      clusterLabel: topic.clusterLabel,
      seedTitles: topic.seedTitles,
      contextSnippets: topic.contextSnippets,
      entities: topic.entities ?? [],
      keywords: topic.keywords,
      angles: topic.angles,
      hookPatterns: topic.hookPatterns ?? [],
      pacingHints: topic.pacingHints ?? null,
      refs: topic.refs ?? [],
      trendSignalIds: topic.trendSignalIds ?? [],
      score: topic.score ?? 0,
    }).returning();
    
    return this.mapTrendTopic(row);
  }

  async deleteTrendTopic(id: string): Promise<boolean> {
    const result = await db.delete(trendTopics).where(eq(trendTopics.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  private mapTrendTopic(row: any): TrendTopic {
    return {
      id: row.id,
      categoryId: row.categoryId,
      clusterLabel: row.clusterLabel,
      seedTitles: row.seedTitles || [],
      contextSnippets: row.contextSnippets || [],
      entities: row.entities || [],
      keywords: row.keywords || [],
      angles: row.angles || [],
      hookPatterns: row.hookPatterns || [],
      pacingHints: row.pacingHints,
      refs: row.refs || [],
      trendSignalIds: row.trendSignalIds || [],
      score: row.score,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ============ USERS ============

  async getUser(id: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row ? this.mapUser(row) : undefined;
  }

  async getUserByPassword(password: string): Promise<User | undefined> {
    const [authPwd] = await db.select().from(authPasswords).where(eq(authPasswords.password, password));
    if (!authPwd || !authPwd.userId) return undefined;
    return this.getUser(authPwd.userId);
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = randomUUID();
    const subscriptionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const randomAvatarId = Math.floor(Math.random() * 6) + 1;
    
    const [row] = await db.insert(users).values({
      id,
      passwordHash: user.passwordHash,
      nickname: user.nickname ?? null,
      avatarId: randomAvatarId,
      language: user.language ?? "ru",
      theme: user.theme ?? "dark",
      subscriptionExpiresAt: subscriptionExpires,
    }).returning();
    
    // Link password to user
    await db.update(authPasswords)
      .set({ userId: id })
      .where(eq(authPasswords.password, user.passwordHash));
    
    return this.mapUser(row);
  }

  async updateUser(id: string, updates: UpdateUser): Promise<User | undefined> {
    const [row] = await db.update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    
    return row ? this.mapUser(row) : undefined;
  }

  async resetUserSettings(id: string): Promise<User | undefined> {
    const [row] = await db.update(users)
      .set({ nickname: null, language: "ru", theme: "dark" })
      .where(eq(users.id, id))
      .returning();
    
    return row ? this.mapUser(row) : undefined;
  }

  private mapUser(row: any): User {
    return {
      id: row.id,
      personalNumber: row.personalNumber,
      passwordHash: row.passwordHash,
      nickname: row.nickname,
      avatarId: row.avatarId,
      language: row.language,
      theme: row.theme,
      subscriptionExpiresAt: row.subscriptionExpiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ============ SESSIONS ============

  async getSession(id: string): Promise<Session | undefined> {
    const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
    if (!row) return undefined;
    
    // Check if expired
    if (new Date(row.expiresAt) < new Date()) {
      await this.deleteSession(id);
      return undefined;
    }
    
    return this.mapSession(row);
  }

  async createSession(userId: string): Promise<Session> {
    const id = randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    const [row] = await db.insert(sessions).values({
      id,
      userId,
      expiresAt: expires,
    }).returning();
    
    return this.mapSession(row);
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await db.delete(sessions).where(eq(sessions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async cleanExpiredSessions(): Promise<void> {
    await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  }

  private mapSession(row: any): Session {
    return {
      id: row.id,
      userId: row.userId,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ============ AUTH PASSWORDS ============

  async getAuthPasswords(): Promise<AuthPassword[]> {
    const rows = await db.select().from(authPasswords);
    return rows.map(row => ({ password: row.password, userId: row.userId }));
  }

  async validatePassword(password: string): Promise<boolean> {
    const [row] = await db.select().from(authPasswords).where(eq(authPasswords.password, password));
    return !!row;
  }

  // ============ FORM STATE ============

  async getFormState(pageName: string, userId?: string): Promise<FormState | undefined> {
    const id = userId ? `${userId}:${pageName}` : `anon:${pageName}`;
    const [row] = await db.select().from(formStates).where(eq(formStates.id, id));
    return row ? {
      id: row.id,
      userId: row.userId,
      pageName: row.pageName,
      state: row.state as Record<string, unknown>,
      updatedAt: row.updatedAt.toISOString(),
    } : undefined;
  }

  async saveFormState(pageName: string, state: Record<string, unknown>, userId?: string): Promise<FormState> {
    const id = userId ? `${userId}:${pageName}` : `anon:${pageName}`;
    
    const [row] = await db.insert(formStates)
      .values({
        id,
        userId: userId ?? null,
        pageName,
        state,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: formStates.id,
        set: { state, updatedAt: new Date() }
      })
      .returning();
    
    return {
      id: row.id,
      userId: row.userId,
      pageName: row.pageName,
      state: row.state as Record<string, unknown>,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ============ ASSISTANT CHAT ============

  async getAssistantChats(userId: string, limit: number = 50): Promise<AssistantChat[]> {
    const rows = await db.select()
      .from(assistantChats)
      .where(and(eq(assistantChats.userId, userId), isNull(assistantChats.archivedAt)))
      .orderBy(desc(assistantChats.createdAt))
      .limit(limit);
    
    return rows.reverse().map(row => ({
      id: row.id,
      userId: row.userId,
      role: row.role as "user" | "assistant",
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getAssistantChatsPaginated(userId: string, page: number, perPage: number): Promise<{ messages: AssistantChat[]; total: number; totalPages: number }> {
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(assistantChats)
      .where(and(eq(assistantChats.userId, userId), isNull(assistantChats.archivedAt)));
    
    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / perPage);
    
    const offset = (page - 1) * perPage;
    const rows = await db.select()
      .from(assistantChats)
      .where(and(eq(assistantChats.userId, userId), isNull(assistantChats.archivedAt)))
      .orderBy(desc(assistantChats.createdAt))
      .limit(perPage)
      .offset(offset);
    
    const messages = rows.reverse().map(row => ({
      id: row.id,
      userId: row.userId,
      role: row.role as "user" | "assistant",
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }));
    
    return { messages, total, totalPages };
  }

  async addAssistantChat(userId: string, role: "user" | "assistant", content: string): Promise<AssistantChat> {
    const [row] = await db.insert(assistantChats).values({
      userId,
      role,
      content,
    }).returning();
    
    return {
      id: row.id,
      userId: row.userId,
      role: row.role as "user" | "assistant",
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async clearAssistantChats(userId: string): Promise<void> {
    // First, get all chat IDs for this user to delete related feedback
    const userChats = await db.select({ id: assistantChats.id })
      .from(assistantChats)
      .where(eq(assistantChats.userId, userId));
    
    const chatIds = userChats.map(c => c.id);
    
    // Delete feedback for these chats first (foreign key constraint)
    if (chatIds.length > 0) {
      for (const chatId of chatIds) {
        await db.delete(assistantFeedback).where(eq(assistantFeedback.messageId, chatId));
      }
    }
    
    // Now delete the chats
    await db.delete(assistantChats).where(eq(assistantChats.userId, userId));
  }

  async archiveAssistantChats(userId: string): Promise<number> {
    const result = await db.update(assistantChats)
      .set({ archivedAt: new Date() })
      .where(and(eq(assistantChats.userId, userId), isNull(assistantChats.archivedAt)));
    return result.rowCount ?? 0;
  }

  async getArchivedChatsForContext(userId: string, limit: number = 20): Promise<AssistantChat[]> {
    const rows = await db.select()
      .from(assistantChats)
      .where(eq(assistantChats.userId, userId))
      .orderBy(desc(assistantChats.createdAt))
      .limit(limit);
    
    return rows.reverse().map(row => ({
      id: row.id,
      userId: row.userId,
      role: row.role as "user" | "assistant",
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getArchivedChatSessions(userId: string): Promise<{ archivedAt: string; messageCount: number; preview: string }[]> {
    const rows = await db.select({
      archivedAt: assistantChats.archivedAt,
      messageCount: sql<number>`count(*)::int`,
      preview: sql<string>`(
        SELECT content FROM assistant_chats ac2 
        WHERE ac2.archived_at = assistant_chats.archived_at 
        AND ac2.user_id = ${userId}
        AND ac2.role = 'user'
        ORDER BY ac2.created_at ASC 
        LIMIT 1
      )`,
    })
      .from(assistantChats)
      .where(and(eq(assistantChats.userId, userId), isNotNull(assistantChats.archivedAt)))
      .groupBy(assistantChats.archivedAt)
      .orderBy(desc(assistantChats.archivedAt));
    
    return rows.map(row => ({
      archivedAt: row.archivedAt!.toISOString(),
      messageCount: row.messageCount,
      preview: row.preview || "",
    }));
  }

  async unarchiveChatSession(userId: string, archivedAt: string): Promise<number> {
    // First, archive any currently active chats so they aren't lost
    const now = new Date();
    await db.update(assistantChats)
      .set({ archivedAt: now })
      .where(and(
        eq(assistantChats.userId, userId),
        isNull(assistantChats.archivedAt)
      ));
    
    // Then restore the requested archived session
    const result = await db.update(assistantChats)
      .set({ archivedAt: null })
      .where(and(
        eq(assistantChats.userId, userId),
        eq(assistantChats.archivedAt, new Date(archivedAt))
      ));
    return result.rowCount ?? 0;
  }
  
  // ============ ASSISTANT NOTES ============
  
  async getAssistantNote(userId: string): Promise<AssistantNote | undefined> {
    const [row] = await db.select()
      .from(assistantNotes)
      .where(eq(assistantNotes.userId, userId));
    
    if (!row) return undefined;
    
    return {
      id: row.id,
      userId: row.userId,
      content: row.content,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  
  async saveAssistantNote(userId: string, content: string): Promise<AssistantNote> {
    const existing = await this.getAssistantNote(userId);
    
    if (existing) {
      const [row] = await db.update(assistantNotes)
        .set({ content, updatedAt: new Date() })
        .where(eq(assistantNotes.userId, userId))
        .returning();
      
      return {
        id: row.id,
        userId: row.userId,
        content: row.content,
        updatedAt: row.updatedAt.toISOString(),
      };
    } else {
      const [row] = await db.insert(assistantNotes).values({
        userId,
        content,
      }).returning();
      
      return {
        id: row.id,
        userId: row.userId,
        content: row.content,
        updatedAt: row.updatedAt.toISOString(),
      };
    }
  }
  
  // ============ ASSISTANT FEEDBACK ============
  
  async saveAssistantFeedback(userId: string, messageId: number, rating: "positive" | "negative", reason?: string): Promise<AssistantFeedback> {
    // Check if feedback already exists for this message
    const existing = await this.getAssistantFeedback(userId, messageId);
    
    if (existing) {
      // Update existing feedback
      const [row] = await db.update(assistantFeedback)
        .set({ rating, reason: reason || null })
        .where(and(
          eq(assistantFeedback.userId, userId),
          eq(assistantFeedback.messageId, messageId)
        ))
        .returning();
      
      return {
        id: row.id,
        userId: row.userId,
        messageId: row.messageId,
        rating: row.rating,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      };
    } else {
      // Insert new feedback
      const [row] = await db.insert(assistantFeedback).values({
        userId,
        messageId,
        rating,
        reason: reason || null,
      }).returning();
      
      return {
        id: row.id,
        userId: row.userId,
        messageId: row.messageId,
        rating: row.rating,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      };
    }
  }
  
  async getAssistantFeedback(userId: string, messageId: number): Promise<AssistantFeedback | undefined> {
    const [row] = await db.select()
      .from(assistantFeedback)
      .where(and(
        eq(assistantFeedback.userId, userId),
        eq(assistantFeedback.messageId, messageId)
      ));
    
    if (!row) return undefined;
    
    return {
      id: row.id,
      userId: row.userId,
      messageId: row.messageId,
      rating: row.rating,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

// Initialize default settings and auth passwords
async function initializeDefaults() {
  const storage = new DatabaseStorage();
  
  // Check if settings exist
  const existingSettings = await storage.getSettings();
  if (existingSettings.length === 0) {
    await storage.setSetting("fallbackMode", "true");
    await storage.setSetting("defaultDuration", "30");
    await storage.setSetting("defaultStylePreset", "cinematic");
    await storage.setSetting("nextScriptNumber", "1");
  }
  
  // Check if auth passwords exist
  const existingPasswords = await storage.getAuthPasswords();
  if (existingPasswords.length === 0) {
    await db.insert(authPasswords).values([
      { password: "Holzid56", userId: null },
      { password: "Lerochka", userId: null },
      { password: "Test", userId: null },
    ]).onConflictDoNothing();
  }
}

// Create and export storage instance
export const storage = new DatabaseStorage();

// Initialize defaults when module loads (but don't block)
initializeDefaults().catch(console.error);
