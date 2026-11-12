import React, { useState } from 'react';
import {
  Search,
  X,
  ChevronUp,
  ExternalLink,
  Image as ImageIcon,
  Orbit,
  Flame,
  Sun,
  Wind,
  Activity,
  Thermometer,
  FlaskConical,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import type { SpaceSearchResponse, SpaceSearchResultItem, SpaceSearchApodItem } from '../../types/spaceSearch';

interface SpaceDataSearchPanelProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  get_apod: 'APOD',
  search_apod_archive: 'APOD Archive',
  get_asteroids_this_week: 'Near-Earth Asteroids',
  find_closest_asteroids: 'Closest Asteroids',
  check_asteroid_hazard: 'Asteroid Hazard Check',
  get_active_fires: 'Active Fires',
  query_fire_hotspots: 'Fire Hotspots',
  get_solar_flares: 'Solar Flares',
  get_cmes: 'Coronal Mass Ejections',
  get_geomagnetic_storms: 'Geomagnetic Storms',
  get_climate_indicator: 'Climate Indicators',
  search_bio_experiments: 'Bio Experiments',
};

function safeExternalHref(rawUrl?: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const ApodImageFrame: React.FC<{ item: SpaceSearchApodItem }> = ({ item }) => {
  const [imgError, setImgError] = useState(false);
  const safeImgSrc = safeExternalHref(item.url);

  if (item.mediaType === 'video' || !safeImgSrc || imgError) {
    return (
      <div className="w-full sm:w-44 h-32 shrink-0 rounded-lg bg-slate-900 border border-slate-800 flex flex-col items-center justify-center p-3 text-center gap-1.5">
        <ImageIcon className="w-6 h-6 text-cyan-400/70" />
        <span className="text-[11px] font-mono text-slate-400">
          {item.mediaType === 'video' ? 'Video Media Entry' : 'Astronomy Media Preview'}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full sm:w-44 h-32 shrink-0 rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
      <img
        src={safeImgSrc}
        alt={item.title}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
};

export const SpaceDataSearchPanel: React.FC<SpaceDataSearchPanelProps> = ({
  isExpanded,
  onToggleExpand,
}) => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SpaceSearchResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedApodIds, setExpandedApodIds] = useState<Record<string, boolean>>({});

  if (!isExpanded) return null;

  const runSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/nasa/space-search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Request failed with HTTP ${res.status}`);
      }
      setSearchResult(data);
    } catch (err: any) {
      setErrorMessage(
        navigator.onLine
          ? err?.message || 'Unable to reach NASA space data services.'
          : 'Offline mode active. Live NASA Space Data Search requires an internet connection.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSearchResult(null);
    setErrorMessage(null);
    setExpandedApodIds({});
  };

  const toggleApodExplain = (id: string) => {
    setExpandedApodIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderCard = (item: SpaceSearchResultItem) => {
    switch (item.kind) {
      case 'apod': {
        const isOpen = !!expandedApodIds[item.id];
        return (
          <article
            key={item.id}
            className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row gap-3.5"
          >
            <ApodImageFrame item={item} />
            <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-slate-400">
                  <span className="text-cyan-400 font-semibold">APOD</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{item.date}</span>
                  {item.copyright && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate max-w-[200px]">{item.copyright}</span>
                    </>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-slate-100 mt-1 leading-snug">
                  {item.title}
                </h4>
                <p className={`text-xs text-slate-300 mt-1.5 leading-relaxed ${isOpen ? '' : 'line-clamp-2'}`}>
                  {item.explanation}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                {item.explanation.length > 140 && (
                  <button
                    type="button"
                    onClick={() => toggleApodExplain(item.id)}
                    className="text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {isOpen ? 'Show less' : 'Read explanation'}
                  </button>
                )}
                {safeExternalHref(item.hdUrl || item.url) && (
                  <a
                    href={safeExternalHref(item.hdUrl || item.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <span>Open media</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </article>
        );
      }

      case 'asteroid':
        return (
          <article
            key={item.id}
            className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-slate-400">
                  <span className="inline-flex items-center gap-1 text-cyan-400 font-semibold">
                    <Orbit className="w-3 h-3" />
                    Near-Earth Object
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{item.closeApproachDate}</span>
                </div>
                <h4 className="text-sm font-semibold text-slate-100 mt-0.5 truncate">
                  {item.name}
                </h4>
              </div>
              <span
                className={`text-[11px] font-mono font-semibold whitespace-nowrap shrink-0 flex items-center gap-1 ${
                  item.isHazardous ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {item.isHazardous && <AlertTriangle className="w-3.5 h-3.5" />}
                {item.isHazardous ? 'Hazardous' : 'Non-Hazardous'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80 text-xs">
              <div>
                <div className="text-[10px] font-mono text-slate-500 uppercase">Miss Distance</div>
                <div className="font-mono tabular-nums text-slate-200 font-medium">
                  {item.missDistanceKm.toLocaleString()} km
                </div>
                <div className="text-[10px] font-mono tabular-nums text-slate-400">
                  {item.missDistanceLunar} LD
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-500 uppercase">Velocity</div>
                <div className="font-mono tabular-nums text-slate-200 font-medium">
                  {item.velocityKmh.toLocaleString()} km/h
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-500 uppercase">Est. Diameter</div>
                <div className="font-mono tabular-nums text-slate-200 font-medium">
                  {item.diameterMinMeters}–{item.diameterMaxMeters} m
                </div>
              </div>
            </div>

            {safeExternalHref(item.nasaJplUrl) && (
              <div className="pt-1">
                <a
                  href={safeExternalHref(item.nasaJplUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <span>NASA JPL Orbit Record</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </article>
        );

      case 'flare':
        return (
          <article
            key={item.id}
            className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-slate-400">
                  <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                    <Sun className="w-3 h-3" />
                    Solar Flare
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{item.beginTime.replace('T', ' ').replace('Z', ' UTC')}</span>
                  {item.sourceLocation && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{item.sourceLocation}</span>
                    </>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-slate-100 mt-0.5 font-mono">
                  Class {item.classType}
                  {item.activeRegionNum ? ` · Region AR${item.activeRegionNum}` : ''}
                </h4>
              </div>
              {safeExternalHref(item.link) && (
                <a
                  href={safeExternalHref(item.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 shrink-0"
                >
                  <span>CCMC</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {item.instruments.length > 0 && (
              <div className="text-[11px] font-mono text-slate-400">
                Instruments: {item.instruments.join(', ')}
              </div>
            )}
            {item.note && (
              <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{item.note}</p>
            )}
          </article>
        );

      case 'cme':
        return (
          <article
            key={item.id}
            className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-slate-400">
                  <span className="inline-flex items-center gap-1 text-cyan-400 font-semibold">
                    <Wind className="w-3 h-3" />
                    Coronal Mass Ejection
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{item.startTime.replace('T', ' ').replace('Z', ' UTC')}</span>
                </div>
                <h4 className="text-sm font-semibold text-slate-100 mt-0.5 font-mono">
                  {item.eventId}
                </h4>
              </div>
              {safeExternalHref(item.link) && (
                <a
                  href={safeExternalHref(item.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 shrink-0"
                >
                  <span>CCMC</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-slate-300">
              {item.speedKms !== undefined && <span>Speed: {item.speedKms} km/s</span>}
              {item.halfAngle !== undefined && <span>Half-Angle: {item.halfAngle}°</span>}
              {item.sourceLocation && <span>Origin: {item.sourceLocation}</span>}
              {item.isEarthFacing !== undefined && (
                <span className={item.isEarthFacing ? 'text-amber-400' : 'text-slate-400'}>
                  {item.isEarthFacing ? 'Earth-Directed' : 'Off-Axis'}
                </span>
              )}
            </div>
            {item.note && (
              <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{item.note}</p>
            )}
          </article>
        );

      case 'geomagnetic_storm':
        return (
          <article
            key={item.id}
            className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-slate-400">
                  <span className="inline-flex items-center gap-1 text-purple-400 font-semibold">
                    <Activity className="w-3 h-3" />
                    Geomagnetic Storm
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{item.startTime.replace('T', ' ').replace('Z', ' UTC')}</span>
                </div>
                <h4 className="text-sm font-semibold text-slate-100 mt-0.5 font-mono">
                  {item.eventId}
                  {item.kpIndex !== undefined ? ` · Kp Index ${item.kpIndex}` : ''}
                </h4>
              </div>
              {safeExternalHref(item.link) && (
                <a
                  href={safeExternalHref(item.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 shrink-0"
                >
                  <span>CCMC</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {item.note && (
              <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{item.note}</p>
            )}
          </article>
        );

      case 'fire':
        return (
          <article
            key={item.id}
            className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-slate-400">
                  <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                    <Flame className="w-3 h-3" />
                    Active Fire Detection
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{item.detectedAt}</span>
                </div>
                <h4 className="text-sm font-semibold text-slate-100 mt-0.5">
                  {item.title}
                </h4>
              </div>
              {safeExternalHref(item.link) && (
                <a
                  href={safeExternalHref(item.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 shrink-0"
                >
                  <span>Source</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-slate-300">
              {item.latitude !== undefined && item.longitude !== undefined && (
                <span>Coords: {item.latitude}, {item.longitude}</span>
              )}
              {item.brightness && <span>Brightness: {item.brightness}</span>}
              {item.confidence && <span>Confidence: {item.confidence}</span>}
              <span className="text-slate-400">{item.satelliteOrSource}</span>
            </div>
          </article>
        );

      case 'climate':
      case 'bio':
        return (
          <article
            key={item.id}
            className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-slate-400">
                  <span className="inline-flex items-center gap-1 text-cyan-400 font-semibold">
                    {item.kind === 'climate' ? (
                      <Thermometer className="w-3 h-3" />
                    ) : (
                      <FlaskConical className="w-3 h-3" />
                    )}
                    {item.sourceLabel}
                  </span>
                  {item.dateOrMission && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{item.dateOrMission}</span>
                    </>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-slate-100 mt-0.5 leading-snug">
                  {item.title}
                </h4>
                {item.subtitle && (
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {item.subtitle}
                  </div>
                )}
              </div>
              {safeExternalHref(item.link) && (
                <a
                  href={safeExternalHref(item.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 shrink-0"
                >
                  <span>Open</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
              {item.summary}
            </p>
            {item.highlights && item.highlights.length > 0 && (
              <ul className="space-y-1 pt-1 border-t border-slate-800/80 text-[11px] text-slate-300">
                {item.highlights.map((hl, idx) => (
                  <li key={idx} className="leading-snug">
                    · {hl}
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
    }
  };

  return (
    <section
      aria-label="NASA Space Data Search"
      className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 space-y-3"
    >
      {/* Search Bar Row */}
      <form onSubmit={runSearch} className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search NASA Space Data (e.g., APOD, asteroids, solar flares, CME, geomagnetic storms, fires, climate, bio)..."
            aria-label="Search NASA Space Data"
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-cyan-500/70 focus:outline-none text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={!query.trim() || isLoading}
          className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-mono font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Searching</span>
            </>
          ) : (
            <span>Search</span>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleExpand}
          aria-label="Collapse Space Data Search"
          title="Collapse Space Data Search"
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer shrink-0"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </form>

      {/* Dedicated Results Space Below the Search Bar */}
      <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3 min-h-[76px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-5 gap-2 text-xs font-mono text-cyan-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Querying NASA Open Data APIs...</span>
          </div>
        ) : errorMessage ? (
          <div className="flex items-start gap-2.5 text-xs text-rose-300 py-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-mono font-semibold">Search Error</div>
              <p className="text-rose-200/80 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        ) : searchResult ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400 pb-1 border-b border-slate-800/70">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-slate-300 font-semibold tabular-nums">
                  {searchResult.items.length} result{searchResult.items.length === 1 ? '' : 's'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Tools: {searchResult.detectedTools.map(t => TOOL_DISPLAY_NAMES[t] || t).join(', ')}
                </span>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="text-slate-400 hover:text-slate-200 underline cursor-pointer whitespace-nowrap"
              >
                Clear results
              </button>
            </div>

            {searchResult.notice && (
              <p className="text-[11px] font-mono text-amber-300/90 bg-amber-950/30 border border-amber-800/40 rounded-lg px-2.5 py-1.5">
                {searchResult.notice}
              </p>
            )}

            {searchResult.items.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">
                No matching NASA records returned for "{searchResult.query}". Try keywords like APOD, asteroids, solar flares, CME, geomagnetic storms, active fires, climate, or bio experiments.
              </div>
            ) : (
              <div className="max-h-[290px] overflow-y-auto pr-1 space-y-2.5">
                {searchResult.items.map(renderCard)}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2 text-xs text-slate-400">
            <span>
              Search results from NASA APOD, Near-Earth Asteroids, DONKI Space Weather, Active Fires, Climate Indicators, and ISS Bio Experiments will appear here.
            </span>
            <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap shrink-0">
              12 NASA tools connected
            </span>
          </div>
        )}
      </div>
    </section>
  );
};
