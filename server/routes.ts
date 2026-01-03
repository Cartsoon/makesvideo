import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { startJobWorker } from "./job-worker";
import { ensureProviderInitialized } from "./providers";
import { insertSourceSchema, insertTopicSchema, insertScriptSchema, updateScriptSchema, insertJobSchema } from "@shared/schema";
import type { StylePreset, Duration, JobKind } from "@shared/schema";
import { EdgeTTS, listVoices } from "edge-tts-universal";
import OpenAI from "openai";
import express from "express";
import path from "path";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Initialize the LLM provider based on saved settings
  await ensureProviderInitialized();
  
  // Start the job worker
  startJobWorker();
  
  // Serve static files from public/files directory
  app.use("/files", express.static(path.join(process.cwd(), "public/files")));

  // ============ SOURCES ============

  app.get("/api/sources", async (req, res) => {
    try {
      const sources = await storage.getSources();
      res.json(sources);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sources" });
    }
  });

  app.get("/api/sources/:id", async (req, res) => {
    try {
      const source = await storage.getSource(req.params.id);
      if (!source) {
        return res.status(404).json({ error: "Source not found" });
      }
      res.json(source);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch source" });
    }
  });

  app.post("/api/sources", async (req, res) => {
    try {
      const parsed = insertSourceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid source data", details: parsed.error.errors });
      }
      const source = await storage.createSource(parsed.data);
      res.status(201).json(source);
    } catch (error) {
      res.status(500).json({ error: "Failed to create source" });
    }
  });

  app.patch("/api/sources/:id", async (req, res) => {
    try {
      const source = await storage.updateSource(req.params.id, req.body);
      if (!source) {
        return res.status(404).json({ error: "Source not found" });
      }
      res.json(source);
    } catch (error) {
      res.status(500).json({ error: "Failed to update source" });
    }
  });

  app.delete("/api/sources/:id", async (req, res) => {
    try {
      // Delete in order: scripts → topics → source (to respect FK constraints)
      await storage.deleteScriptsBySourceId(req.params.id);
      await storage.deleteTopicsBySourceId(req.params.id);
      
      const deleted = await storage.deleteSource(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Source not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete source:", error);
      res.status(500).json({ error: "Failed to delete source" });
    }
  });

  // Check source health (test if RSS feed is accessible)
  app.post("/api/sources/:id/check", async (req, res) => {
    try {
      const source = await storage.getSource(req.params.id);
      if (!source) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      if (!source.config.url) {
        return res.json({ healthy: false, error: "No URL configured", itemCount: 0 });
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      try {
        const response = await fetch(source.config.url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; IDEngine/1.0; +https://idengine.app)',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*'
          }
        });
        clearTimeout(timeout);
        
        if (!response.ok) {
          return res.json({ healthy: false, error: `HTTP ${response.status}`, itemCount: 0 });
        }
        
        const xml = await response.text();
        
        // Quick check for RSS/Atom content
        const hasRssItems = /<item[^>]*>/i.test(xml);
        const hasAtomEntries = /<entry[^>]*>/i.test(xml);
        
        if (!hasRssItems && !hasAtomEntries) {
          return res.json({ healthy: false, error: "No RSS items found", itemCount: 0 });
        }
        
        // Count items
        const rssCount = (xml.match(/<item[^>]*>/gi) || []).length;
        const atomCount = (xml.match(/<entry[^>]*>/gi) || []).length;
        const itemCount = Math.max(rssCount, atomCount);
        
        return res.json({ healthy: true, itemCount });
      } catch (fetchError: any) {
        clearTimeout(timeout);
        const errorMessage = fetchError.name === 'AbortError' ? 'Timeout' : fetchError.message;
        return res.json({ healthy: false, error: errorMessage, itemCount: 0 });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to check source" });
    }
  });

  // Bulk check sources health
  app.post("/api/sources/check-all", async (req, res) => {
    try {
      const sources = await storage.getSources();
      const results: Record<string, { healthy: boolean; error?: string; itemCount: number }> = {};
      
      // Check all sources in parallel with timeout
      const checks = sources.map(async (source) => {
        if (!source.config.url) {
          results[source.id] = { healthy: false, error: "No URL", itemCount: 0 };
          return;
        }
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        try {
          const response = await fetch(source.config.url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; IDEngine/1.0; +https://idengine.app)',
              'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            }
          });
          clearTimeout(timeout);
          
          if (!response.ok) {
            results[source.id] = { healthy: false, error: `HTTP ${response.status}`, itemCount: 0 };
            return;
          }
          
          const xml = await response.text();
          const rssCount = (xml.match(/<item[^>]*>/gi) || []).length;
          const atomCount = (xml.match(/<entry[^>]*>/gi) || []).length;
          const itemCount = Math.max(rssCount, atomCount);
          
          results[source.id] = { healthy: itemCount > 0, itemCount, error: itemCount === 0 ? 'No items' : undefined };
        } catch (fetchError: any) {
          clearTimeout(timeout);
          results[source.id] = { 
            healthy: false, 
            error: fetchError.name === 'AbortError' ? 'Timeout' : 'Connection failed',
            itemCount: 0 
          };
        }
      });
      
      await Promise.all(checks);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to check sources" });
    }
  });

  // Seed sources from preset data
  app.post("/api/sources/seed", async (req, res) => {
    try {
      const { seedSources, getSourceStats } = await import("./source-seeder");
      const result = await seedSources();
      const stats = await getSourceStats();
      res.json({ ...result, stats });
    } catch (error) {
      console.error("Seeder error:", error);
      res.status(500).json({ error: "Failed to seed sources" });
    }
  });

  // Get source statistics by category
  app.get("/api/sources/stats", async (req, res) => {
    try {
      const { getSourceStats } = await import("./source-seeder");
      const stats = await getSourceStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to get source stats" });
    }
  });

  // Get sources by category
  app.get("/api/sources/category/:categoryId", async (req, res) => {
    try {
      const categoryId = req.params.categoryId as any;
      const sources = await storage.getSourcesByCategory(categoryId);
      res.json(sources);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sources by category" });
    }
  });

  // Enhanced health check for single source (updates health status in storage)
  app.post("/api/sources/:id/health-check", async (req, res) => {
    try {
      const { checkSingleSource } = await import("./health-check");
      const result = await checkSingleSource(req.params.id);
      if (!result) {
        return res.status(404).json({ error: "Source not found" });
      }
      res.json({ source: result.source, result: result.result });
    } catch (error) {
      console.error("Health check error:", error);
      res.status(500).json({ error: "Failed to check source health" });
    }
  });

  // Batch health check for all enabled sources
  app.post("/api/sources/health-check-all", async (req, res) => {
    try {
      const { checkAllSources } = await import("./health-check");
      const result = await checkAllSources();
      res.json(result);
    } catch (error) {
      console.error("Batch health check error:", error);
      res.status(500).json({ error: "Failed to check all sources" });
    }
  });

  // Get category health statistics
  app.get("/api/sources/health-stats", async (req, res) => {
    try {
      const { getCategoryHealthStats } = await import("./health-check");
      const stats = await getCategoryHealthStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to get health stats" });
    }
  });

  // Get sources that need attention (warning or dead status)
  app.get("/api/sources/needs-attention", async (req, res) => {
    try {
      const { getSourcesNeedingAttention } = await import("./health-check");
      const sources = await getSourcesNeedingAttention();
      res.json(sources);
    } catch (error) {
      res.status(500).json({ error: "Failed to get sources needing attention" });
    }
  });

  // ============ TOPICS ============

  app.get("/api/topics", async (req, res) => {
    try {
      const topics = await storage.getTopics();
      res.json(topics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch topics" });
    }
  });

  app.get("/api/topics/:id", async (req, res) => {
    try {
      const topic = await storage.getTopic(req.params.id);
      if (!topic) {
        return res.status(404).json({ error: "Topic not found" });
      }
      res.json(topic);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch topic" });
    }
  });

  app.post("/api/topics", async (req, res) => {
    try {
      const parsed = insertTopicSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid topic data", details: parsed.error.errors });
      }
      const topic = await storage.createTopic(parsed.data);
      res.status(201).json(topic);
    } catch (error) {
      res.status(500).json({ error: "Failed to create topic" });
    }
  });

  app.patch("/api/topics/:id", async (req, res) => {
    try {
      const topic = await storage.updateTopic(req.params.id, req.body);
      if (!topic) {
        return res.status(404).json({ error: "Topic not found" });
      }
      res.json(topic);
    } catch (error) {
      res.status(500).json({ error: "Failed to update topic" });
    }
  });

  // Select topic and create script
  app.post("/api/topics/:id/select", async (req, res) => {
    try {
      const topic = await storage.getTopic(req.params.id);
      if (!topic) {
        return res.status(404).json({ error: "Topic not found" });
      }

      // Get default settings
      const durationSetting = await storage.getSetting("defaultDuration");
      const styleSetting = await storage.getSetting("defaultStylePreset");

      // Create script
      const script = await storage.createScript({
        topicId: topic.id,
        language: topic.language,
        durationSec: (durationSetting?.value as Duration) || "30",
        stylePreset: (styleSetting?.value as StylePreset) || "cinematic",
        voiceStylePreset: (styleSetting?.value as StylePreset) || "cinematic",
      });

      // Update topic status
      await storage.updateTopic(req.params.id, { status: "selected" });

      res.status(201).json({ topic, script, scriptId: script.id });
    } catch (error) {
      res.status(500).json({ error: "Failed to select topic" });
    }
  });

  app.delete("/api/topics/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTopic(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Topic not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete topic" });
    }
  });

  // ============ SCRIPTS ============

  app.get("/api/scripts", async (req, res) => {
    try {
      const scripts = await storage.getScripts();
      res.json(scripts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scripts" });
    }
  });

  app.get("/api/scripts/:id", async (req, res) => {
    try {
      const script = await storage.getScript(req.params.id);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }
      res.json(script);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch script" });
    }
  });

  app.post("/api/scripts", async (req, res) => {
    try {
      const parsed = insertScriptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid script data", details: parsed.error.errors });
      }
      const script = await storage.createScript(parsed.data);
      res.status(201).json(script);
    } catch (error) {
      res.status(500).json({ error: "Failed to create script" });
    }
  });

  app.patch("/api/scripts/:id", async (req, res) => {
    try {
      const parsed = updateScriptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid script data", details: parsed.error.errors });
      }
      const script = await storage.updateScript(req.params.id, parsed.data);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }
      res.json(script);
    } catch (error) {
      res.status(500).json({ error: "Failed to update script" });
    }
  });

  app.delete("/api/scripts/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteScript(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Script not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete script" });
    }
  });

  // Export script as ZIP (placeholder - returns JSON for now)
  app.post("/api/scripts/:id/export", async (req, res) => {
    try {
      const script = await storage.getScript(req.params.id);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }

      const topic = await storage.getTopic(script.topicId);

      // Create export job
      const job = await storage.createJob({
        kind: "export_package",
        payload: { scriptId: req.params.id },
      });

      res.json({ 
        message: "Export started", 
        jobId: job.id,
        downloadUrl: `/api/scripts/${req.params.id}/download`
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to start export" });
    }
  });

  // Download exported package as ZIP
  app.get("/api/scripts/:id/download", async (req, res) => {
    try {
      const script = await storage.getScript(req.params.id);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }

      const topic = await storage.getTopic(script.topicId);
      const archiver = require('archiver');

      const archive = archiver('zip', { zlib: { level: 9 } });
      
      archive.on('error', (err: Error) => {
        console.error('Archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to create archive" });
        }
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="idengine-export-${script.id}.zip"`);
      
      archive.pipe(res);

      const meta = {
        id: script.id,
        topic: topic?.title || "Unknown",
        source: topic?.sourceId || "Unknown",
        style: script.stylePreset,
        voiceStyle: script.voiceStylePreset,
        duration: script.durationSec,
        language: script.language,
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const readme = `# IDENGINE Export Package

## Topic
${topic?.title || "Unknown"}

## Duration
${script.durationSec} seconds

## Style
${script.stylePreset}

## Language
${script.language === 'ru' ? 'Russian' : 'English'}

## Package Contents

### Text Files
- **hook.txt** - Opening hook/attention grabber
- **voiceover.txt** - Full voice script for narration
- **onscreen.txt** - On-screen text/captions

### Data Files
- **storyboard.json** - Scene-by-scene visual breakdown with stock keywords
- **music.json** - Music recommendations (mood, BPM, genre, free tracks)
- **meta.json** - Package metadata

## Production Workflow

1. **Hook**: Use hook.txt as your opening line (first 3 seconds)
2. **Voiceover**: Record narration from voiceover.txt
3. **Visuals**: Follow storyboard.json for scene timing and stock footage keywords
4. **Text**: Add on-screen text from onscreen.txt at appropriate moments
5. **Music**: Find background music matching the mood/BPM in music.json
6. **Export**: Render at 9:16 aspect ratio for Shorts/Reels/TikTok

## Stock Footage Keywords
${script.storyboard?.map((s, i) => `Scene ${i + 1}: ${s.stockKeywords?.join(', ') || 'N/A'}`).join('\n') || 'No storyboard available'}

## Free Music Suggestions
${script.music?.freeTrackSuggestions?.map(t => `- ${t.name} by ${t.artist} (${t.source})`).join('\n') || 'Generate music recommendations first'}

---
Generated by IDENGINE Shorts Factory
`;

      archive.append(readme, { name: 'README.md' });
      archive.append(JSON.stringify(meta, null, 2), { name: 'meta.json' });
      archive.append(script.hook || '', { name: 'hook.txt' });
      archive.append(script.voiceText || '', { name: 'voiceover.txt' });
      archive.append(script.onScreenText || '', { name: 'onscreen.txt' });
      
      if (script.storyboard && Array.isArray(script.storyboard)) {
        const storyboardData = script.storyboard.map((scene, idx) => ({
          sceneNumber: scene.sceneNumber || idx + 1,
          visual: scene.visual || '',
          onScreenText: scene.onScreenText || '',
          durationHint: scene.durationHint || '3s',
          stockKeywords: Array.isArray(scene.stockKeywords) ? scene.stockKeywords : [],
          sfx: scene.sfx || '',
        }));
        archive.append(JSON.stringify(storyboardData, null, 2), { name: 'storyboard.json' });

        let edlContent = `TITLE: ${topic?.title || 'IDENGINE Export'}\nFCM: NON-DROP FRAME\n\n`;
        let timecode = 0;
        script.storyboard.forEach((scene, idx) => {
          const durationHint = scene.durationHint || '3s';
          const durationMatch = durationHint.match(/(\d+)/);
          const duration = durationMatch ? parseInt(durationMatch[1]) : 3;
          const startTC = formatTimecode(timecode);
          const endTC = formatTimecode(timecode + duration);
          edlContent += `${String(idx + 1).padStart(3, '0')}  AX       V     C        ${startTC} ${endTC} ${startTC} ${endTC}\n`;
          edlContent += `* FROM CLIP NAME: Scene_${idx + 1}\n`;
          const visualComment = scene.visual ? scene.visual.substring(0, 60) : 'Visual';
          edlContent += `* COMMENT: ${visualComment}\n`;
          const keywords = Array.isArray(scene.stockKeywords) ? scene.stockKeywords : [];
          if (keywords.length > 0) {
            edlContent += `* KEYWORDS: ${keywords.join(', ')}\n`;
          }
          edlContent += `\n`;
          timecode += duration;
        });
        archive.append(edlContent, { name: 'timeline.edl' });
      }

      if (script.music) {
        archive.append(JSON.stringify(script.music, null, 2), { name: 'music.json' });
      }

      archive.finalize();
    } catch (error) {
      console.error('Export error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to download export" });
      }
    }
  });

  function formatTimecode(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = 0;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  }

  // ============ JOBS ============

  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await storage.getJobs();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  app.post("/api/jobs", async (req, res) => {
    try {
      const parsed = insertJobSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid job data", details: parsed.error.errors });
      }
      const job = await storage.createJob(parsed.data);
      res.status(201).json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to create job" });
    }
  });

  // ============ SETTINGS ============

  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      // Mask API keys
      const masked = settings.map(s => ({
        ...s,
        value: s.key.toLowerCase().includes("apikey") || s.key.toLowerCase().includes("api_key")
          ? s.value ? "***" + s.value.slice(-4) : ""
          : s.value
      }));
      res.json(masked);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const { 
        aiProvider,
        openrouterApiKey, 
        groqApiKey,
        togetherApiKey,
        defaultModel, 
        groqModel,
        togetherModel,
        defaultDuration, 
        defaultStylePreset, 
        fallbackMode 
      } = req.body;
      
      // Provider selection
      if (aiProvider !== undefined) {
        await storage.setSetting("aiProvider", aiProvider);
      }
      
      // OpenRouter settings
      if (openrouterApiKey !== undefined) {
        await storage.setSetting("openrouterApiKey", openrouterApiKey);
      }
      if (defaultModel !== undefined) {
        await storage.setSetting("defaultModel", defaultModel);
      }
      
      // Groq settings
      if (groqApiKey !== undefined) {
        await storage.setSetting("groqApiKey", groqApiKey);
      }
      if (groqModel !== undefined) {
        await storage.setSetting("groqModel", groqModel);
      }
      
      // Together AI settings
      if (togetherApiKey !== undefined) {
        await storage.setSetting("togetherApiKey", togetherApiKey);
      }
      if (togetherModel !== undefined) {
        await storage.setSetting("togetherModel", togetherModel);
      }
      
      // General settings
      if (defaultDuration !== undefined) {
        await storage.setSetting("defaultDuration", defaultDuration);
      }
      if (defaultStylePreset !== undefined) {
        await storage.setSetting("defaultStylePreset", defaultStylePreset);
      }
      if (fallbackMode !== undefined) {
        await storage.setSetting("fallbackMode", String(fallbackMode));
      }

      // Refresh the LLM provider with new settings
      const { refreshLLMProvider } = await import("./providers");
      await refreshLLMProvider();

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to save settings:", error);
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  app.post("/api/settings/test", async (req, res) => {
    try {
      const { apiKey, model, provider } = req.body;
      
      if (!apiKey) {
        return res.status(400).json({ error: "API key is required" });
      }

      // Test the actual API connection
      const providerUrls: Record<string, string> = {
        openrouter: "https://openrouter.ai/api/v1/models",
        groq: "https://api.groq.com/openai/v1/models",
        together: "https://api.together.xyz/v1/models"
      };

      const url = providerUrls[provider || "openrouter"];
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${apiKey}`
      };
      
      if (provider === "openrouter" || !provider) {
        headers["HTTP-Referer"] = "https://idengine.repl.co";
      }

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        const error = await response.text();
        console.error("API test failed:", error);
        return res.status(400).json({ error: "Invalid API key or connection failed" });
      }

      res.json({ success: true, message: "Connection successful" });
    } catch (error) {
      console.error("Connection test error:", error);
      res.status(500).json({ error: "Connection test failed" });
    }
  });

  // ============ THESES GENERATION ============
  // TODO: Implement theses generation when providers module has these functions

  // ============ TEXT TO VIDEO GENERATION ============
  
  // Helper function to safely parse JSON from LLM responses
  function safeJsonParse<T>(raw: string, fallback: T): T {
    try {
      // Remove markdown code fences and extra whitespace
      let cleaned = raw
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/gi, "")
        .replace(/^\s*[\r\n]+/g, "")
        .trim();
      
      // Try to extract JSON object or array from the response
      const jsonMatch = cleaned.match(/[\[\{][\s\S]*[\]\}]/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }
      
      const parsed = JSON.parse(cleaned);
      
      // Check if it's a fallback response from the provider
      if (parsed && parsed.fallback === true) {
        return fallback;
      }
      
      return parsed;
    } catch (e) {
      console.log("[safeJsonParse] Parse failed, using fallback:", e);
      return fallback;
    }
  }
  
  app.post("/api/generate/text-to-video", async (req, res) => {
    try {
      const { text, language, style, duration } = req.body;
      
      if (!text || text.length < 50) {
        return res.status(400).json({ error: "Text must be at least 50 characters" });
      }
      
      // Check if API key is configured - text-to-video requires real AI
      const settings = await storage.getSettings();
      const settingsMap = new Map(settings.map((s: { key: string; value: string }) => [s.key, s.value]));
      const apiKey = process.env.OPENROUTER_API_KEY || settingsMap.get("openrouterApiKey");
      const fallbackMode = settingsMap.get("fallbackMode") === "true";
      
      if (!apiKey || fallbackMode) {
        const errorMsg = language === "ru" 
          ? "Для генерации сценария нужен API ключ. Укажите ключ OpenRouter (бесплатный) в Настройках."
          : "API key required for script generation. Set OpenRouter API key (free) in Settings.";
        return res.status(400).json({ 
          error: errorMsg,
          code: "API_KEY_REQUIRED"
        });
      }
      
      console.log(`[TextToVideo] Generating for ${text.length} chars, style: ${style}, duration: ${duration}s`);
      
      const { createLLMProvider } = await import("./providers");
      const provider = await createLLMProvider();
      
      // Calculate target word counts based on duration
      const wordsPerSecond = 2.5;
      const targetWords = Math.round(duration * wordsPerSecond);
      // Dynamic scenes: 3-7 seconds each, average 4.5s for more dynamic pacing
      const sceneCount = Math.max(6, Math.min(60, Math.round(duration / 4.5)));
      
      // Analyze the input text
      const analysisPrompt = language === "ru"
        ? `Проанализируй текст и верни JSON:
{
  "keyFacts": ["факт1", "факт2", ...],
  "missingInfo": ["что не хватает для полноценного сценария"],
  "suggestions": ["предложения по улучшению"]
}
Если текст достаточно полный - missingInfo и suggestions могут быть пустыми массивами.
Только JSON, без markdown.`
        : `Analyze the text and return JSON:
{
  "keyFacts": ["fact1", "fact2", ...],
  "missingInfo": ["what's missing for a complete script"],
  "suggestions": ["suggestions for improvement"]
}
If text is complete - missingInfo and suggestions can be empty arrays.
Only JSON, no markdown.`;
      
      // Generate SEO title
      const seoPrompt = language === "ru"
        ? `На основе текста создай:
1. SEO-заголовок для YouTube Shorts (40-60 символов, цепляющий, без кликбейта)
2. 10 релевантных хештегов

Верни JSON:
{
  "seoTitle": "Заголовок",
  "hashtags": ["#хештег1", "#хештег2", ...]
}
Только JSON.`
        : `Based on the text create:
1. SEO title for YouTube Shorts (40-60 characters, catchy, no clickbait)
2. 10 relevant hashtags

Return JSON:
{
  "seoTitle": "Title",
  "hashtags": ["#hashtag1", "#hashtag2", ...]
}
Only JSON.`;

      // Generate full script
      const scriptPrompt = language === "ru"
        ? `Напиши сценарий для ${duration}-секундного видео. Стиль: ${style}.
Целевая длина: ${targetWords} слов закадрового текста.

Формат сценария:
[СЦЕНА 1: Описание кадра]
*Голос: Текст закадрового голоса*
— "Прямая речь если есть"

[СЦЕНА 2: Описание кадра]
*Голос: Текст закадрового голоса*

И так далее. Используй ${sceneCount} сцен.
Сделай сценарий живым, человечным, без канцелярита.`
        : `Write a script for a ${duration}-second video. Style: ${style}.
Target length: ${targetWords} words of voiceover.

Script format:
[SCENE 1: Shot description]
*Voice: Voiceover text*
— "Direct speech if any"

[SCENE 2: Shot description]
*Voice: Voiceover text*

And so on. Use ${sceneCount} scenes.
Make the script lively, human, avoid corporate speak.`;

      // Generate voiceover with timecodes
      const voiceoverPrompt = language === "ru"
        ? `Извлеки только закадровый голос из сценария с таймкодами.
Общая длительность: ${duration} секунд.

Верни JSON массив:
[
  {"timecode": "00:00-00:03", "text": "Текст первого куска"},
  {"timecode": "00:03-00:08", "text": "Текст второго куска"},
  ...
]
Каждый кусок 3-8 секунд. Таймкоды должны покрыть всё время видео.
Только JSON массив.`
        : `Extract only voiceover from the script with timecodes.
Total duration: ${duration} seconds.

Return JSON array:
[
  {"timecode": "00:00-00:03", "text": "First chunk text"},
  {"timecode": "00:03-00:08", "text": "Second chunk text"},
  ...
]
Each chunk 3-8 seconds. Timecodes must cover entire video.
Only JSON array.`;

      // Generate storyboard with dynamic 3-7 second scenes
      const storyboardPrompt = language === "ru"
        ? `Создай ДИНАМИЧНУЮ раскадровку для ${duration}-секундного видео. ${sceneCount} сцен.
ВАЖНО: Каждая сцена должна быть 3-7 секунд (в среднем 4-5 секунд). НЕ делай длинные 10-секундные сцены!
Видео должно быть динамичным с быстрой сменой кадров.

Верни JSON массив:
[
  {
    "sceneNumber": 1,
    "visual": "Описание кадра",
    "onScreenText": "Текст на экране 1-3 слова",
    "sfx": "Звуковой эффект",
    "durationHint": "4s",
    "stockKeywords": ["ключевое", "слово", "для стока"],
    "aiPrompt": "English prompt for AI video generation"
  },
  ...
]
Распредели время равномерно: сцены по 3-7 секунд. Только JSON массив.`
        : `Create DYNAMIC storyboard for ${duration}-second video. ${sceneCount} scenes.
IMPORTANT: Each scene must be 3-7 seconds (average 4-5 seconds). DO NOT make long 10-second scenes!
Video should be dynamic with fast-paced cuts.

Return JSON array:
[
  {
    "sceneNumber": 1,
    "visual": "Shot description",
    "onScreenText": "On-screen text 1-3 words",
    "sfx": "Sound effect",
    "durationHint": "4s",
    "stockKeywords": ["keyword", "for", "stock"],
    "aiPrompt": "English prompt for AI video generation"
  },
  ...
]
Distribute time evenly: scenes 3-7 seconds each. Only JSON array.`;

      // Make parallel calls to generate all content
      const [analysisResult, seoResult, scriptResult] = await Promise.all([
        provider.generateRaw(analysisPrompt, text.slice(0, 3000), 800),
        provider.generateRaw(seoPrompt, text.slice(0, 2000), 500),
        provider.generateRaw(scriptPrompt, text.slice(0, 3000), 2000)
      ]);

      // Parse results using safe helper
      const defaultAnalysis = { keyFacts: [] as string[], missingInfo: [] as string[], suggestions: [] as string[] };
      const defaultSeo = { seoTitle: language === "ru" ? "Видео по тексту" : "Video from text", hashtags: ["#shorts", "#viral", "#trending", "#fyp", "#content"] };
      
      const analysis = safeJsonParse(analysisResult, defaultAnalysis);
      const seo = safeJsonParse(seoResult, defaultSeo);

      // Generate voiceover and storyboard from script
      const [voiceoverResult, storyboardResult] = await Promise.all([
        provider.generateRaw(voiceoverPrompt, scriptResult.slice(0, 2000), 1000),
        provider.generateRaw(storyboardPrompt, scriptResult.slice(0, 2000), 2000)
      ]);

      // Default voiceover fallback
      const defaultVoiceover = [{ 
        timecode: `00:00-00:${Math.min(duration, 30).toString().padStart(2, '0')}`, 
        text: language === "ru" ? "Сценарий будет сгенерирован при наличии API ключа" : "Script will be generated when API key is configured"
      }];
      
      // Default storyboard fallback with 3-7s dynamic scenes
      const defaultStoryboard = Array.from({ length: sceneCount }, (_, i) => {
        // Vary scene duration between 3-7s for dynamic pacing
        const baseDuration = duration / sceneCount;
        const sceneDuration = Math.max(3, Math.min(7, Math.round(baseDuration)));
        return {
          sceneNumber: i + 1,
          visual: language === "ru" ? `Сцена ${i + 1}` : `Scene ${i + 1}`,
          onScreenText: "",
          sfx: "",
          durationHint: `${sceneDuration}s`,
          stockKeywords: [],
          aiPrompt: ""
        };
      });
      
      let voiceover = safeJsonParse(voiceoverResult, defaultVoiceover);
      let storyboard = safeJsonParse(storyboardResult, defaultStoryboard);
      
      // Additional fallback: if voiceover is empty, try to extract from script
      if (!Array.isArray(voiceover) || voiceover.length === 0) {
        const lines = scriptResult.split('\n').filter((l: string) => l.includes('*Голос:') || l.includes('*Voice:') || l.includes('*'));
        const timePerLine = duration / Math.max(lines.length, 1);
        if (lines.length > 0) {
          voiceover = lines.slice(0, 10).map((line: string, i: number) => ({
            timecode: `${Math.floor(i * timePerLine / 60).toString().padStart(2, '0')}:${Math.floor((i * timePerLine) % 60).toString().padStart(2, '0')}-${Math.floor((i + 1) * timePerLine / 60).toString().padStart(2, '0')}:${Math.floor(((i + 1) * timePerLine) % 60).toString().padStart(2, '0')}`,
            text: line.replace(/\*Голос:|Voice:/g, '').replace(/\*/g, '').trim()
          })).filter(v => v.text.length > 0);
        }
        if (voiceover.length === 0) {
          voiceover = defaultVoiceover;
        }
      }
      
      // Ensure storyboard is an array - try to extract from script if parsing failed
      if (!Array.isArray(storyboard) || storyboard.length === 0) {
        // Try to extract scenes from script text
        const sceneMatches = scriptResult.match(/\[СЦЕНА?\s*\d+[:\s].*?\]|\[SCENE\s*\d+[:\s].*?\]/gi) || [];
        if (sceneMatches.length > 0) {
          const sceneDuration = Math.max(3, Math.min(7, Math.round(duration / sceneMatches.length)));
          storyboard = sceneMatches.map((match: string, i: number) => {
            const visualDesc = match.replace(/\[СЦЕНА?\s*\d+[:\s]?|\[SCENE\s*\d+[:\s]?|\]/gi, '').trim();
            return {
              sceneNumber: i + 1,
              visual: visualDesc || (language === "ru" ? `Кадр ${i + 1}` : `Shot ${i + 1}`),
              onScreenText: "",
              sfx: i === 0 ? (language === "ru" ? "Интро звук" : "Intro sound") : "",
              durationHint: `${sceneDuration}s`,
              stockKeywords: visualDesc.split(/\s+/).slice(0, 3),
              aiPrompt: visualDesc
            };
          });
        } else {
          storyboard = defaultStoryboard;
        }
      }
      
      // Ensure each storyboard item has required fields
      storyboard = storyboard.map((s: any, i: number) => ({
        sceneNumber: s.sceneNumber || i + 1,
        visual: s.visual || (language === "ru" ? `Кадр ${i + 1}` : `Shot ${i + 1}`),
        onScreenText: s.onScreenText || "",
        sfx: s.sfx || "",
        durationHint: s.durationHint || "5s",
        stockKeywords: s.stockKeywords || [],
        aiPrompt: s.aiPrompt || s.visual || ""
      }));

      // Save as Script entity for "Recent Scripts" list
      let savedScriptId: string | null = null;
      try {
        // Create or get synthetic "text-to-video" topic
        const syntheticTopicTitle = language === "ru" ? "Текст в Видео" : "Text to Video";
        let syntheticTopic = (await storage.getTopics()).find(t => t.title === "__text_to_video__");
        
        if (!syntheticTopic) {
          // Create a synthetic source first if needed
          const sources = await storage.getSources();
          let syntheticSource = sources.find(s => s.name === "__text_to_video_source__");
          if (!syntheticSource) {
            syntheticSource = await storage.createSource({
              name: "__text_to_video_source__",
              type: "manual",
              config: {},
              categoryId: "memes",
              priority: 1,
              isEnabled: true,
            });
          }
          
          syntheticTopic = await storage.createTopic({
            sourceId: syntheticSource.id,
            title: "__text_to_video__",
            generatedTitle: syntheticTopicTitle,
            url: null,
            rawText: null,
            language: language || "ru",
            score: 100,
            status: "selected",
            extractionStatus: "done",
          });
        }
        
        // Convert voiceover to transcriptRich format with required 'type' field
        const transcriptRich = {
          segments: voiceover.map((v: { timecode: string; text: string }) => {
            const [start, end] = v.timecode.split("-").map((t: string) => {
              const [min, sec] = t.split(":").map(Number);
              return min * 60 + (sec || 0);
            });
            return {
              type: "speaker" as const,
              text: v.text,
              duration: (end - start) || 5,
            };
          }),
        };
        
        // Create the script
        const savedScript = await storage.createScript({
          topicId: syntheticTopic.id,
          displayName: seo.seoTitle || (language === "ru" ? "Видео по тексту" : "Video from text"),
          language: language || "ru",
          durationSec: String(duration) as any,
          stylePreset: style || "news",
          voiceStylePreset: style || "news",
          accent: "classic",
          platform: "youtube_shorts",
          keywords: seo.hashtags || [],
          seo: {
            seoTitleOptions: [seo.seoTitle || ""],
            seoTitle: seo.seoTitle || "",
            hashtags: seo.hashtags || [],
          },
          hook: scriptResult.split('\n')[0] || "",
          voiceText: voiceover.map((v: { text: string }) => v.text).join(' '),
          transcriptRich,
          storyboard: storyboard.map((s: any, i: number) => ({
            sceneId: i + 1,
            sceneNumber: s.sceneNumber || i + 1,
            startTime: 0,
            endTime: parseInt(s.durationHint) || 5,
            voText: "",
            onScreenText: s.onScreenText || "",
            visual: s.visual || "",
            sfx: s.sfx,
            durationHint: s.durationHint,
            stockKeywords: s.stockKeywords || [],
            aiPrompt: s.aiPrompt,
          })),
          status: "draft",
        });
        
        savedScriptId = savedScript.id;
        console.log(`[TextToVideo] Saved script with ID: ${savedScriptId}`);
      } catch (saveError) {
        console.error("[TextToVideo] Failed to save script:", saveError);
        // Continue even if save fails - user still gets the result
      }

      res.json({
        seoTitle: seo.seoTitle || "Generated Video",
        hashtags: seo.hashtags || ["#shorts", "#viral"],
        script: scriptResult,
        voiceover,
        storyboard,
        analysis,
        scriptId: savedScriptId,
      });
    } catch (error) {
      console.error("[TextToVideo] Generation error:", error);
      res.status(500).json({ error: "Failed to generate content" });
    }
  });
  
  // PATCH endpoint to update script voiceover
  app.patch("/api/scripts/:id/voiceover", async (req, res) => {
    try {
      const { id } = req.params;
      const { voiceover } = req.body;
      
      if (!voiceover || !Array.isArray(voiceover)) {
        return res.status(400).json({ error: "Voiceover array is required" });
      }
      
      // Validate voiceover structure
      for (const item of voiceover) {
        if (typeof item.timecode !== 'string' || typeof item.text !== 'string') {
          return res.status(400).json({ error: "Each voiceover item must have 'timecode' and 'text' strings" });
        }
        // Validate timecode format (MM:SS-MM:SS)
        if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(item.timecode)) {
          return res.status(400).json({ error: "Invalid timecode format. Use MM:SS-MM:SS" });
        }
      }
      
      const script = await storage.getScript(id);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }
      
      // Convert voiceover to transcriptRich format with required 'type' field
      const transcriptRich = {
        segments: voiceover.map((v: { timecode: string; text: string }) => {
          const [start, end] = v.timecode.split("-").map((t: string) => {
            const [min, sec] = t.split(":").map(Number);
            return min * 60 + (sec || 0);
          });
          return {
            type: "speaker" as const,
            text: v.text,
            duration: (end - start) || 5,
          };
        }),
      };
      
      const voiceText = voiceover.map((v: { text: string }) => v.text).join(' ');
      
      const updated = await storage.updateScript(id, {
        transcriptRich,
        voiceText,
      });
      
      if (!updated) {
        return res.status(500).json({ error: "Failed to update script" });
      }
      
      res.json({ success: true, script: updated });
    } catch (error) {
      console.error("[Voiceover] Update error:", error);
      res.status(500).json({ error: "Failed to update voiceover" });
    }
  });

  // PATCH endpoint to update script storyboard
  app.patch("/api/scripts/:id/storyboard", async (req, res) => {
    try {
      const { id } = req.params;
      const { storyboard } = req.body;
      
      if (!storyboard || !Array.isArray(storyboard)) {
        return res.status(400).json({ error: "Storyboard array is required" });
      }
      
      const script = await storage.getScript(id);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }
      
      // Normalize storyboard structure
      const normalizedStoryboard = storyboard.map((s: any, i: number) => ({
        sceneId: i + 1,
        sceneNumber: s.sceneNumber || i + 1,
        startTime: s.startTime || 0,
        endTime: s.endTime || 5,
        voText: s.voText || "",
        onScreenText: s.onScreenText || "",
        visual: s.visual || "",
        sfx: s.sfx || "",
        durationHint: s.durationHint || "5s",
        stockKeywords: s.stockKeywords || [],
        aiPrompt: s.aiPrompt || s.visual || "",
      }));
      
      const updated = await storage.updateScript(id, {
        storyboard: normalizedStoryboard,
      });
      
      if (!updated) {
        return res.status(500).json({ error: "Failed to update script" });
      }
      
      res.json({ success: true, script: updated });
    } catch (error) {
      console.error("[Storyboard] Update error:", error);
      res.status(500).json({ error: "Failed to update storyboard" });
    }
  });

  // PATCH endpoint to update script text content
  app.patch("/api/scripts/:id/content", async (req, res) => {
    try {
      const { id } = req.params;
      const { hook, seoTitle, hashtags } = req.body;
      
      const script = await storage.getScript(id);
      if (!script) {
        return res.status(404).json({ error: "Script not found" });
      }
      
      const updateData: any = {};
      
      if (hook !== undefined) {
        updateData.hook = hook;
      }
      
      if (seoTitle !== undefined || hashtags !== undefined) {
        updateData.seo = {
          ...script.seo,
          ...(seoTitle !== undefined && { seoTitle, seoTitleOptions: [seoTitle] }),
          ...(hashtags !== undefined && { hashtags }),
        };
        if (seoTitle !== undefined) {
          updateData.displayName = seoTitle;
        }
        if (hashtags !== undefined) {
          updateData.keywords = hashtags;
        }
      }
      
      const updated = await storage.updateScript(id, updateData);
      
      if (!updated) {
        return res.status(500).json({ error: "Failed to update script" });
      }
      
      res.json({ success: true, script: updated });
    } catch (error) {
      console.error("[Content] Update error:", error);
      res.status(500).json({ error: "Failed to update content" });
    }
  });

  // ============ TTS (Text-to-Speech) ============

  app.get("/api/tts/voices", async (req, res) => {
    try {
      const voices = await listVoices();
      
      // Filter to most useful voices and format for frontend
      const formattedVoices = voices.map((v: any) => ({
        id: v.ShortName,
        name: v.FriendlyName || v.ShortName,
        locale: v.Locale,
        gender: v.Gender,
        language: v.Locale.split("-")[0],
      }));

      // Sort by locale
      formattedVoices.sort((a: any, b: any) => a.locale.localeCompare(b.locale));

      res.json(formattedVoices);
    } catch (error) {
      console.error("Failed to fetch voices:", error);
      res.status(500).json({ error: "Failed to fetch voices" });
    }
  });

  app.post("/api/tts/generate", async (req, res) => {
    try {
      const { text, voice, rate, pitch, volume } = req.body;

      if (!text || !voice) {
        return res.status(400).json({ error: "Text and voice are required" });
      }

      if (text.length > 5000) {
        return res.status(400).json({ error: "Text too long (max 5000 chars)" });
      }

      console.log(`[TTS] Generating audio for ${text.length} chars with voice ${voice}`);

      const tts = new EdgeTTS(text, voice, {
        rate: rate || "+0%",
        pitch: pitch || "+0Hz",
        volume: volume || "+0%",
      });

      const result = await tts.synthesize();
      const audioBuffer = Buffer.from(await result.audio.arrayBuffer());

      // Set headers for MP3 download
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="voiceover.mp3"`,
        "Content-Length": audioBuffer.length,
      });

      res.send(audioBuffer);
    } catch (error) {
      console.error("TTS generation failed:", error);
      res.status(500).json({ error: "Failed to generate audio" });
    }
  });

  // ============ TREND TOPICS ============

  app.get("/api/trend-topics", async (req, res) => {
    try {
      const { categoryId } = req.query;
      const { getOrBuildTrendTopics } = await import("./trend-clustering");
      const trendTopics = await getOrBuildTrendTopics(categoryId as any);
      res.json(trendTopics);
    } catch (error) {
      console.error("Failed to get trend topics:", error);
      res.status(500).json({ error: "Failed to get trend topics" });
    }
  });

  app.get("/api/trend-topics/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { getOrBuildTrendTopics } = await import("./trend-clustering");
      const trendTopics = await getOrBuildTrendTopics();
      const topic = trendTopics.find(t => t.id === id);
      if (!topic) {
        return res.status(404).json({ error: "Trend topic not found" });
      }
      res.json(topic);
    } catch (error) {
      console.error("Failed to get trend topic:", error);
      res.status(500).json({ error: "Failed to get trend topic" });
    }
  });

  // ============ SEED MANAGEMENT ============

  app.get("/api/seeds/stats", async (req, res) => {
    try {
      const { getCategoryStats } = await import("./seed-loader");
      const stats = await getCategoryStats();
      res.json(stats);
    } catch (error) {
      console.error("Failed to get seed stats:", error);
      res.status(500).json({ error: "Failed to get seed stats" });
    }
  });

  app.post("/api/seeds/import", async (req, res) => {
    try {
      const { categoryId } = req.body;
      const { importSeedsForCategory, importAllSeeds } = await import("./seed-loader");
      
      let imported: number;
      if (categoryId) {
        imported = await importSeedsForCategory(categoryId);
      } else {
        imported = await importAllSeeds();
      }
      
      res.json({ imported });
    } catch (error) {
      console.error("Failed to import seeds:", error);
      res.status(500).json({ error: "Failed to import seeds" });
    }
  });

  app.post("/api/seeds/ensure-minimum", async (req, res) => {
    try {
      const { categoryId, minCount = 20 } = req.body;
      const { ensureMinimumSources } = await import("./seed-loader");
      
      if (categoryId) {
        await ensureMinimumSources(categoryId, minCount);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to ensure minimum sources:", error);
      res.status(500).json({ error: "Failed to ensure minimum sources" });
    }
  });

  // ============ SCRIPTPACK GENERATION ============

  app.post("/api/scriptpack/generate", async (req, res) => {
    try {
      const { trendTopicId, topicId, language, platform, durationSec, stylePreset, accent, goal, audience } = req.body;
      
      if (!trendTopicId && !topicId) {
        return res.status(400).json({ error: "Either trendTopicId or topicId is required" });
      }
      
      const { getOrBuildTrendTopics } = await import("./trend-clustering");
      const { generateScriptPack, scriptPackToScript } = await import("./scriptpack-generator");
      
      let trendTopic;
      let actualTopicId = topicId;
      
      if (trendTopicId) {
        const trendTopics = await getOrBuildTrendTopics();
        trendTopic = trendTopics.find(t => t.id === trendTopicId);
        if (!trendTopic) {
          return res.status(404).json({ error: "Trend topic not found" });
        }
      } else {
        const topic = await storage.getTopic(topicId);
        if (!topic) {
          return res.status(404).json({ error: "Topic not found" });
        }
        trendTopic = {
          id: `manual_${topicId}`,
          seedTitles: [topic.title],
          contextSnippets: [topic.rawText || topic.fullContent || ""].filter(Boolean),
          keywords: topic.insights?.keyFacts?.slice(0, 5) || [],
          angles: topic.insights?.trendingAngles || [],
          hookPatterns: [],
          score: topic.score,
          clusterLabel: topic.title.slice(0, 50),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      
      const options = {
        language: language || "ru",
        platform: platform || "youtube_shorts",
        durationSec: durationSec || "60",
        stylePreset: stylePreset || "classic",
        accent: accent || "classic",
        goal,
        audience,
      };
      
      const scriptPack = await generateScriptPack(trendTopic as any, options as any);
      
      if (!scriptPack) {
        return res.status(500).json({ error: "Failed to generate script pack" });
      }
      
      if (actualTopicId) {
        const scriptData = scriptPackToScript(scriptPack, trendTopic as any, actualTopicId, options as any);
        const script = await storage.createScript(scriptData);
        return res.json({ scriptPack, script });
      }
      
      res.json({ scriptPack });
    } catch (error) {
      console.error("Failed to generate script pack:", error);
      res.status(500).json({ error: "Failed to generate script pack" });
    }
  });

  // ============ AUTH ============

  // Login with password
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { password } = req.body;
      
      if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "Password is required" });
      }
      
      // Check if password is valid
      const isValid = await storage.validatePassword(password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid password" });
      }
      
      // Check if user already exists for this password
      let user = await storage.getUserByPassword(password);
      
      if (!user) {
        // Create new user account
        user = await storage.createUser({
          passwordHash: password, // Using password as identifier (simple system)
          nickname: null,
          language: "ru",
          theme: "dark",
        });
      }
      
      // Create session
      const session = await storage.createSession(user.id);
      
      // Set session cookie
      res.cookie("session_id", session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      
      // Return user data (without sensitive info)
      res.json({
        user: {
          id: user.id,
          personalNumber: user.personalNumber,
          nickname: user.nickname,
          avatarId: user.avatarId,
          language: user.language,
          theme: user.theme,
          subscriptionExpiresAt: user.subscriptionExpiresAt,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      
      if (!sessionId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        res.clearCookie("session_id");
        return res.status(401).json({ error: "Session expired" });
      }
      
      const user = await storage.getUser(session.userId);
      if (!user) {
        res.clearCookie("session_id");
        return res.status(401).json({ error: "User not found" });
      }
      
      res.json({
        user: {
          id: user.id,
          personalNumber: user.personalNumber,
          nickname: user.nickname,
          avatarId: user.avatarId,
          language: user.language,
          theme: user.theme,
          subscriptionExpiresAt: user.subscriptionExpiresAt,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error("Auth check error:", error);
      res.status(500).json({ error: "Auth check failed" });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      
      if (sessionId) {
        await storage.deleteSession(sessionId);
      }
      
      res.clearCookie("session_id");
      res.json({ success: true });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // Update profile
  app.patch("/api/auth/profile", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      console.log("[Profile] Update request, sessionId:", sessionId ? "present" : "missing");
      
      if (!sessionId) {
        console.log("[Profile] No session_id cookie");
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      console.log("[Profile] Session lookup:", session ? "found" : "not found");
      if (!session) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      const { nickname, avatarId, language, theme } = req.body;
      
      const user = await storage.updateUser(session.userId, {
        nickname,
        avatarId,
        language,
        theme,
      });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        user: {
          id: user.id,
          personalNumber: user.personalNumber,
          nickname: user.nickname,
          avatarId: user.avatarId,
          language: user.language,
          theme: user.theme,
          subscriptionExpiresAt: user.subscriptionExpiresAt,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Profile update failed" });
    }
  });

  // Reset settings
  app.post("/api/auth/reset", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      
      if (!sessionId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      const user = await storage.resetUserSettings(session.userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        user: {
          id: user.id,
          personalNumber: user.personalNumber,
          nickname: user.nickname,
          avatarId: user.avatarId,
          language: user.language,
          theme: user.theme,
          subscriptionExpiresAt: user.subscriptionExpiresAt,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error("Reset error:", error);
      res.status(500).json({ error: "Reset failed" });
    }
  });

  // ============ FORM STATE PERSISTENCE ============
  
  app.get("/api/form-state/:pageName", async (req, res) => {
    try {
      const { pageName } = req.params;
      const sessionId = req.cookies?.session_id;
      let userId: string | undefined;
      
      if (sessionId) {
        const session = await storage.getSession(sessionId);
        if (session) {
          userId = session.userId;
        }
      }
      
      const formState = await storage.getFormState(pageName, userId);
      res.json(formState?.state || {});
    } catch (error) {
      console.error("Failed to get form state:", error);
      res.status(500).json({ error: "Failed to get form state" });
    }
  });

  app.post("/api/form-state/:pageName", async (req, res) => {
    try {
      const { pageName } = req.params;
      const { state } = req.body;
      const sessionId = req.cookies?.session_id;
      let userId: string | undefined;
      
      if (sessionId) {
        const session = await storage.getSession(sessionId);
        if (session) {
          userId = session.userId;
        }
      }
      
      const formState = await storage.saveFormState(pageName, state || {}, userId);
      res.json(formState);
    } catch (error) {
      console.error("Failed to save form state:", error);
      res.status(500).json({ error: "Failed to save form state" });
    }
  });

  // ============ AI ASSISTANT CHAT ============
  
  // Check if OpenAI integration is configured
  const isOpenAIConfigured = Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY && 
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
  );
  
  const openai = isOpenAIConfigured ? new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  }) : null;
  
  // Zod schema for chat message
  const chatMessageSchema = z.object({
    message: z.string().min(1, "Message cannot be empty").max(10000, "Message too long"),
  });
  
  const VIDEO_ASSISTANT_SYSTEM_PROMPT = `Ты — профессиональный AI-ассистент для видеомонтажеров, режиссеров и создателей контента. Твоя специализация:

**Кинопроизводство и история кино:**
- История киностудий (Мосфильм, Горького, Ленфильм, Hollywood studios и др.)
- Биографии режиссеров, операторов, актеров
- Техники съемки и монтажа разных эпох
- Жанры и стили кинематографа

**Видеомонтаж:**
- Adobe Premiere Pro, DaVinci Resolve, Final Cut Pro, After Effects
- Техники монтажа: jump cut, match cut, J-cut, L-cut, cross-cutting
- Цветокоррекция и грейдинг
- Звуковой дизайн и работа с аудио
- VFX и композитинг

**Создание контента:**
- YouTube Shorts, TikTok, Reels, VK Clips
- Написание сценариев и хуков
- Структура вирусного контента
- SEO и продвижение видео

**Техническое оснащение:**
- Камеры и объективы
- Освещение и звукозапись
- Стабилизация и риги
- Кодеки и форматы видео

Отвечай структурировано, с примерами и практическими советами. Если спрашивают о фактах (даты, имена, события), давай точную информацию. Отвечай на языке пользователя.`;
  
  // Get chat history
  app.get("/api/assistant/chat", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      const messages = await storage.getAssistantChats(session.userId);
      res.json(messages);
    } catch (error) {
      console.error("Failed to get chat history:", error);
      res.status(500).json({ error: "Failed to get chat history" });
    }
  });
  
  // Send message and get AI response (streaming)
  app.post("/api/assistant/chat", async (req, res) => {
    try {
      // Check if OpenAI is configured
      if (!openai) {
        return res.status(503).json({ error: "AI Assistant is not configured. Please set up OpenAI integration." });
      }
      
      const sessionId = req.cookies?.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      // Validate request body with Zod
      const parseResult = chatMessageSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: parseResult.error.errors[0]?.message || "Invalid request" });
      }
      
      const { message } = parseResult.data;
      
      // Save user message
      await storage.addAssistantChat(session.userId, "user", message);
      
      // Get conversation history for context
      const history = await storage.getAssistantChats(session.userId);
      const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: VIDEO_ASSISTANT_SYSTEM_PROMPT },
        ...history.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];
      
      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      
      // Stream response from OpenAI
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: 2048,
      });
      
      let fullResponse = "";
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
      
      // Save assistant message
      await storage.addAssistantChat(session.userId, "assistant", fullResponse);
      
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Failed to send message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
  
  // Clear chat history
  app.delete("/api/assistant/chat", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      await storage.clearAssistantChats(session.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to clear chat:", error);
      res.status(500).json({ error: "Failed to clear chat" });
    }
  });
  
  // Archive chat history
  app.post("/api/assistant/chat/archive", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      const count = await storage.archiveAssistantChats(session.userId);
      res.json({ success: true, archivedCount: count });
    } catch (error) {
      console.error("Failed to archive chat:", error);
      res.status(500).json({ error: "Failed to archive chat" });
    }
  });
  
  // Get archived chat sessions
  app.get("/api/assistant/chat/archived", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      const sessions = await storage.getArchivedChatSessions(session.userId);
      res.json(sessions);
    } catch (error) {
      console.error("Failed to get archived sessions:", error);
      res.status(500).json({ error: "Failed to get archived sessions" });
    }
  });
  
  // Unarchive a chat session
  app.post("/api/assistant/chat/unarchive", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      const { archivedAt } = req.body;
      if (!archivedAt) {
        return res.status(400).json({ error: "archivedAt is required" });
      }
      
      const count = await storage.unarchiveChatSession(session.userId, archivedAt);
      res.json({ success: true, unarchivedCount: count });
    } catch (error) {
      console.error("Failed to unarchive session:", error);
      res.status(500).json({ error: "Failed to unarchive session" });
    }
  });
  
  // Get paginated chat history
  app.get("/api/assistant/chat/page/:page", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      const page = parseInt(req.params.page) || 1;
      const perPage = 50;
      const result = await storage.getAssistantChatsPaginated(session.userId, page, perPage);
      res.json(result);
    } catch (error) {
      console.error("Failed to get paginated chat:", error);
      res.status(500).json({ error: "Failed to get chat history" });
    }
  });
  
  // Get user's notes
  app.get("/api/assistant/notes", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      const note = await storage.getAssistantNote(session.userId);
      res.json(note || { content: "" });
    } catch (error) {
      console.error("Failed to get notes:", error);
      res.status(500).json({ error: "Failed to get notes" });
    }
  });
  
  // Save user's notes
  app.post("/api/assistant/notes", async (req, res) => {
    try {
      const sessionId = req.cookies?.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(401).json({ error: "Session expired" });
      }
      
      const { content } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({ error: "Content must be a string" });
      }
      
      const note = await storage.saveAssistantNote(session.userId, content);
      res.json(note);
    } catch (error) {
      console.error("Failed to save notes:", error);
      res.status(500).json({ error: "Failed to save notes" });
    }
  });

  return httpServer;
}
