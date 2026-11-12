# ASTRA Health — AI Assistant NASA Space Data Search

Add a collapsible NASA Space Data Search bar and rich results drawer inside the existing AI Assistant workspace, enabling astronauts and operators to query APOD imagery, near-Earth asteroids, active fire hotspots, solar space weather, climate indicators, and ISS biological experiments with a single keyword search while keeping all other ASTRA Health views and AI workflows untouched.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices incorporate your confirmed design preferences and ensure secure, accurate NASA API integration.

- **Confirmed Placement**: Collapsible panel positioned directly above the AI Assistant chat stream, toggled from the AI Assistant header so existing Online/Offline AI chat and Activity Bar workflows remain completely undisturbed.
- **Confirmed Search Interaction**: Single unified keyword search bar that automatically routes natural queries (e.g., `"apod"`, `"asteroids"`, `"solar flare"`, `"active fires"`, `"climate"`, `"bio experiment"`) across all 12 NASA data tools without requiring manual dropdown selection.
- **Confirmed Results Presentation**: Structured, domain-specific rich cards rendered below the search bar for APOD photography, near-Earth asteroid close approaches, DONKI solar flares/CMEs/geomagnetic storms, active fire hotspots, climate indicators, and ISS bio experiments.
- **Server-Side API Key Security & Endpoint Accuracy**: Your provided NASA API key will be stored strictly on the server via environment configuration (`NASA_API_KEY`) and never bundled into client-side code. Furthermore, solar CME and geomagnetic storm queries will route to their authentic NASA DONKI endpoints (`/DONKI/CME` and `/DONKI/GST` rather than `/DONKI/FLR`) so returned telemetry matches your query intent.

---

## 1. Overview & Core Concept

- **What It Does**: Adds an on-demand space intelligence lookup console inside the AI Assistant. Typing a keyword or date query fetches live NASA space, Earth-observation, and life-science records through a unified server proxy and renders structured telemetry and media cards directly beneath the search input.
- **Target Audience & Context**: Mission crew members and flight controllers already inside the AI Assistant who want quick, factual NASA data lookups (space weather, near-Earth objects, astronomy picture of the day, Earth fire monitoring, climate & ISS biology references) without leaving their active AI conversation.
- **Key Value**: Bridges the 12 OrbitDB/NASA MCP tools into a zero-friction, single-input search experience while preserving 100% of ASTRA Health's existing dual-mode AI chat, offline worker engine, and dashboard modules.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Collapsed Default**: The AI Assistant loads identically to today, with a clean `"Space Data Search"` toggle button in the top control strip.
  2. **Expand & Query**: Clicking `"Space Data Search"` opens a sleek, hairline-bordered search bar above the chat stream with an input field (e.g., *"Search NASA data: APOD, asteroids, solar flares, fires, climate, bio experiments..."*) and a `"Search"` button.
  3. **Intent Routing & Loading State**: Submitting a query shows a quiet inline progress indicator identifying the matched NASA tool (e.g., *Querying NASA NEO Feed...*) and clears cleanly when data arrives.
  4. **Rich Results Area**: Directly below the search bar, a bounded, scrollable results tray (`max-height` capped so chat remains accessible) displays specialized rich cards tailored to the returned dataset, along with a `"Clear"` and `"Collapse"` control.
  5. **Empty & Error States**: Clear, unexaggerated messages explain empty results or external NASA API limits without substituting fake measurements.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Deep-space aerospace telemetry precision matching ASTRA Health's dark console posture—clinical, calibrated, and unobtrusive.
  - *Color Palette & Mood*: Dominant obsidian canvas (`slate-950` / `slate-900`), flat structural card surfaces (`slate-900/90`) with crisp `1px` hairline borders (`border-slate-800`), and restrained cyan (`#06B6D4`) / amber (`#F59E0B`) telemetry accents reserved strictly for primary actions and hazard flags.
  - *Typography & Hierarchy*: Clean sans-serif headings paired with `font-mono tabular-nums` for dates, velocities, miss distances, flare classifications, and coordinates.
  - *Metadata & Card Discipline*: Zero static pill sandwiches on cards—categories, timestamps, and source labels render as clean unboxed inline text separated by `·`. No thick left accent stripes (`border-l-4`) and no decorative pulsing dots.

- **Rich Card Layouts by Data Type**:
  - **APOD Cards**: Framed astronomical image (`referrerPolicy="no-referrer"` with a styled icon fallback container if media is video or unavailable), title, observation date, copyright, and expandable astronomer explanation.
  - **Asteroid / NEO Cards**: Object name, estimated diameter range, relative velocity (`km/h`), miss distance (`km` / lunar distances), close-approach date, and explicit text hazard indicator (`Hazardous` / `Non-Hazardous`).
  - **Solar Flare, CME & Geomagnetic Storm Cards**: Event ID, observation timestamp, flare class or CME speed (`km/s`), active region / Kp index, participating instruments, and official NASA CCMC link.
  - **Active Fire Hotspot Cards**: Coordinates, brightness temperature, detection timestamp, satellite source (`MODIS`/`VIIRS` or NASA EONET wildfire event fallback), and region label.
  - **Climate & Bio Experiment Cards**: Structured title, summary abstract, mission/payload context, and direct official NASA source link.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Server-Side Unified Search Proxy vs. Client-Side Direct Fetches**
  - *Chosen Approach*: Route all 12 NASA tool queries through a dedicated Express backend search endpoint backed by server environment credentials.
  - *Why*: Protects the NASA API key from browser inspection, bypasses browser CORS issues on NASA HTML/FIRMS/EONET endpoints, and enables clean normalization of heterogeneous NASA responses into structured card models.
  - *Alternatives Considered*: Direct browser `fetch()` calls with an embedded key—rejected due to credential exposure and CORS failures on NASA Earth/Climate endpoints.

- **Decision 2: Deterministic Intent Router for Single Keyword Search**
  - *Chosen Approach*: Parse keywords, date tokens (`YYYY-MM-DD`), and optional bounding coordinates deterministically on the backend to select the right NASA tool(s) across the 12-tool catalog.
  - *Why*: Instant zero-latency routing, predictable behavior even when Gemini Cloud quota is unavailable, and transparent indication to the user of which NASA endpoint answered the query.
  - *Alternatives Considered*: Requiring an LLM call before every search—rejected because it adds unnecessary latency and fails if the Gemini key is unconfigured.

- **Decision 3: Honest Endpoint Handling for FIRMS, Climate, and Bio Science**
  - *Chosen Approach*: Correct `/DONKI/FLR` vs `/DONKI/CME` vs `/DONKI/GST` routing on the server; query NASA FIRMS (with automatic fallback to NASA EONET wildfire thermal events if FIRMS requires a separate map key); parse structured metadata/summaries from NASA Climate and Biological & Physical Sciences endpoints alongside ASTRA's verified OSDR bio catalog.
  - *Why*: Ensures every keyword search returns genuine, readable rich cards rather than raw HTML markup or silent 404/auth errors.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **System & Component Architecture**:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       AI ASSISTANT VIEW (EXISTING)                      │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Header Strip: [Online AI] [Offline AI]  ...  [Space Data Search]  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │ (Toggle Expand/Collapse)           │
│                                    ▼                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │           COLLAPSIBLE SPACE DATA SEARCH PANEL (NEW)               │  │
│  │  ┌─────────────────────────────────────────────┐  ┌────────────┐  │  │
│  │  │ Keyword Search Input (all 12 NASA tools)    │  │   Search   │  │  │
│  │  └─────────────────────────────────────────────┘  └────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │ Results Tray: Rich Cards (APOD · NEO · DONKI · Fires · Bio) │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Existing Chat Messages Stream + Activity Bar + Prompt Composer    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ GET /api/nasa/space-search?q=...
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   EXPRESS BACKEND PROXY (SERVER)                        │
│                                                                         │
│  Intent Classifier ─┬─► APOD (/planetary/apod)                          │
│                     ├─► Asteroids (/neo/rest/v1/feed)                   │
│                     ├─► Space Weather (/DONKI/FLR, /CME, /GST)          │
│                     ├─► Active Fires (FIRMS API / EONET Wildfires)      │
│                     ├─► Climate Indicators (NASA Climate metadata)      │
│                     └─► Bio Experiments (NASA BPS + OSDR Catalog)       │
│                                                                         │
│  Uses server-side NASA_API_KEY · Returns normalized typed card payloads │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - *Frontend Search State*: Local React state inside the Space Data Search panel tracking `isExpanded`, `query`, `isLoading`, `matchedTools`, `results` (array of discriminated-union card items by `kind`: `'apod' | 'asteroid' | 'flare' | 'cme' | 'geomagnetic_storm' | 'fire' | 'climate' | 'bio'`), and `errorMessage`.
  - *Normalized Backend Response*: `{ query, detectedTools, fetchedAt, items: SpaceSearchResultItem[], notice? }` where every item carries source attribution, observation date/timestamp, official link, and type-specific structured fields.

- **Interactive Component & State Mapping**:
  - **Expand/Collapse Button**: Toggles the Space Data Search panel open or closed without affecting active chat tab (`ONLINE` / `OFFLINE`) or message history.
  - **Search Form (`onSubmit`)**: Validates non-empty keyword input, sends `GET /api/nasa/space-search?q=...`, locks submit button while loading, and populates the rich card tray below the search bar.
  - **Clear Results Button**: Resets search query and clears displayed result cards while keeping the search bar ready for a new query.
  - **Error & Offline Handling**: If offline or upstream NASA endpoint rejects/times out, displays a clear notice in the results area explaining the limitation without altering or polluting health dashboard records.
