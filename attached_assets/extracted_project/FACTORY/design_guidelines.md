# IDENGINE: Shorts Factory - Design Guidelines

## Design Approach
**System-Based Approach**: Mobile-first PWA with clean, productivity-focused design inspired by modern content creation tools (Linear's clarity + Notion's organization).

## Visual Style: Clean Light Theme

**Color Strategy**:
- Base: Pure white (#FFFFFF) background
- Accent: Single primary color (indigo/blue spectrum)
- Neutral grays for text hierarchy
- Status colors: green (ready), yellow (generating), red (error), gray (draft)

**Typography**:
- Font: System stack or Inter
- Hierarchy: Large headings (text-2xl to text-4xl), generous line-height
- Emphasis on readability and breathing room

## Layout System

**Spacing Primitives**: Tailwind units of 4, 6, 8, 12, 16 (p-4, gap-6, m-8, py-12, space-y-16)

**Mobile-First Structure**:
- Desktop: max-w-7xl container, multi-column grids where appropriate
- Tablet: max-w-4xl, simplified grids
- Mobile: Single column, full-width cards with px-4 padding

**Touch Targets**: Minimum 44px height for all interactive elements

## Core Components

**Navigation**:
- Top: App bar with title, settings icon, user menu
- Bottom (Mobile): Fixed navigation with 5 items (Panel/Sources/Topics/Scripts/Settings)
- Desktop: Side navigation or persistent top bar

**Cards**: 
- Light shadow (shadow-sm) or thin border (border border-gray-200)
- Rounded corners (rounded-lg)
- Padding: p-6
- Hover state: subtle shadow lift (hover:shadow-md transition)

**Status System**:
- Pills/chips with rounded-full, px-3 py-1
- Color-coded: Draft (gray), Generating (yellow), Ready (green), Error (red)

**Forms & Inputs**:
- Height: h-11 minimum
- Border: border-gray-300, focus:border-primary focus:ring-2
- Rounded: rounded-md
- Spacing: gap-4 between fields

**Buttons**:
- Primary: Solid accent color, px-6 py-3, rounded-lg, font-medium
- Secondary: Border with accent color, transparent background
- Icon buttons: w-10 h-10, rounded-full for mobile contexts

**Progress Indicators**:
- Linear progress bar (h-2, rounded-full, bg-gray-200 with accent fill)
- Percentage text alongside

## Key Screen Layouts

**/panel (Dashboard)**:
- Hero section: "Update Topics" CTA with last update timestamp
- Grid: Recent topics (3 columns desktop, 1 mobile)
- Grid: Recent scripts (3 columns desktop, 1 mobile)
- Job status panel: List with progress bars

**/script/{id} (Main Production Screen)**:
- Top: Topic card with source, date, score
- Controls section: Segmented control for duration (30/45/60), dropdowns for style presets (6 options each)
- Pipeline stages in vertical cards:
  1. Hook (textarea, regen/edit buttons)
  2. Voice Script (textarea, regen/edit buttons)
  3. Storyboard (table with Scene#/Visual/On-screen/SFX/Duration, download button)
  4. Voice (player if generated, generate button, voice selector)
  5. Music (mood/BPM suggestions, reference links, license notes)
  6. Export (generate ZIP button, download link)
- Sidebar/bottom panel: Recent jobs with live status

**/topics**:
- Filter bar: status chips (new/selected/ignored), sort dropdown
- Card grid: Each topic shows title, source icon, score badge, timestamp
- Actions per card: "Select" (creates script), "Ignore" button
- Pull-to-refresh on mobile

**/sources**:
- List view with type icons (RSS/Telegram/URL/Manual)
- Toggle switches for enabled/disabled
- Add button (sticky bottom on mobile)
- Modal form for add/edit

## Component-Specific Details

**Toast/Alert System**:
- Fixed bottom-right (desktop) or top (mobile)
- Auto-dismiss after 5s for success, manual close for errors
- Shadow-lg, rounded-lg, p-4

**Modal Dialogs**:
- Backdrop: bg-black/50
- Content: max-w-lg, rounded-xl, shadow-2xl
- Mobile: Full-screen on small devices

**Skeleton Loading**:
- Animate-pulse on gray-200 backgrounds
- Match card/list item dimensions

## PWA Enhancements

**Install Prompt**: 
- Banner at top with "Install App" CTA (dismissable)
- Shows when PWA installable detected

**Offline State**:
- Full-screen message with icon when offline
- "You're offline" heading with explanation
- Previously viewed content still accessible

## Images

**Not applicable**: This is a utility/productivity tool focused on content generation workflows. No hero images or decorative photography needed. Interface is icon and text-driven.

## Animations

**Minimal & Purposeful**:
- Transitions: 150-200ms ease for hover states
- Progress bars: smooth animation
- Job status changes: subtle fade transition
- No scroll animations or complex effects