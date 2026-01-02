# IDENGINE: Shorts Factory

## Overview

IDENGINE is a content production pipeline for creating short-form video content (Shorts/Reels/TikTok) from various sources. The application aggregates content from Telegram, RSS feeds, URLs, and manual input, then uses AI to generate hooks, scripts, storyboards, and audio for video production.

The app is designed as a mobile-first PWA (Progressive Web App) that works in browsers and can be installed on mobile devices. It features a job queue system for background processing and supports both API-based AI generation and fallback mode for offline/keyless operation.

## User Preferences

Preferred communication style: Simple, everyday language.

### Design Preferences
- **Style**: Modern video editing / production studio aesthetic
- **Design approach**: Flat, angular (0.125rem radius), minimal shadows
- **Colors**: 
  - Light mode: Warm cream backgrounds (32 30% 96%), coral primary (8 80% 56%), amber accents (38 92% 58%)
  - Dark mode: Deep charcoal (24 16% 8%), warm coral primary (8 78% 60%)
- **Elements**: Corner markers, gradient accents (coral-to-amber), filmstrip motifs
- **Icons**: Video editing themed (Clapperboard, Scissors, Film, Radar, Play)

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query for server state, React hooks for local state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens, mobile-first responsive design
- **Build Tool**: Vite with hot module replacement

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Design**: RESTful JSON API at `/api/*` endpoints
- **Job Processing**: Custom polling-based background worker for async tasks (fetching topics, generating content)

### Data Layer
- **ORM**: Drizzle ORM with Zod schema validation
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Schema Location**: `shared/schema.ts` contains all entity definitions
- **Current Storage**: In-memory storage implementation exists as fallback (`server/storage.ts`)

### Core Entities
1. **Source** - Content sources with enhanced health tracking:
   - 9 types: rss, telegram, url, manual, api, html, youtube_channel, youtube_search, youtube_trending
   - `categoryId` - Category classification (world_news, gaming, memes, etc.)
   - `priority` - 1-5 priority level for source ranking
   - `health` object with: status (ok/warning/dead/pending), httpCode, avgLatencyMs, failuresCount, freshnessHours, lastError, itemCount
   - Auto-disable after 12 consecutive failures (~3 days)
   - Health checks skip non-networkable types (manual, telegram)
2. **TrendSignal** - Extracted viral patterns from YouTube Shorts (pending implementation)
3. **TrendTopic** - Links topics to trend signals for script generation context
4. **Topic** - Individual content items fetched from sources with:
   - `title` / `translatedTitle` - Original and translated (RU) titles
   - `fullContent` - Extracted article content for context-aware generation
   - `insights` - AI-extracted key facts, trending angles, emotional hooks, viral potential
   - `extractionStatus` - pending/extracting/done/failed status for content extraction
   - `score`, `status`, `language` - Standard metadata
5. **Script** - Generated video scripts with hooks, storyboards, and metadata
6. **Job** - Background task queue supporting:
   - `fetch_topics`, `extract_content`, `translate_topic` - Content pipeline
   - `generate_hook`, `generate_script`, `generate_storyboard` - Script generation
   - `generate_voice`, `pick_music`, `export_package`, `generate_all` - Production
   - `health_check`, `health_check_all`, `auto_discovery`, `extract_trends` - Source maintenance
7. **Setting** - Key-value configuration storage

### AI Content Generation
- **Provider Abstraction**: `server/providers.ts` defines LLM interface
- **Context-Aware Generation**: Uses full article content (not just headlines) for richer scripts
  - `generateHookFromContext()` - Hooks based on extracted insights and emotional triggers
  - `generateScriptFromContext()` - Scripts with key facts, trending angles, story structure
  - `generateStoryboardFromContext()` - Storyboards informed by content context
  - `translateTitle()` - Automatic RU translation for English sources
  - `extractInsights()` - AI extraction of key facts, trends, and viral potential
- **TopicContext Interface**: Carries title, fullContent, insights, language for generation
- **SEO Generation**: `generateSEO()` produces 3 SEO title variants + 10 hashtags per platform
- **Style Presets**: 20 styles including news, crime, detective, storytelling, comedy, classic, tarantino, anime, brainrot, adult, howto, mythbusting, top5, hottakes, pov, cinematic, science, motivation, versus, mistake
- **Platform Support**: YouTube Shorts, TikTok, Instagram Reels, VK Clips
- **Accent Presets**: Classic, News, Military, Blogger, Meme, Dramatic, Ironic, Streamer (for voice tone)
- **Duration Options**: 30, 45, 60, or 120 seconds with story arc structure
- **Subtitle Export**: SRT, VTT, CSV, TSV format export from timeline for video editing
- **Script Template**: Professional vertical video format with timing markers
  - [0-3s] HOOK - Attention grabber
  - [3-6s] INTEREST CAPTURE - Draw viewer in
  - [6-15s] WORLD IMMERSION - Context and background
  - [15-Xs] ESCALATION - Build tension with key facts
  - [X-end] CLIMAX + FINALE - Resolution and CTA
- **Fallback Mode**: Template-based generation when no API keys are configured

### Voice Preview (TTS)
- Browser-based text-to-speech for script preview
- Voice selection with speed and pitch controls
- Copy-to-clipboard for use with external TTS services
- **Limitation**: Browser SpeechSynthesis API cannot produce downloadable audio files directly. For production-quality voice audio, use professional TTS services like ElevenLabs, Amazon Polly, or Google Cloud TTS with the copied script text.

### Export Package
- ZIP archive with all production assets
- Includes: hook.txt, voiceover.txt, onscreen.txt, storyboard.json, music.json
- EDL timeline file for video editing software (Premiere, DaVinci Resolve)
- README with production workflow instructions

### Internationalization (i18n)
- Full Russian and English language support
- Auto-detection based on browser language
- Language toggle in settings and header
- 50+ translation keys covering all UI elements

### PWA Features
- Service worker ready with manifest.json
- Touch-friendly UI with 44px minimum touch targets
- Safe area handling for mobile notches
- Offline-friendly design for viewing cached data

## External Dependencies

### AI/LLM Services
- OpenRouter API for LLM access (configurable model selection)
- Fallback templates for operation without API keys

### Database
- PostgreSQL via `DATABASE_URL` environment variable
- Drizzle Kit for migrations (`npm run db:push`)

### Key NPM Packages
- `@tanstack/react-query` - Server state management
- `drizzle-orm` / `drizzle-zod` - Database ORM and validation
- `express` - HTTP server
- `zod` - Runtime type validation
- Full shadcn/ui component suite via Radix UI primitives

### Development Tools
- Vite with React plugin
- Replit-specific plugins for error overlay and development banners
- esbuild for production server bundling