import OpenAI from "openai";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface AIProvider {
  embed(texts: string[]): Promise<number[][]>;
  chat(opts: { model: string; messages: ChatMessage[]; temperature?: number }): Promise<string>;
}

let cachedUseCustomApi: boolean | null = null;

export async function checkUseCustomApi(): Promise<boolean> {
  if (cachedUseCustomApi !== null) return cachedUseCustomApi;
  try {
    const { storage } = await import("../storage");
    const settings = await storage.getSettings();
    const setting = settings.find(s => s.key === "useCustomApi");
    cachedUseCustomApi = setting?.value === "true";
    return cachedUseCustomApi;
  } catch {
    return false;
  }
}

export function resetCustomApiCache() {
  cachedUseCustomApi = null;
}

export function getProvider(forceCustom?: boolean): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "openai";
  if (provider !== "openai") {
    throw new Error(`AI_PROVIDER ${provider} not implemented yet`);
  }
  
  const useCustom = forceCustom ?? false;
  // Custom API uses OPENAI_API_KEY directly (bypassing Replit AI Integrations)
  const directApiKey = process.env.OPENAI_API_KEY;
  
  // For chat: use direct key if custom mode enabled, otherwise Replit AI Integrations
  let chatApiKey: string | undefined;
  let chatBaseUrl: string | undefined;
  
  if (useCustom && directApiKey) {
    chatApiKey = directApiKey;
    chatBaseUrl = undefined; // Direct OpenAI API
    console.log("[AIProvider] Using direct OpenAI API key (custom mode)");
  } else {
    chatApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    chatBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    console.log("[AIProvider] Using Replit AI Integrations");
  }
  
  // For embeddings: always use direct OpenAI API key
  const embedApiKey = process.env.OPENAI_API_KEY;
  
  if (!chatApiKey) {
    throw new Error("OpenAI API key not configured");
  }
  
  // Chat client
  const chatClient = new OpenAI({ 
    apiKey: chatApiKey,
    baseURL: chatBaseUrl,
  });
  
  // Embed client uses direct OpenAI API
  const embedClient = embedApiKey ? new OpenAI({ apiKey: embedApiKey }) : null;

  return {
    async embed(texts: string[]) {
      if (!embedClient) {
        throw new Error("OPENAI_API_KEY required for embeddings (Replit AI Integrations doesn't support embeddings API)");
      }
      const model = process.env.AI_EMBED_MODEL ?? "text-embedding-3-large";
      const res = await embedClient.embeddings.create({
        model,
        input: texts,
      });
      return res.data.map(d => d.embedding as unknown as number[]);
    },
    async chat({ model, messages, temperature }) {
      const res = await chatClient.chat.completions.create({
        model,
        messages,
        temperature: temperature ?? 0.7,
      });
      return res.choices[0]?.message?.content ?? "";
    },
  };
}

export async function getProviderWithSettings(): Promise<AIProvider> {
  const useCustom = await checkUseCustomApi();
  return getProvider(useCustom);
}
