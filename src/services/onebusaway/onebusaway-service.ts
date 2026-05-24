/**
 * @fileoverview OneBusAway SDK wrapper service. Initializes the SDK client and exposes
 * typed methods for all API operations used by the tool handlers.
 * @module services/onebusaway/onebusaway-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import { notFound, rateLimited, serviceUnavailable } from '@cyanheads/mcp-ts-core/errors';
import OnebusawaySDK from 'onebusaway-sdk';
import type { ServerConfig } from '@/config/server-config.js';
import type {
  Agency,
  ArrivalEntry,
  ArrivalsResult,
  Route,
  RouteScheduleResult,
  RouteScheduleTrip,
  Situation,
  Stop,
  StopScheduleResult,
  StopScheduleRoute,
  TripResult,
  VehicleEntry,
} from './types.js';

/** Maps wheelchair_boarding string/number to the canonical enum value. */
function normalizeWheelchair(raw: string | undefined): 'ACCESSIBLE' | 'NOT_ACCESSIBLE' | 'UNKNOWN' {
  if (raw === '1' || raw === 'ACCESSIBLE') return 'ACCESSIBLE';
  if (raw === '2' || raw === 'NOT_ACCESSIBLE') return 'NOT_ACCESSIBLE';
  return 'UNKNOWN';
}

/** Builds a Stop domain object from a raw API stop shape. */
function normalizeStop(raw: {
  id: string;
  code?: string;
  name: string;
  lat: number;
  lon: number;
  direction?: string;
  routeIds: string[];
  wheelchairBoarding?: string;
}): Stop {
  return {
    id: raw.id,
    code: raw.code ?? '',
    name: raw.name,
    lat: raw.lat,
    lon: raw.lon,
    direction: raw.direction ?? '',
    routeIds: raw.routeIds,
    wheelchairBoarding: normalizeWheelchair(raw.wheelchairBoarding),
  };
}

/** Builds a Route domain object from raw References.Route + optional agency name. */
function normalizeRoute(
  raw: {
    id: string;
    agencyId: string;
    type: number;
    shortName?: string;
    nullSafeShortName?: string;
    longName?: string;
    description?: string;
    color?: string;
    url?: string;
  },
  agencyName: string,
): Route {
  return {
    id: raw.id,
    shortName: raw.shortName ?? raw.nullSafeShortName ?? '',
    longName: raw.longName ?? '',
    description: raw.description ?? '',
    agencyId: raw.agencyId,
    agencyName,
    type: raw.type,
    color: raw.color ?? null,
    url: raw.url ?? null,
  };
}

/** Classifies SDK errors to McpError subclasses. */
function classifyError(err: unknown, entityType: string, entityId: string): never {
  if (err instanceof OnebusawaySDK.NotFoundError) {
    throw notFound(`${entityType} "${entityId}" not found.`, { id: entityId });
  }
  if (err instanceof OnebusawaySDK.RateLimitError) {
    throw rateLimited(
      'OneBusAway rate limit reached. The Puget Sound instance enforces ~20 req/min per IP.',
      { reason: 'rate_limited' },
    );
  }
  if (err instanceof OnebusawaySDK.APIConnectionError) {
    throw serviceUnavailable('Cannot connect to OneBusAway API.', {}, { cause: err });
  }
  throw serviceUnavailable(
    `OneBusAway API error: ${err instanceof Error ? err.message : String(err)}`,
    {},
    { cause: err instanceof Error ? err : undefined },
  );
}

export class OneBusAwayService {
  private readonly client: OnebusawaySDK;

  constructor(config: ServerConfig) {
    this.client = new OnebusawaySDK({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: 0, // framework withRetry handles retries
    });
  }

  // ----- Agencies -----

  async listAgencies(ctx: Context): Promise<Agency[]> {
    ctx.log.debug('listAgencies');
    try {
      const resp = await this.client.agenciesWithCoverage.list();
      const refs = resp.data.references;
      const agencyMap = new Map(refs.agencies.map((a) => [a.id, a]));

      return resp.data.list.map((item) => {
        const agencyRef = agencyMap.get(item.agencyId);
        return {
          id: item.agencyId,
          name: agencyRef?.name ?? item.agencyId,
          url: agencyRef?.url ?? '',
          phone: agencyRef?.phone ?? null,
          timezone: agencyRef?.timezone ?? '',
          coverageCenter: { lat: item.lat, lon: item.lon },
          coverageSpan: { latSpan: item.latSpan, lonSpan: item.lonSpan },
        };
      });
    } catch (err) {
      classifyError(err, 'agencies', 'list');
    }
  }

  // ----- Stops -----

  async findStops(
    params: { lat: number; lon: number; radius?: number; query?: string },
    ctx: Context,
  ): Promise<{ stops: Stop[]; limitExceeded: boolean }> {
    ctx.log.debug('findStops', { lat: params.lat, lon: params.lon });
    try {
      const resp = await this.client.stopsForLocation.list({
        lat: params.lat,
        lon: params.lon,
        ...(params.radius != null && { radius: params.radius }),
        ...(params.query && { query: params.query }),
      });
      return {
        stops: resp.data.list.map(normalizeStop),
        limitExceeded: resp.data.limitExceeded,
      };
    } catch (err) {
      classifyError(err, 'stops-for-location', 'query');
    }
  }

  async getStop(stopId: string, ctx: Context): Promise<Stop> {
    ctx.log.debug('getStop', { stopId });
    try {
      const resp = await this.client.stop.retrieve(stopId);
      if (!resp.data) throw notFound(`stop "${stopId}" not found.`, { id: stopId });
      return normalizeStop(resp.data.entry);
    } catch (err) {
      classifyError(err, 'stop', stopId);
    }
  }

  async searchStops(params: { query: string; maxCount?: number }, ctx: Context): Promise<Stop[]> {
    ctx.log.debug('searchStops', { query: params.query });
    try {
      const resp = await this.client.searchForStop.list({
        input: params.query,
        ...(params.maxCount != null && { maxCount: params.maxCount }),
      });
      if (!resp.data) return [];
      return resp.data.list.map(normalizeStop);
    } catch (err) {
      // OBA returns 404 when no stops match — not a real error, just an empty result.
      if (err instanceof OnebusawaySDK.NotFoundError) return [];
      classifyError(err, 'search/stop', params.query);
    }
  }

  // ----- Routes -----

  async findRoutes(
    params: { lat: number; lon: number; radius?: number; query?: string },
    ctx: Context,
  ): Promise<Route[]> {
    ctx.log.debug('findRoutes', { lat: params.lat, lon: params.lon });
    try {
      const resp = await this.client.routesForLocation.list({
        lat: params.lat,
        lon: params.lon,
        ...(params.radius != null && { radius: params.radius }),
        ...(params.query && { query: params.query }),
      });
      const agencyMap = new Map(resp.data.references.agencies.map((a) => [a.id, a]));
      return resp.data.list.map((r) =>
        normalizeRoute(r, agencyMap.get(r.agencyId)?.name ?? r.agencyId),
      );
    } catch (err) {
      classifyError(err, 'routes-for-location', 'query');
    }
  }

  async getRoute(routeId: string, ctx: Context): Promise<Route> {
    ctx.log.debug('getRoute', { routeId });
    try {
      const resp = await this.client.route.retrieve(routeId);
      const refs = resp.data.references;
      const agencyMap = new Map(refs.agencies.map((a) => [a.id, a]));
      const r = resp.data.entry;
      return normalizeRoute(r, agencyMap.get(r.agencyId)?.name ?? r.agencyId);
    } catch (err) {
      classifyError(err, 'route', routeId);
    }
  }

  async listRoutesForAgency(agencyId: string, ctx: Context): Promise<Route[]> {
    ctx.log.debug('listRoutesForAgency', { agencyId });
    try {
      const resp = await this.client.routesForAgency.list(agencyId);
      if (!resp.data) throw notFound(`agency "${agencyId}" not found.`, { id: agencyId });
      // routes-for-agency references block may not include the agency itself
      const agencyName =
        resp.data.references.agencies.find((a) => a.id === agencyId)?.name ?? agencyId;
      return resp.data.list.map((r) => normalizeRoute(r, agencyName));
    } catch (err) {
      classifyError(err, 'agency', agencyId);
    }
  }

  async searchRoutes(params: { query: string; maxCount?: number }, ctx: Context): Promise<Route[]> {
    ctx.log.debug('searchRoutes', { query: params.query });
    try {
      const resp = await this.client.searchForRoute.list({
        input: params.query,
        ...(params.maxCount != null && { maxCount: params.maxCount }),
      });
      if (!resp.data) return [];
      const agencyMap = new Map(resp.data.references.agencies.map((a) => [a.id, a]));
      return resp.data.list.map((r) =>
        normalizeRoute(r, agencyMap.get(r.agencyId)?.name ?? r.agencyId),
      );
    } catch (err) {
      // OBA returns 404 when no routes match — not a real error, just an empty result.
      if (err instanceof OnebusawaySDK.NotFoundError) return [];
      classifyError(err, 'search/route', params.query);
    }
  }

  // ----- Arrivals -----

  async getArrivals(
    params: { stopId: string; minutesBefore?: number; minutesAfter?: number },
    ctx: Context,
  ): Promise<ArrivalsResult> {
    ctx.log.debug('getArrivals', { stopId: params.stopId });
    try {
      const resp = await this.client.arrivalAndDeparture.list(params.stopId, {
        ...(params.minutesBefore != null && { minutesBefore: params.minutesBefore }),
        ...(params.minutesAfter != null && { minutesAfter: params.minutesAfter }),
      });
      const refs = resp.data.references;
      const routeMap = new Map(refs.routes.map((r) => [r.id, r]));
      const stopMap = new Map(refs.stops.map((s) => [s.id, s]));
      const situationMap = new Map(refs.situations.map((s) => [s.id, s]));

      const stopRef = stopMap.get(params.stopId);
      const stopName = stopRef?.name ?? params.stopId;

      const arrivals: ArrivalEntry[] = resp.data.entry.arrivalsAndDepartures.map((ad) => {
        const routeRef = routeMap.get(ad.routeId);
        const status = ad.tripStatus;
        const predicted = ad.predicted ?? false;

        return {
          routeShortName:
            ad.routeShortName ?? routeRef?.shortName ?? routeRef?.nullSafeShortName ?? ad.routeId,
          tripHeadsign: ad.tripHeadsign,
          predicted,
          predictedArrivalTime:
            predicted && ad.predictedArrivalTime > 0 ? ad.predictedArrivalTime : null,
          scheduledArrivalTime: ad.scheduledArrivalTime,
          scheduleDeviation: status?.scheduleDeviation ?? 0,
          vehicleId: status?.vehicleId ?? null,
          vehiclePosition:
            status?.position?.lat != null && status?.position?.lon != null
              ? { lat: status.position.lat, lon: status.position.lon }
              : null,
          stopsAway: ad.numberOfStopsAway,
          tripId: ad.tripId,
          routeId: ad.routeId,
          situationIds: ad.situationIds ?? [],
        };
      });

      // Collect unique situation IDs referenced by arrivals
      const allSituationIds = new Set(arrivals.flatMap((a) => a.situationIds));
      const situations: Situation[] = [...allSituationIds]
        .map((id) => situationMap.get(id))
        .filter((s): s is NonNullable<typeof s> => s != null)
        .map((s) => ({
          id: s.id,
          summary: s.summary?.value ?? '',
          description: s.description?.value ?? null,
        }));

      return {
        stopId: params.stopId,
        stopName,
        currentTime: resp.currentTime,
        arrivals,
        situations,
      };
    } catch (err) {
      classifyError(err, 'stop', params.stopId);
    }
  }

  // ----- Trip -----

  async getTrip(
    params: { tripId: string; serviceDate?: number; includeSchedule?: boolean },
    ctx: Context,
  ): Promise<TripResult> {
    ctx.log.debug('getTrip', { tripId: params.tripId });
    try {
      const resp = await this.client.tripDetails.retrieve(params.tripId, {
        ...(params.serviceDate != null && { serviceDate: params.serviceDate }),
        includeSchedule: params.includeSchedule ?? true,
      });
      const refs = resp.data.references;
      const entry = resp.data.entry;
      const tripRef = refs.trips.find((t) => t.id === params.tripId);
      const routeRef = refs.routes.find((r) => r.id === tripRef?.routeId);
      const stopMap = new Map(refs.stops.map((s) => [s.id, s]));

      const status = entry.status;
      const schedule = entry.schedule?.stopTimes
        ? entry.schedule.stopTimes.map((st) => {
            const stop = stopMap.get(st.stopId ?? '');
            return {
              stopId: st.stopId ?? '',
              stopName: stop?.name ?? st.stopId ?? '',
              arrivalTime: st.arrivalTime ?? 0,
              departureTime: st.departureTime ?? 0,
              distanceAlongTripMeters: st.distanceAlongTrip ?? 0,
            };
          })
        : null;

      return {
        tripId: params.tripId,
        routeShortName:
          tripRef?.routeShortName ?? routeRef?.shortName ?? routeRef?.nullSafeShortName ?? '',
        tripHeadsign: tripRef?.tripHeadsign ?? '',
        status: {
          phase: status?.phase ?? 'unknown',
          predicted: status?.predicted ?? false,
          position:
            status?.position?.lat != null && status?.position?.lon != null
              ? { lat: status.position.lat, lon: status.position.lon }
              : null,
          scheduleDeviation: status?.scheduleDeviation ?? 0,
          nextStop: status?.nextStop ?? null,
          closestStop: status?.closestStop ?? null,
          vehicleId: status?.vehicleId ?? null,
          lastUpdateTime: status?.lastUpdateTime ?? 0,
        },
        schedule,
        situations: entry.situationIds ?? [],
      };
    } catch (err) {
      classifyError(err, 'trip', params.tripId);
    }
  }

  // ----- Vehicles -----

  async getVehicles(
    params: { agencyId: string; routeId?: string },
    ctx: Context,
  ): Promise<VehicleEntry[]> {
    ctx.log.debug('getVehicles', { agencyId: params.agencyId });
    try {
      const resp = await this.client.vehiclesForAgency.list(params.agencyId);
      const refs = resp.data.references;
      const tripMap = new Map(refs.trips.map((t) => [t.id, t]));
      const routeMap = new Map(refs.routes.map((r) => [r.id, r]));

      let vehicles = resp.data.list
        .filter((v) => v.location != null)
        .map((v): VehicleEntry => {
          const tripRef = tripMap.get(v.tripId);
          const routeId = v.tripStatus?.activeTripId
            ? (tripMap.get(v.tripStatus.activeTripId)?.routeId ?? tripRef?.routeId ?? null)
            : (tripRef?.routeId ?? null);
          const routeRef = routeId ? routeMap.get(routeId) : null;

          return {
            vehicleId: v.vehicleId,
            tripId: v.tripId || null,
            routeId,
            routeShortName: routeRef?.shortName ?? routeRef?.nullSafeShortName ?? null,
            tripHeadsign: tripRef?.tripHeadsign ?? null,
            position: { lat: v.location.lat ?? 0, lon: v.location.lon ?? 0 },
            lastUpdateTime: v.lastUpdateTime,
            phase: v.tripStatus?.phase ?? 'unknown',
            scheduleDeviation: v.tripStatus?.scheduleDeviation ?? null,
            orientation: v.tripStatus?.orientation ?? null,
            nextStop: v.tripStatus?.nextStop ?? null,
            predicted: v.tripStatus?.predicted ?? false,
          };
        });

      // Client-side route filter
      if (params.routeId) {
        vehicles = vehicles.filter((v) => v.routeId === params.routeId);
      }

      return vehicles;
    } catch (err) {
      classifyError(err, 'agency', params.agencyId);
    }
  }

  // ----- Schedules -----

  async getScheduleForStop(
    params: { stopId: string; date?: string },
    ctx: Context,
  ): Promise<StopScheduleResult> {
    ctx.log.debug('getScheduleForStop', { stopId: params.stopId });
    try {
      const resp = await this.client.scheduleForStop.retrieve(params.stopId, {
        ...(params.date && { date: params.date }),
      });
      const refs = resp.data.references;
      const routeMap = new Map(refs.routes.map((r) => [r.id, r]));
      const entry = resp.data.entry;
      const stopRef = refs.stops.find((s) => s.id === params.stopId);

      const routes: StopScheduleRoute[] = entry.stopRouteSchedules.map((srs) => {
        const routeRef = routeMap.get(srs.routeId);
        return {
          routeId: srs.routeId,
          routeShortName: routeRef?.shortName ?? routeRef?.nullSafeShortName ?? srs.routeId,
          directions: srs.stopRouteDirectionSchedules.map((srds) => ({
            tripHeadsign: srds.tripHeadsign,
            departures: srds.scheduleStopTimes.map((sst) => ({
              scheduledDepartureTime: sst.departureTime,
              tripId: sst.tripId,
            })),
          })),
        };
      });

      return {
        stopId: params.stopId,
        stopName: stopRef?.name ?? params.stopId,
        serviceDateMs: entry.date,
        routes,
      };
    } catch (err) {
      classifyError(err, 'stop', params.stopId);
    }
  }

  async getScheduleForRoute(
    params: { routeId: string; date?: string },
    ctx: Context,
  ): Promise<RouteScheduleResult> {
    ctx.log.debug('getScheduleForRoute', { routeId: params.routeId });
    try {
      const resp = await this.client.scheduleForRoute.retrieve(params.routeId, {
        ...(params.date && { date: params.date }),
      });
      const entry = resp.data.entry;
      const stopMap = new Map((entry.stops ?? []).map((s) => [s.id, s]));

      // Build a map from tripId → stop times from stopTripGroupings
      const tripStopTimesMap = new Map<
        string,
        Array<{ stopId: string; arrivalTime: number; departureTime: number }>
      >();
      for (const grouping of entry.stopTripGroupings ?? []) {
        for (const twst of grouping.tripsWithStopTimes ?? []) {
          tripStopTimesMap.set(
            twst.tripId,
            twst.stopTimes.map((st) => ({
              stopId: st.stopId,
              arrivalTime: st.arrivalTime,
              departureTime: st.departureTime,
            })),
          );
        }
      }

      // Get route short name from the first trip or references
      const trips_ = entry.trips ?? [];
      const firstTrip = trips_[0];
      const routeShortName = firstTrip?.routeShortName ?? entry.routeId;

      const trips: RouteScheduleTrip[] = trips_.map((t) => {
        const stopTimes = tripStopTimesMap.get(t.id) ?? [];
        return {
          tripId: t.id,
          tripHeadsign: t.tripHeadsign ?? '',
          serviceId: t.serviceId,
          stops: stopTimes.map((st) => ({
            stopId: st.stopId,
            stopName: stopMap.get(st.stopId)?.name ?? st.stopId,
            arrivalTime: st.arrivalTime,
            departureTime: st.departureTime,
          })),
        };
      });

      return {
        routeId: entry.routeId,
        routeShortName,
        serviceDateMs: entry.scheduleDate,
        trips,
      };
    } catch (err) {
      classifyError(err, 'route', params.routeId);
    }
  }
}

// --- Init / accessor pattern ---

let _service: OneBusAwayService | undefined;

export function initOneBusAwayService(config: ServerConfig): void {
  _service = new OneBusAwayService(config);
}

export function getOneBusAwayService(): OneBusAwayService {
  if (!_service) {
    throw new Error('OneBusAwayService not initialized — call initOneBusAwayService() in setup()');
  }
  return _service;
}
