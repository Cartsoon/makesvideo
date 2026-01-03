import { Router } from "express";
import { getProviderWithSettings } from "../ai/provider";
import { ragRetrieve, formatRagContext } from "../ai/rag";
import { MASTER_SYSTEM_PROMPT, buildDeveloperPrompt } from "../ai/prompts";
import { db } from "../db";
import { aiConversations, aiMessages, aiMessageFeedback } from "@shared/schema";

export const aiRouter = Router();

aiRouter.post("/chat", async (req, res) => {
  try {
    const { conversationId, userId, message, mode, platform } = req.body ?? {};
    if (!message) return res.status(400).json({ error: "message required" });

    const convId = conversationId
      ? String(conversationId)
      : (await db.insert(aiConversations).values({ userId: userId ?? null }).returning({ id: aiConversations.id }))[0].id;

    await db.insert(aiMessages).values({ conversationId: convId, role: "user", content: String(message) });

    const topK = Number(process.env.RAG_TOP_K ?? 8);
    const hits = await ragRetrieve(String(message), topK);
    const ragContext = formatRagContext(hits);

    const provider = await getProviderWithSettings();
    const model = process.env.AI_CHAT_MODEL ?? "gpt-4o-mini";

    const system = MASTER_SYSTEM_PROMPT;
    const dev = buildDeveloperPrompt({ mode, platform });

    const reply = await provider.chat({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "system", content: dev },
        ...(ragContext ? [{ role: "system" as const, content: ragContext }] : []),
        { role: "user", content: String(message) },
      ],
    });

    const saved = (await db.insert(aiMessages).values({ conversationId: convId, role: "assistant", content: reply }).returning({ id: aiMessages.id }))[0];

    return res.json({
      conversationId: convId,
      messageId: saved.id,
      answer: reply,
      ragHits: hits.map(h => ({ score: h.score, preview: h.content.slice(0, 140) + "..." })),
    });
  } catch (err) {
    console.error("[AI Chat Error]", err);
    return res.status(500).json({ error: "AI chat failed" });
  }
});

aiRouter.post("/feedback", async (req, res) => {
  try {
    const { messageId, userId, rating, reason } = req.body ?? {};
    if (!messageId || ![1, -1].includes(Number(rating))) {
      return res.status(400).json({ error: "messageId and rating(1|-1) required" });
    }
    await db.insert(aiMessageFeedback).values({
      messageId: String(messageId),
      userId: userId ?? null,
      rating: Number(rating),
      reason: reason ? String(reason) : null,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[AI Feedback Error]", err);
    return res.status(500).json({ error: "Feedback save failed" });
  }
});
