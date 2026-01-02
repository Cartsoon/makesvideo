import { randomUUID } from "crypto";
import type {
  Source, InsertSource, SourceHealth, CategoryId,
  Topic, InsertTopic,
  Script, InsertScript, UpdateScript,
  Job, InsertJob,
  Setting, InsertSetting,
  TrendSignal, InsertTrendSignal,
  TrendTopic, InsertTrendTopic,
  TopicStatus, ScriptStatus, JobStatus,
  User, InsertUser, UpdateUser, Session, AuthPassword
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
}

export class MemStorage implements IStorage {
  private sources: Map<string, Source> = new Map();
  private topics: Map<string, Topic> = new Map();
  private scripts: Map<string, Script> = new Map();
  private jobs: Map<string, Job> = new Map();
  private settings: Map<string, Setting> = new Map();
  private trendSignals: Map<string, TrendSignal> = new Map();
  private trendTopics: Map<string, TrendTopic> = new Map();
  private users: Map<string, User> = new Map();
  private sessions: Map<string, Session> = new Map();
  private authPasswords: Map<string, AuthPassword> = new Map();
  private nextPersonalNumber: number = 4473;

  constructor() {
    // Initialize with some default settings
    this.settings.set("fallbackMode", { key: "fallbackMode", value: "true" });
    this.settings.set("defaultDuration", { key: "defaultDuration", value: "30" });
    this.settings.set("defaultStylePreset", { key: "defaultStylePreset", value: "cinematic" });
    this.settings.set("nextScriptNumber", { key: "nextScriptNumber", value: "1" });
    
    // Initialize valid auth passwords (without linked users initially)
    this.authPasswords.set("Holzid56", { password: "Holzid56", userId: null });
    this.authPasswords.set("Lerochka", { password: "Lerochka", userId: null });
    this.authPasswords.set("Test", { password: "Test", userId: null });
  }

  // Sources
  async getSources(): Promise<Source[]> {
    return Array.from(this.sources.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getSourcesByCategory(categoryId: CategoryId): Promise<Source[]> {
    return Array.from(this.sources.values())
      .filter(s => s.categoryId === categoryId)
      .sort((a, b) => b.priority - a.priority);
  }

  async getSource(id: string): Promise<Source | undefined> {
    return this.sources.get(id);
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
    const newSource: Source = {
      id,
      type: source.type,
      name: source.name,
      categoryId: (source.categoryId as CategoryId) ?? null,
      config: source.config,
      isEnabled: source.isEnabled ?? true,
      priority: source.priority ?? 3,
      health: source.health ?? defaultHealth,
      lastCheckAt: null,
      notes: source.notes ?? null,
      createdAt: new Date().toISOString(),
    };
    this.sources.set(id, newSource);
    return newSource;
  }

  async updateSource(id: string, updates: Partial<InsertSource>): Promise<Source | undefined> {
    const source = this.sources.get(id);
    if (!source) return undefined;

    const updated: Source = {
      ...source,
      ...updates,
      categoryId: updates.categoryId !== undefined ? (updates.categoryId as CategoryId) : source.categoryId,
      config: updates.config ? { ...source.config, ...updates.config } : source.config,
      health: updates.health ? { ...source.health, ...updates.health } : source.health,
    };
    this.sources.set(id, updated);
    return updated;
  }

  async updateSourceHealth(id: string, health: SourceHealth): Promise<Source | undefined> {
    const source = this.sources.get(id);
    if (!source) return undefined;

    const updated: Source = {
      ...source,
      health,
      lastCheckAt: new Date().toISOString(),
    };
    this.sources.set(id, updated);
    return updated;
  }

  async deleteSource(id: string): Promise<boolean> {
    return this.sources.delete(id);
  }

  async getSourcesNeedingHealthCheck(): Promise<Source[]> {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    return Array.from(this.sources.values())
      .filter(s => s.isEnabled && (!s.lastCheckAt || s.lastCheckAt < sixHoursAgo));
  }

  // Topics
  async getTopics(): Promise<Topic[]> {
    return Array.from(this.topics.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getTopic(id: string): Promise<Topic | undefined> {
    return this.topics.get(id);
  }

  async createTopic(topic: InsertTopic): Promise<Topic> {
    const id = randomUUID();
    const newTopic: Topic = {
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
      extractionStatus: topic.extractionStatus ?? "pending",
      language: topic.language ?? "ru",
      score: topic.score ?? 0,
      status: topic.status ?? "new",
      createdAt: new Date().toISOString(),
    };
    this.topics.set(id, newTopic);
    return newTopic;
  }

  async updateTopic(id: string, updates: Partial<InsertTopic>): Promise<Topic | undefined> {
    const topic = this.topics.get(id);
    if (!topic) return undefined;

    const updated: Topic = { ...topic, ...updates };
    this.topics.set(id, updated);
    return updated;
  }

  async deleteTopic(id: string): Promise<boolean> {
    return this.topics.delete(id);
  }

  // Scripts
  async getScripts(): Promise<Script[]> {
    return Array.from(this.scripts.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async getScript(id: string): Promise<Script | undefined> {
    return this.scripts.get(id);
  }

  async createScript(script: InsertScript): Promise<Script> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    // Get and increment script number
    const numSetting = this.settings.get("nextScriptNumber");
    const scriptNumber = script.scriptNumber ?? parseInt(numSetting?.value ?? "1", 10);
    const lang = script.language ?? "ru";
    const displayName = script.displayName ?? (lang === "ru" 
      ? `Скрипт #${String(scriptNumber).padStart(2, "0")}`
      : `Script #${String(scriptNumber).padStart(2, "0")}`);
    
    // Update counter if we used it
    if (!script.scriptNumber) {
      this.settings.set("nextScriptNumber", { key: "nextScriptNumber", value: String(scriptNumber + 1) });
    }
    
    const newScript: Script = {
      id,
      topicId: script.topicId,
      scriptNumber,
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
      createdAt: now,
      updatedAt: now,
    };
    this.scripts.set(id, newScript);
    return newScript;
  }

  async updateScript(id: string, updates: UpdateScript): Promise<Script | undefined> {
    const script = this.scripts.get(id);
    if (!script) return undefined;

    const updated: Script = {
      ...script,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.scripts.set(id, updated);
    return updated;
  }

  async deleteScript(id: string): Promise<boolean> {
    return this.scripts.delete(id);
  }

  // Jobs
  async getJobs(): Promise<Job[]> {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getJob(id: string): Promise<Job | undefined> {
    return this.jobs.get(id);
  }

  async createJob(job: InsertJob): Promise<Job> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newJob: Job = {
      id,
      kind: job.kind,
      payload: job.payload ?? {},
      status: job.status ?? "queued",
      progress: job.progress ?? 0,
      error: job.error ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, newJob);
    return newJob;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    const updated: Job = {
      ...job,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async getQueuedJobs(): Promise<Job[]> {
    return Array.from(this.jobs.values())
      .filter((j) => j.status === "queued")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  // Settings
  async getSettings(): Promise<Setting[]> {
    return Array.from(this.settings.values());
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    return this.settings.get(key);
  }

  async setSetting(key: string, value: string): Promise<Setting> {
    const setting: Setting = { key, value };
    this.settings.set(key, setting);
    return setting;
  }

  async deleteSetting(key: string): Promise<boolean> {
    return this.settings.delete(key);
  }

  // TrendSignals
  async getTrendSignals(): Promise<TrendSignal[]> {
    return Array.from(this.trendSignals.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async getTrendSignal(id: string): Promise<TrendSignal | undefined> {
    return this.trendSignals.get(id);
  }

  async createTrendSignal(signal: InsertTrendSignal): Promise<TrendSignal> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newSignal: TrendSignal = {
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
      createdAt: now,
      updatedAt: now,
    };
    this.trendSignals.set(id, newSignal);
    return newSignal;
  }

  async updateTrendSignal(id: string, updates: Partial<InsertTrendSignal>): Promise<TrendSignal | undefined> {
    const signal = this.trendSignals.get(id);
    if (!signal) return undefined;

    const updated: TrendSignal = {
      ...signal,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.trendSignals.set(id, updated);
    return updated;
  }

  async deleteTrendSignal(id: string): Promise<boolean> {
    return this.trendSignals.delete(id);
  }

  // TrendTopics
  async getTrendTopics(): Promise<TrendTopic[]> {
    return Array.from(this.trendTopics.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async getTrendTopic(id: string): Promise<TrendTopic | undefined> {
    return this.trendTopics.get(id);
  }

  async createTrendTopic(topic: InsertTrendTopic): Promise<TrendTopic> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const newTopic: TrendTopic = {
      id,
      categoryId: topic.categoryId ?? null,
      seedTitles: topic.seedTitles,
      contextSnippets: topic.contextSnippets,
      entities: topic.entities ?? [],
      keywords: topic.keywords,
      angles: topic.angles,
      trendSignalIds: topic.trendSignalIds ?? [],
      score: topic.score ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.trendTopics.set(id, newTopic);
    return newTopic;
  }

  async deleteTrendTopic(id: string): Promise<boolean> {
    return this.trendTopics.delete(id);
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByPassword(password: string): Promise<User | undefined> {
    const authPwd = this.authPasswords.get(password);
    if (!authPwd || !authPwd.userId) return undefined;
    return this.users.get(authPwd.userId);
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = randomUUID();
    const now = new Date();
    const subscriptionExpires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    const newUser: User = {
      id,
      personalNumber: this.nextPersonalNumber++,
      passwordHash: user.passwordHash,
      nickname: user.nickname ?? null,
      language: user.language ?? "ru",
      theme: user.theme ?? "dark",
      subscriptionExpiresAt: subscriptionExpires.toISOString(),
      createdAt: now.toISOString(),
    };
    this.users.set(id, newUser);
    
    // Link password to user
    const authPwd = this.authPasswords.get(user.passwordHash);
    if (authPwd) {
      authPwd.userId = id;
    }
    
    return newUser;
  }

  async updateUser(id: string, updates: UpdateUser): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updated: User = {
      ...user,
      ...updates,
    };
    this.users.set(id, updated);
    return updated;
  }

  async resetUserSettings(id: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updated: User = {
      ...user,
      nickname: null,
      language: "ru",
      theme: "dark",
    };
    this.users.set(id, updated);
    return updated;
  }

  // Sessions
  async getSession(id: string): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    
    // Check if expired
    if (new Date(session.expiresAt) < new Date()) {
      this.sessions.delete(id);
      return undefined;
    }
    
    return session;
  }

  async createSession(userId: string): Promise<Session> {
    const id = randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    const session: Session = {
      id,
      userId,
      expiresAt: expires.toISOString(),
      createdAt: now.toISOString(),
    };
    this.sessions.set(id, session);
    return session;
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async cleanExpiredSessions(): Promise<void> {
    const now = new Date();
    const entries = Array.from(this.sessions.entries());
    for (const [id, session] of entries) {
      if (new Date(session.expiresAt) < now) {
        this.sessions.delete(id);
      }
    }
  }

  // Auth passwords
  async getAuthPasswords(): Promise<AuthPassword[]> {
    return Array.from(this.authPasswords.values());
  }

  async validatePassword(password: string): Promise<boolean> {
    return this.authPasswords.has(password);
  }
}

export const storage = new MemStorage();
