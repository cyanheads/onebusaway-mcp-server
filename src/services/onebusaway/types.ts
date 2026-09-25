/**
 * @fileoverview Domain types for the OneBusAway service layer.
 * @module services/onebusaway/types
 */

// --- Shared sub-types ---

export interface Position {
  lat: number;
  lon: number;
}

export interface WheelchairBoarding {
  value: 'ACCESSIBLE' | 'NOT_ACCESSIBLE' | 'UNKNOWN';
}

// --- Agency ---

export interface Agency {
  coverageCenter: Position;
  coverageSpan: { latSpan: number; lonSpan: number };
  id: string;
  name: string;
  phone: string | null;
  timezone: string;
  url: string;
}

// --- Stop ---

export interface Stop {
  code: string;
  direction: string;
  id: string;
  lat: number;
  lon: number;
  name: string;
  routeIds: string[];
  wheelchairBoarding: 'ACCESSIBLE' | 'NOT_ACCESSIBLE' | 'UNKNOWN';
}

// --- Route ---

export interface Route {
  agencyId: string;
  agencyName: string;
  color: string | null;
  description: string;
  id: string;
  longName: string;
  shortName: string;
  type: number;
  url: string | null;
}

// --- Situation (service alert) ---

export interface Situation {
  description: string | null;
  id: string;
  summary: string;
}

// --- Situation detail (full alert) ---

export interface SituationAffect {
  agencyId?: string;
  routeId?: string;
  stopId?: string;
  tripId?: string;
}

export interface SituationActiveWindow {
  from?: number;
  to?: number;
}

export interface SituationConsequence {
  condition?: string;
  diversionStopIds?: string[];
}

export interface SituationDetail {
  activeWindows: SituationActiveWindow[];
  affects: SituationAffect[];
  consequenceMessage: string | null;
  consequences: SituationConsequence[];
  description: string | null;
  id: string;
  reason: string | null;
  severity: string | null;
  summary: string;
  url: string | null;
}

// --- Block schedule ---

export interface BlockStopTime {
  arrivalTime: number;
  departureTime: number;
  dropOffType?: number;
  pickupType?: number;
  stopId: string;
}

export interface BlockTrip {
  accumulatedSlackTime: number;
  blockStopTimes: BlockStopTime[];
  distanceAlongBlock: number;
  tripId: string;
}

export interface BlockResult {
  activeServiceIds: string[];
  blockId: string;
  inactiveServiceIds: string[];
  trips: BlockTrip[];
}

// --- Arrivals ---

export interface ArrivalEntry {
  predicted: boolean;
  predictedArrivalTime: number | null;
  routeId: string;
  routeShortName: string;
  scheduleDeviation: number;
  scheduledArrivalTime: number;
  situationIds: string[];
  stopsAway: number | null;
  tripHeadsign: string;
  tripId: string;
  vehicleId: string | null;
  vehiclePosition: Position | null;
}

export interface ArrivalsResult {
  arrivals: ArrivalEntry[];
  currentTime: number;
  situations: Situation[];
  stopId: string;
  stopName: string;
}

// --- Stop context ---

/** Stop details as an arrivals response's references carry them — without the served-route list. */
export type StopSummary = Omit<Stop, 'routeIds'>;

export interface StopContextResult {
  alerts: SituationDetail[];
  arrivals: ArrivalEntry[];
  currentTime: number;
  stop: StopSummary | null;
  /** Situation IDs the response referenced but left out of `references.situations`. */
  unresolvedSituationIds: string[];
}

// --- Trip ---

export interface TripScheduleStop {
  arrivalTime: number;
  departureTime: number;
  distanceAlongTripMeters: number;
  stopId: string;
  stopName: string;
}

export interface TripStatus {
  closestStop: string | null;
  lastUpdateTime: number;
  nextStop: string | null;
  phase: string;
  position: Position | null;
  predicted: boolean;
  scheduleDeviation: number;
  vehicleId: string | null;
}

export interface TripResult {
  blockId: string | null;
  routeShortName: string;
  schedule: TripScheduleStop[] | null;
  situations: string[];
  status: TripStatus;
  tripHeadsign: string;
  tripId: string;
}

// --- Vehicles ---

export interface VehicleEntry {
  lastUpdateTime: number;
  nextStop: string | null;
  orientation: number | null;
  phase: string;
  position: Position;
  predicted: boolean;
  routeId: string | null;
  routeShortName: string | null;
  scheduleDeviation: number | null;
  tripHeadsign: string | null;
  tripId: string | null;
  vehicleId: string;
}

// --- Schedule for stop ---

export interface StopScheduleDeparture {
  scheduledDepartureTime: number;
  tripId: string;
}

export interface StopScheduleDirection {
  departures: StopScheduleDeparture[];
  tripHeadsign: string;
}

export interface StopScheduleRoute {
  directions: StopScheduleDirection[];
  routeId: string;
  routeShortName: string;
}

export interface StopScheduleResult {
  routes: StopScheduleRoute[];
  serviceDateMs: number;
  stopId: string;
  stopName: string;
}

// --- Schedule for route ---

export interface RouteScheduleStopTime {
  arrivalTime: number;
  departureTime: number;
  stopId: string;
  stopName: string;
}

export interface RouteScheduleTrip {
  serviceId: string;
  stops: RouteScheduleStopTime[];
  tripHeadsign: string;
  tripId: string;
}

export interface RouteScheduleResult {
  routeId: string;
  routeShortName: string;
  serviceDateMs: number;
  trips: RouteScheduleTrip[];
}
