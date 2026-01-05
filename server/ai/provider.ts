import OpenAI from "openai";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ApiProviderType = "default" | "free" | "replit" | "custom";

export interface ApiProviderConfig {
  type: ApiProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  verified?: boolean;
  lastVerified?: string;
}

export interface AIProvider {
  embed(texts: string[]): Promise<number[][]>;
  chat(opts: { model: string; messages: ChatMessage[]; temperature?: number }): Promise<string>;
}

let cachedProviderConfig: ApiProviderConfig | null = null;

export function resetCustomApiCache() {
  cachedProviderConfig = null;
}

export async function checkUseCustomApi(): Promise<boolean> {
  return true;
}

export async function getApiProviderConfig(storage?: any): Promise<ApiProviderConfig> {
  if (cachedProviderConfig) {
    return cachedProviderConfig;
  }
  
  let config: ApiProviderConfig = {
    type: "default",
    verified: false
  };
  
  if (storage) {
    try {
      const settings = await storage.getSettings();
      const settingsMap = new Map(settings.map((s: { key: string; value: string }) => [s.key, s.value]));
      
      const providerType = settingsMap.get("apiProviderType") as ApiProviderType;
      if (providerType) {
        config.type = providerType;
      }
      
      config.verified = settingsMap.get("apiVerified") === "true";
      const lastVerified = settingsMap.get("apiLastVerified");
      config.lastVerified = typeof lastVerified === "string" ? lastVerified : undefined;
      
    } catch (e) {
      console.log("[AIProvider] Could not load settings, using defaults");
    }
  }
  
  cachedProviderConfig = config;
  return config;
}

function getApiCredentials(providerType: ApiProviderType): { apiKey: string; baseUrl: string } {
  switch (providerType) {
    case "replit":
      return {
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "",
        baseUrl: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1"
      };
    
    case "custom":
      return {
        apiKey: process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
        baseUrl: process.env.CUSTOM_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
      };
    
    case "free":
      return {
        apiKey: process.env.FREE_API_KEY || process.env.OPENAI_API_KEY || "",
        baseUrl: process.env.FREE_API_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
      };
    
    case "default":
    default:
      return {
        apiKey: process.env.OPENAI_API_KEY || "",
        baseUrl: process.env.OPENAI_BASE_URL || "https://neuroapi.host/v1"
      };
  }
}

function createOpenAIClient(providerType?: ApiProviderType): OpenAI {
  const type = providerType || "default";
  const { apiKey, baseUrl } = getApiCredentials(type);
  
  if (!apiKey) {
    throw new Error(`API key not configured for provider: ${type}`);
  }
  
  console.log(`[AIProvider] Using ${type} API with base URL: ${baseUrl}`);
  
  return new OpenAI({ apiKey, baseURL: baseUrl });
}

export function getProvider(providerType?: ApiProviderType): AIProvider {
  const client = createOpenAIClient(providerType);
  const type = providerType || "default";

  return {
    async embed(texts: string[]) {
      const model = process.env.AI_EMBED_MODEL ?? "text-embedding-3-large";
      const res = await client.embeddings.create({
        model,
        input: texts,
      });
      return res.data.map(d => d.embedding as unknown as number[]);
    },
    async chat({ model, messages, temperature }) {
      const res = await client.chat.completions.create({
        model,
        messages,
        temperature: temperature ?? 0.7,
      });
      return res.choices[0]?.message?.content ?? "";
    },
  };
}

export async function getProviderWithSettings(storage?: any): Promise<AIProvider> {
  const config = await getApiProviderConfig(storage);
  return getProvider(config.type);
}

export async function getOpenAIClientWithSettings(storage?: any): Promise<OpenAI> {
  const config = await getApiProviderConfig(storage);
  return createOpenAIClient(config.type);
}

export async function verifyApiConnection(providerType: ApiProviderType): Promise<{
  success: boolean;
  error?: string;
  model?: string;
  responseTime?: number;
}> {
  const startTime = Date.now();
  
  try {
    const { apiKey, baseUrl } = getApiCredentials(providerType);
    
    if (!apiKey) {
      return { success: false, error: "API key not configured" };
    }
    
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    
    const response = await client.chat.completions.create({
      model: providerType === "replit" ? "gpt-4o-mini" : (process.env.AI_CHAT_MODEL || "gpt-4o-mini"),
      messages: [{ role: "user", content: "Say 'OK' if you can read this." }],
      max_tokens: 10,
    });
    
    const responseTime = Date.now() - startTime;
    const content = response.choices[0]?.message?.content;
    
    if (content) {
      return {
        success: true,
        model: response.model,
        responseTime
      };
    } else {
      return { success: false, error: "Empty response from API" };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Connection failed"
    };
  }
}

export function getProviderDisplayName(type: ApiProviderType, lang: "ru" | "en" = "ru"): string {
  const names: Record<ApiProviderType, { ru: string; en: string }> = {
    default: { ru: "NeuroAPI (по умолчанию)", en: "NeuroAPI (default)" },
    free: { ru: "Бесплатный API", en: "Free API" },
    replit: { ru: "Replit AI", en: "Replit AI" },
    custom: { ru: "Свой API", en: "Custom API" }
  };
  return names[type]?.[lang] || type;
}

export function getAvailableProviders(): { 
  type: ApiProviderType; 
  available: boolean; 
  reason?: string;
}[] {
  return [
    {
      type: "default",
      available: !!process.env.OPENAI_API_KEY,
      reason: !process.env.OPENAI_API_KEY ? "OPENAI_API_KEY not set" : undefined
    },
    {
      type: "free",
      available: !!process.env.FREE_API_KEY,
      reason: !process.env.FREE_API_KEY ? "FREE_API_KEY not set" : undefined
    },
    {
      type: "replit",
      available: !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      reason: !process.env.AI_INTEGRATIONS_OPENAI_API_KEY ? "Replit AI not configured" : undefined
    },
    {
      type: "custom",
      available: !!process.env.CUSTOM_OPENAI_API_KEY,
      reason: !process.env.CUSTOM_OPENAI_API_KEY ? "CUSTOM_OPENAI_API_KEY not set" : undefined
    }
  ];
}
