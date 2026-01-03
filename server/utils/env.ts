export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  const num = Number(value);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return num;
}

export const AI_CONFIG = {
  provider: () => getEnv("AI_PROVIDER", "openai"),
  chatModel: () => getEnv("AI_CHAT_MODEL", "gpt-4o-mini"),
  embedModel: () => getEnv("AI_EMBED_MODEL", "text-embedding-3-large"),
  ragTopK: () => getEnvNumber("RAG_TOP_K", 8),
  ragMinScore: () => getEnvNumber("RAG_MIN_SCORE", 0.2),
};
