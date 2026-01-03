import OpenAI from "openai";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface AIProvider {
  embed(texts: string[]): Promise<number[][]>;
  chat(opts: { model: string; messages: ChatMessage[]; temperature?: number }): Promise<string>;
}

export function getProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "openai";
  if (provider !== "openai") {
    throw new Error(`AI_PROVIDER ${provider} not implemented yet`);
  }
  
  // For chat: use Replit AI Integrations (baseURL + dummy key)
  const chatApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const chatBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  
  // For embeddings: MUST use real OpenAI API key (Replit Integrations doesn't support embeddings)
  const embedApiKey = process.env.OPENAI_API_KEY;
  
  if (!chatApiKey) {
    throw new Error("OpenAI API key not configured");
  }
  
  // Chat client uses Replit AI Integrations if available
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
