export type SpaceSearchToolId =
  | 'get_apod'
  | 'search_apod_archive'
  | 'get_asteroids_this_week'
  | 'find_closest_asteroids'
  | 'check_asteroid_hazard'
  | 'get_active_fires'
  | 'query_fire_hotspots'
  | 'get_solar_flares'
  | 'get_cmes'
  | 'get_geomagnetic_storms'
  | 'get_climate_indicator'
  | 'search_bio_experiments';

export interface SpaceSearchApodItem {
  kind: 'apod';
  id: string;
  toolId: SpaceSearchToolId;
  title: string;
  date: string;
  explanation: string;
  mediaType: 'image' | 'video';
  url: string;
  hdUrl?: string;
  copyright?: string;
  sourceLabel: string;
}

export interface SpaceSearchAsteroidItem {
  kind: 'asteroid';
  id: string;
  toolId: SpaceSearchToolId;
  name: string;
  closeApproachDate: string;
  diameterMinMeters: number;
  diameterMaxMeters: number;
  velocityKmh: number;
  missDistanceKm: number;
  missDistanceLunar: number;
  isHazardous: boolean;
  nasaJplUrl?: string;
  sourceLabel: string;
}

export interface SpaceSearchFlareItem {
  kind: 'flare';
  id: string;
  toolId: SpaceSearchToolId;
  eventId: string;
  classType: string;
  beginTime: string;
  peakTime?: string;
  endTime?: string;
  sourceLocation?: string;
  activeRegionNum?: number;
  instruments: string[];
  note?: string;
  link?: string;
  sourceLabel: string;
}

export interface SpaceSearchCmeItem {
  kind: 'cme';
  id: string;
  toolId: SpaceSearchToolId;
  eventId: string;
  startTime: string;
  sourceLocation?: string;
  speedKms?: number;
  halfAngle?: number;
  cmeType?: string;
  isEarthFacing?: boolean;
  instruments: string[];
  note?: string;
  link?: string;
  sourceLabel: string;
}

export interface SpaceSearchStormItem {
  kind: 'geomagnetic_storm';
  id: string;
  toolId: SpaceSearchToolId;
  eventId: string;
  startTime: string;
  kpIndex?: number;
  observedTime?: string;
  note?: string;
  link?: string;
  sourceLabel: string;
}

export interface SpaceSearchFireItem {
  kind: 'fire';
  id: string;
  toolId: SpaceSearchToolId;
  title: string;
  latitude?: number;
  longitude?: number;
  brightness?: string;
  confidence?: string;
  detectedAt: string;
  satelliteOrSource: string;
  link?: string;
  sourceLabel: string;
}

export interface SpaceSearchKnowledgeItem {
  kind: 'climate' | 'bio';
  id: string;
  toolId: SpaceSearchToolId;
  title: string;
  subtitle?: string;
  summary: string;
  highlights?: string[];
  dateOrMission?: string;
  link?: string;
  sourceLabel: string;
}

export type SpaceSearchResultItem =
  | SpaceSearchApodItem
  | SpaceSearchAsteroidItem
  | SpaceSearchFlareItem
  | SpaceSearchCmeItem
  | SpaceSearchStormItem
  | SpaceSearchFireItem
  | SpaceSearchKnowledgeItem;

export interface SpaceSearchResponse {
  query: string;
  detectedTools: SpaceSearchToolId[];
  fetchedAt: string;
  items: SpaceSearchResultItem[];
  notice?: string;
}
