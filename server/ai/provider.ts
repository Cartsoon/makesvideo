import OpenAI from "openai";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface AIProvider {
  embed(texts: string[]): Promise<number[][]>;
  chat(opts: { model: string; messages: ChatMessage[]; temperature?: number }): Promise<string>;
}

export function resetCustomApiCache() {
  // No-op, kept for compatibility
}

export async function checkUseCustomApi(): Promise<boolean> {
  return true; // Always use custom API
}

function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  console.log(`[AIProvider] Using API with base URL: ${baseURL}`);
  
  return new OpenAI({ apiKey, baseURL });
}

export function getProvider(): AIProvider {
  const client = createOpenAIClient();

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

export async function getProviderWithSettings(): Promise<AIProvider> {
  return getProvider();
}

export async function getOpenAIClientWithSettings(): Promise<OpenAI> {
  return createOpenAIClient();
}
