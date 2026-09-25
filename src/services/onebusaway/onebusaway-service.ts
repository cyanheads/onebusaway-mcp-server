/**
 * @fileoverview OneBusAway SDK wrapper service. Initializes the SDK client, paces
 * every upstream request against the shared API key budget, and exposes typed
 * methods for all API operations used by the tool handlers.
 * @module services/onebusaway/onebusaway-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import {
  McpError,
  notFound,
  rateLimited,
  serviceUnavailable,
  validationError,
} from '@cyanheads/mcp-ts-core/errors';
import { createPacer, type Pacer } from '@cyanheads/mcp-ts-core/utils';
import OnebusawaySDK from 'onebusaway-sdk';
import type { ServerConfig } from '@/config/server-config.js';
import type {
  Agency,
  ArrivalEntry,
  ArrivalsResult,
  BlockResult,
  Route,
  RouteScheduleResult,
  RouteScheduleStopTime,
  RouteScheduleTrip,
  Situation,
  SituationDetail,
  Stop,
  StopContextResult,
  StopScheduleResult,
  StopScheduleRoute,
  StopSummary,
  TripResult,
  VehicleEntry,
} from './types.js';

/**
 * Back-off the pacer holds its shared gate for after an upstream rate limit —
 * `baseMs` on the first, doubling per consecutive limit up to `maxMs`.
 */
const COOLDOWN = { baseMs: 5_000, maxMs: 60_000 };

/** Seconds a caller is told to wait after an upstream rate limit: the first gate hold. */
const COOLDOWN_SECONDS = COOLDOWN.baseMs / 1000;

/** Absolute backpressure — an arrival behind this many waiters is shed instead of queued. */
const MAX_QUEUE_DEPTH = 200;

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
    shortName: firstNonEmpty(raw.shortName, raw.nullSafeShortName),
    longName: raw.longName ?? '',
    description: raw.description ?? '',
    agencyId: raw.agencyId,
    agencyName,
    type: raw.type,
    color: raw.color ?? null,
    url: raw.url ?? null,
  };
}

/**
 * First non-empty string among the candidates, or `''` if none qualifies. OBA
 * populates `nullSafeShortName` precisely when `shortName` is the empty string,
 * so a plain `??` chain wrongly stops at `''` and never reaches the fallback —
 * this skips empty strings the way `??` skips null/undefined.
 */
function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    if (v) return v;
  }
  return '';
}

/**
 * Discovery guidance surfaced on not-found errors as `data.recovery.hint`, keyed
 * by contract reason. The not-found error is the moment a caller is provably
 * holding a bad ID, so the pointer to the tool that yields a valid one belongs
 * here — on the error path where the misuse surfaces — not only in the tool
 * description. The framework mirrors `data.recovery.hint` into the client's text
 * surface automatically.
 */
const NOT_FOUND_HINTS: Record<string, string> = {
  stop_not_found:
    'Stop IDs come from onebusaway_search_stops or onebusaway_find_stops, in {agencyId}_{localId} format (e.g. "1_75403").',
  route_not_found:
    'Route IDs come from onebusaway_search_routes or onebusaway_list_routes_for_agency — a route ID is not the short name shown on the vehicle (e.g. "44").',
  agency_not_found:
    'Agency IDs are numeric and come from onebusaway_list_agencies; an agency name is not accepted.',
  trip_not_found: 'A tripId comes from onebusaway_get_arrivals — each arrival carries its tripId.',
  block_not_found: 'A blockId comes from onebusaway_get_trip — the trip carries its blockId.',
  situation_not_found: 'A situationId comes from onebusaway_get_arrivals (situations[].id).',
};

/** OneBusAway schedule fields returned in production but omitted from SDK 1.20's generated type. */
type ScheduleRouteEntryExtension = {
  stops?: Array<{ id: string; name: string }>;
  trips?: Array<{
    id: string;
    tripHeadsign?: string;
    serviceId: string;
    routeShortName?: string;
  }>;
};

/**
 * Builds the `data` payload for a not-found error: the offending id, the contract
 * reason, and — when one is registered for the reason — the discovery hint.
 */
function notFoundData(id: string, reason: string): Record<string, unknown> {
  const hint = NOT_FOUND_HINTS[reason];
  return { id, reason, ...(hint && { recovery: { hint } }) };
}

/** The stop and time window for an arrivals-and-departures-for-stop request. */
type ArrivalsParams = { stopId: string; minutesBefore?: number; minutesAfter?: number };

/** An arrivals-and-departures-for-stop response body, including the stop-level fields SDK 1.21's type omits. */
type ArrivalsData = OnebusawaySDK.ArrivalAndDepartureListResponse['data'] & {
  entry: { situationIds?: string[] };
};

/** A situation as OneBusAway serves it — `/situation/{id}` entries and `references.situations` share this shape. */
type RawSituation = {
  id: string;
  summary?: { value?: string };
  description?: { value?: string };
  reason?: string;
  severity?: string;
  consequenceMessage?: string;
  allAffects?: Array<{ agencyId?: string; routeId?: string; stopId?: string; tripId?: string }>;
  consequences?: Array<{
    condition?: string;
    conditionDetails?: { diversionStopIds?: string[] };
  }>;
  activeWindows?: Array<{ from?: number; to?: number }>;
  url?: { value?: string };
};

/** Maps a raw situation to the full alert shape, dropping the empty-string fields OBA pads affects with. */
function toSituationDetail(entry: RawSituation): SituationDetail {
  return {
    id: entry.id,
    summary: entry.summary?.value ?? '',
    description: entry.description?.value ?? null,
    reason: entry.reason ?? null,
    severity: entry.severity ?? null,
    consequenceMessage: entry.consequenceMessage ?? null,
    affects: (entry.allAffects ?? []).map((a) => ({
      ...(a.agencyId && { agencyId: a.agencyId }),
      ...(a.routeId && { routeId: a.routeId }),
      ...(a.stopId && { stopId: a.stopId }),
      ...(a.tripId && { tripId: a.tripId }),
    })),
    consequences: (entry.consequences ?? []).map((c) => ({
      ...(c.condition && { condition: c.condition }),
      ...(c.conditionDetails?.diversionStopIds?.length && {
        diversionStopIds: c.conditionDetails.diversionStopIds,
      }),
    })),
    activeWindows: entry.activeWindows ?? [],
    url: entry.url?.value ?? null,
  };
}

/** Maps every upstream arrival at the stop to the domain shape, naming routes from the response's references. */
function mapArrivals(data: ArrivalsData): ArrivalEntry[] {
  const routeMap = new Map(data.references.routes.map((r) => [r.id, r]));
  return data.entry.arrivalsAndDepartures.map((ad) => {
    const routeRef = routeMap.get(ad.routeId);
    const status = ad.tripStatus;
    const predicted = ad.predicted ?? false;

    return {
      routeShortName: firstNonEmpty(
        ad.routeShortName,
        routeRef?.shortName,
        routeRef?.nullSafeShortName,
        ad.routeId,
      ),
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
}

/**
 * Splits the stop's situation IDs into resolved situations and unresolved IDs. The
 * IDs are the unique union of the stop-level `entry.situationIds` (alerts on the
 * stop itself, or on a route with no arrival in the window) and every arrival's
 * own `situationIds` — stop-level first, each ID once.
 */
function collectSituations(
  data: ArrivalsData,
  arrivals: ArrivalEntry[],
): { situations: RawSituation[]; unresolvedIds: string[] } {
  const situationMap = new Map(data.references.situations.map((s) => [s.id, s]));
  const ids = new Set([
    ...(data.entry.situationIds ?? []),
    ...arrivals.flatMap((a) => a.situationIds),
  ]);
  const situations: RawSituation[] = [];
  const unresolvedIds: string[] = [];
  for (const id of ids) {
    const situation = situationMap.get(id);
    if (situation) situations.push(situation);
    else unresolvedIds.push(id);
  }
  return { situations, unresolvedIds };
}

/** Classifies SDK errors to McpError subclasses. Re-throws McpErrors as-is. */
function classifyError(
  err: unknown,
  entityType: string,
  entityId: string,
  notFoundReason?: string,
): never {
  if (err instanceof McpError) throw err;
  if (err instanceof OnebusawaySDK.NotFoundError) {
    throw notFound(
      `${entityType} "${entityId}" not found.`,
      notFoundReason ? notFoundData(entityId, notFoundReason) : { id: entityId },
    );
  }
  if (err instanceof OnebusawaySDK.RateLimitError) {
    /**
     * `retryAfter` is the hint the pacer honors when it closes its shared gate, so
     * the number the caller is given and the pause queued calls take are the same
     * one. Consecutive limits double the pause; a caller that returns early is
     * re-queued behind the gate rather than sent upstream.
     */
    throw rateLimited(
      `OneBusAway rate limit reached. Queued requests pause ${COOLDOWN_SECONDS}s before the next upstream call.`,
      {
        reason: 'rate_limited',
        retryable: true,
        retryAfter: COOLDOWN_SECONDS,
        recovery: {
          hint: `Retry in ${COOLDOWN_SECONDS}s. A single upstream API key is shared across all callers, so the limit is a global budget — calls made sooner queue behind the same pause rather than reaching OneBusAway.`,
        },
      },
      { cause: err },
    );
  }
  if (err instanceof OnebusawaySDK.APIConnectionError) {
    throw serviceUnavailable('Cannot connect to OneBusAway API.', {}, { cause: err });
  }
  if (err instanceof OnebusawaySDK.BadRequestError) {
    // The SDK message is `400 <upstream body>`, which carries OBA's `fieldErrors` naming the rejected input.
    throw validationError(
      `OneBusAway rejected the request as invalid: ${err.message}`,
      {
        retryable: false,
        recovery: {
          hint: 'Correct the input named in the field errors and call again — the same request is rejected every time.',
        },
      },
      { cause: err },
    );
  }
  throw serviceUnavailable(
    `OneBusAway API error: ${err instanceof Error ? err.message : String(err)}`,
    {},
    { cause: err instanceof Error ? err : undefined },
  );
}

/**
 * Restates a pacer shed under the `rate_limited` reason every tool declares.
 * `pacer_shed` is framework vocabulary; callers branch on the contract reason, and
 * `retryAfter` carries the seconds until the window frees a slot.
 */
function shedAsRateLimited(err: McpError): McpError {
  const { queueDepth, retryAfter } = err.data as { queueDepth: number; retryAfter: number };
  return rateLimited(
    `No OneBusAway request slot opened within the queue wait cap. The next slot frees in ${retryAfter}s.`,
    {
      reason: 'rate_limited',
      retryable: true,
      retryAfter,
      queueDepth,
      recovery: {
        hint: `Retry in ${retryAfter}s. A single upstream API key is shared across all callers, so slots free on the rate window rather than on demand — spacing calls out clears the queue.`,
      },
    },
    { cause: err },
  );
}

export class OneBusAwayService {
  private readonly client: OnebusawaySDK;
  private readonly pacer: Pacer;
  private readonly maxWaitMs: number;

  constructor(config: ServerConfig) {
    this.client = new OnebusawaySDK({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: 0, // one tool call = one upstream request; nothing wraps these calls in withRetry
    });
    this.maxWaitMs = config.rateLimitMaxWaitMs;
    this.pacer = createPacer({
      name: 'onebusaway',
      limits: [{ requests: config.rateLimitRequests, perMs: config.rateLimitWindowMs }],
      maxQueueDepth: MAX_QUEUE_DEPTH,
      cooldown: COOLDOWN,
    });
  }

  /** Releases the pacer's dispatch timer and rejects its queued waiters. */
  dispose(): void {
    this.pacer.dispose();
  }

  /**
   * Runs one upstream request through the process-wide pacer. Error classification
   * happens inside the task on purpose: the `RateLimited` it raises has to cross
   * `pacer.run` for the pacer to close its cooldown gate for every queued caller.
   * The SDK client takes no abort signal, so `ctx.signal` cancels a call while it
   * waits in the queue, not once it has been dispatched.
   */
  private async paced<T>(ctx: Context, task: () => Promise<T>): Promise<T> {
    try {
      return await this.pacer.run(task, { signal: ctx.signal, maxWaitMs: this.maxWaitMs });
    } catch (err) {
      if (err instanceof McpError && (err.data as { reason?: string })?.reason === 'pacer_shed') {
        throw shedAsRateLimited(err);
      }
      throw err;
    }
  }

  // ----- Agencies -----

  listAgencies(ctx: Context): Promise<{ agencies: Agency[]; limitExceeded: boolean }> {
    ctx.log.debug('listAgencies');
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.agenciesWithCoverage.list();
        if (!resp?.data) throw serviceUnavailable('OneBusAway returned no agency-coverage data.');
        const refs = resp.data.references;
        const agencyMap = new Map(refs.agencies.map((a) => [a.id, a]));

        const agencies = resp.data.list.map((item) => {
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
        return { agencies, limitExceeded: resp.data.limitExceeded ?? false };
      } catch (err) {
        classifyError(err, 'agencies', 'list');
      }
    });
  }

  // ----- Stops -----

  findStops(
    params: { lat: number; lon: number; radius?: number; query?: string },
    ctx: Context,
  ): Promise<{ stops: Stop[]; limitExceeded: boolean }> {
    ctx.log.debug('findStops', { lat: params.lat, lon: params.lon });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.stopsForLocation.list({
          lat: params.lat,
          lon: params.lon,
          ...(params.radius != null && { radius: params.radius }),
          ...(params.query && { query: params.query }),
        });
        if (!resp?.data)
          throw serviceUnavailable('OneBusAway returned no data for the stops-for-location query.');
        return {
          stops: resp.data.list.map(normalizeStop),
          limitExceeded: resp.data.limitExceeded ?? false,
        };
      } catch (err) {
        classifyError(err, 'stops-for-location', 'query');
      }
    });
  }

  getStop(stopId: string, ctx: Context): Promise<Stop> {
    ctx.log.debug('getStop', { stopId });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.stop.retrieve(stopId);
        if (!resp?.data?.entry)
          throw notFound(`stop "${stopId}" not found.`, notFoundData(stopId, 'stop_not_found'));
        return normalizeStop(resp.data.entry);
      } catch (err) {
        classifyError(err, 'stop', stopId, 'stop_not_found');
      }
    });
  }

  searchStops(
    params: { query: string; maxCount?: number },
    ctx: Context,
  ): Promise<{ stops: Stop[]; limitExceeded: boolean }> {
    ctx.log.debug('searchStops', { query: params.query });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.searchForStop.list({
          input: params.query,
          ...(params.maxCount != null && { maxCount: params.maxCount }),
        });
        if (!resp?.data) return { stops: [], limitExceeded: false };
        return {
          stops: resp.data.list.map(normalizeStop),
          limitExceeded: resp.data.limitExceeded ?? false,
        };
      } catch (err) {
        // OBA returns 404 when no stops match — not a real error, just an empty result.
        if (err instanceof OnebusawaySDK.NotFoundError) return { stops: [], limitExceeded: false };
        classifyError(err, 'search/stop', params.query);
      }
    });
  }

  // ----- Routes -----

  findRoutes(
    params: {
      lat: number;
      lon: number;
      radius?: number;
      latSpan?: number;
      lonSpan?: number;
      query?: string;
    },
    ctx: Context,
  ): Promise<{ routes: Route[]; limitExceeded: boolean }> {
    ctx.log.debug('findRoutes', { lat: params.lat, lon: params.lon });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.routesForLocation.list({
          lat: params.lat,
          lon: params.lon,
          ...(params.radius != null && { radius: params.radius }),
          ...(params.latSpan != null && { latSpan: params.latSpan }),
          ...(params.lonSpan != null && { lonSpan: params.lonSpan }),
          ...(params.query && { query: params.query }),
        });
        if (!resp?.data)
          throw serviceUnavailable(
            'OneBusAway returned no data for the routes-for-location query.',
          );
        const agencyMap = new Map(resp.data.references.agencies.map((a) => [a.id, a]));
        const routes = resp.data.list.map((r) =>
          normalizeRoute(r, agencyMap.get(r.agencyId)?.name ?? r.agencyId),
        );
        return { routes, limitExceeded: resp.data.limitExceeded ?? false };
      } catch (err) {
        classifyError(err, 'routes-for-location', 'query');
      }
    });
  }

  getRoute(routeId: string, ctx: Context): Promise<Route> {
    ctx.log.debug('getRoute', { routeId });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.route.retrieve(routeId);
        if (!resp?.data)
          throw notFound(`route "${routeId}" not found.`, notFoundData(routeId, 'route_not_found'));
        const refs = resp.data.references;
        const agencyMap = new Map(refs.agencies.map((a) => [a.id, a]));
        const r = resp.data.entry;
        return normalizeRoute(r, agencyMap.get(r.agencyId)?.name ?? r.agencyId);
      } catch (err) {
        classifyError(err, 'route', routeId, 'route_not_found');
      }
    });
  }

  listRoutesForAgency(
    agencyId: string,
    ctx: Context,
  ): Promise<{ routes: Route[]; limitExceeded: boolean }> {
    ctx.log.debug('listRoutesForAgency', { agencyId });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.routesForAgency.list(agencyId);
        if (!resp?.data)
          throw notFound(
            `agency "${agencyId}" not found.`,
            notFoundData(agencyId, 'agency_not_found'),
          );
        // routes-for-agency references block may not include the agency itself
        const agencyName =
          resp.data.references.agencies.find((a) => a.id === agencyId)?.name ?? agencyId;
        const routes = resp.data.list.map((r) => normalizeRoute(r, agencyName));
        return { routes, limitExceeded: resp.data.limitExceeded ?? false };
      } catch (err) {
        classifyError(err, 'agency', agencyId, 'agency_not_found');
      }
    });
  }

  searchRoutes(
    params: { query: string; maxCount?: number },
    ctx: Context,
  ): Promise<{ routes: Route[]; limitExceeded: boolean }> {
    ctx.log.debug('searchRoutes', { query: params.query });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.searchForRoute.list({
          input: params.query,
          ...(params.maxCount != null && { maxCount: params.maxCount }),
        });
        if (!resp?.data) return { routes: [], limitExceeded: false };
        const agencyMap = new Map(resp.data.references.agencies.map((a) => [a.id, a]));
        const routes = resp.data.list.map((r) =>
          normalizeRoute(r, agencyMap.get(r.agencyId)?.name ?? r.agencyId),
        );
        return { routes, limitExceeded: resp.data.limitExceeded ?? false };
      } catch (err) {
        // OBA returns 404 when no routes match — not a real error, just an empty result.
        if (err instanceof OnebusawaySDK.NotFoundError) return { routes: [], limitExceeded: false };
        classifyError(err, 'search/route', params.query);
      }
    });
  }

  // ----- Arrivals -----

  /**
   * Issues one paced arrivals-and-departures-for-stop request and maps the body
   * with `map`. Mapping runs inside the classified block, so a malformed body
   * surfaces the same way for every caller.
   */
  private arrivalsForStop<T>(
    params: ArrivalsParams,
    ctx: Context,
    map: (data: ArrivalsData, currentTime: number) => T,
  ): Promise<T> {
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.arrivalAndDeparture.list(params.stopId, {
          ...(params.minutesBefore != null && { minutesBefore: params.minutesBefore }),
          ...(params.minutesAfter != null && { minutesAfter: params.minutesAfter }),
        });
        if (!resp?.data)
          throw notFound(
            `stop "${params.stopId}" not found.`,
            notFoundData(params.stopId, 'stop_not_found'),
          );
        return map(resp.data, resp.currentTime);
      } catch (err) {
        classifyError(err, 'stop', params.stopId, 'stop_not_found');
      }
    });
  }

  getArrivals(params: ArrivalsParams, ctx: Context): Promise<ArrivalsResult> {
    ctx.log.debug('getArrivals', { stopId: params.stopId });
    return this.arrivalsForStop(params, ctx, (data, currentTime) => {
      const stopRef = data.references.stops.find((s) => s.id === params.stopId);
      const arrivals = mapArrivals(data);
      const situations: Situation[] = collectSituations(data, arrivals).situations.map((s) => ({
        id: s.id,
        summary: s.summary?.value ?? '',
        description: s.description?.value ?? null,
      }));

      return {
        stopId: params.stopId,
        stopName: stopRef?.name ?? params.stopId,
        currentTime,
        arrivals,
        situations,
      };
    });
  }

  /**
   * Stop details, arrivals, and full alert detail from the single arrivals
   * request — its references already carry the queried stop and every referenced
   * situation. The stop drops `routeIds`: the references copy lists only the routes
   * relevant to this response, not every route serving the stop.
   */
  getStopContext(params: ArrivalsParams, ctx: Context): Promise<StopContextResult> {
    ctx.log.debug('getStopContext', { stopId: params.stopId });
    return this.arrivalsForStop(params, ctx, (data, currentTime) => {
      const stopRef = data.references.stops.find((s) => s.id === params.stopId);
      const arrivals = mapArrivals(data);
      const { situations, unresolvedIds } = collectSituations(data, arrivals);
      let stop: StopSummary | null = null;
      if (stopRef) {
        const { routeIds: _served, ...summary } = normalizeStop(stopRef);
        stop = summary;
      }

      return {
        stop,
        currentTime,
        arrivals,
        alerts: situations.map(toSituationDetail),
        unresolvedSituationIds: unresolvedIds,
      };
    });
  }

  // ----- Trip -----

  getTrip(
    params: { tripId: string; serviceDate?: number; includeSchedule?: boolean },
    ctx: Context,
  ): Promise<TripResult> {
    ctx.log.debug('getTrip', { tripId: params.tripId });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.tripDetails.retrieve(params.tripId, {
          ...(params.serviceDate != null && { serviceDate: params.serviceDate }),
          includeSchedule: params.includeSchedule ?? true,
        });
        if (!resp?.data)
          throw notFound(
            `trip "${params.tripId}" not found.`,
            notFoundData(params.tripId, 'trip_not_found'),
          );
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
          routeShortName: firstNonEmpty(
            tripRef?.routeShortName,
            routeRef?.shortName,
            routeRef?.nullSafeShortName,
          ),
          tripHeadsign: tripRef?.tripHeadsign ?? '',
          blockId: tripRef?.blockId || null,
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
        classifyError(err, 'trip', params.tripId, 'trip_not_found');
      }
    });
  }

  // ----- Vehicles -----

  getVehicles(
    params: { agencyId: string; routeId?: string },
    ctx: Context,
  ): Promise<{ vehicles: VehicleEntry[]; limitExceeded: boolean }> {
    ctx.log.debug('getVehicles', { agencyId: params.agencyId });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.vehiclesForAgency.list(params.agencyId);
        if (!resp?.data)
          throw notFound(
            `agency "${params.agencyId}" not found.`,
            notFoundData(params.agencyId, 'agency_not_found'),
          );
        const refs = resp.data.references;
        const tripMap = new Map(refs.trips.map((t) => [t.id, t]));
        const routeMap = new Map(refs.routes.map((r) => [r.id, r]));

        let vehicles = resp.data.list.flatMap((v): VehicleEntry[] => {
          const location = v.location;
          if (location?.lat == null || location.lon == null) return [];

          const tripRef = v.tripId ? tripMap.get(v.tripId) : undefined;
          const routeId = v.tripStatus?.activeTripId
            ? (tripMap.get(v.tripStatus.activeTripId)?.routeId ?? tripRef?.routeId ?? null)
            : (tripRef?.routeId ?? null);
          const routeRef = routeId ? routeMap.get(routeId) : null;

          return [
            {
              vehicleId: v.vehicleId,
              tripId: v.tripId || null,
              routeId,
              routeShortName:
                firstNonEmpty(routeRef?.shortName, routeRef?.nullSafeShortName) || null,
              tripHeadsign: tripRef?.tripHeadsign ?? null,
              position: { lat: location.lat, lon: location.lon },
              lastUpdateTime: v.lastUpdateTime,
              phase: v.tripStatus?.phase ?? 'unknown',
              scheduleDeviation: v.tripStatus?.scheduleDeviation ?? null,
              orientation: v.tripStatus?.orientation ?? null,
              nextStop: v.tripStatus?.nextStop ?? null,
              predicted: v.tripStatus?.predicted ?? false,
            },
          ];
        });

        // Client-side route filter
        if (params.routeId) {
          vehicles = vehicles.filter((v) => v.routeId === params.routeId);
        }

        return { vehicles, limitExceeded: resp.data.limitExceeded ?? false };
      } catch (err) {
        classifyError(err, 'agency', params.agencyId, 'agency_not_found');
      }
    });
  }

  // ----- Schedules -----

  getScheduleForStop(
    params: { stopId: string; date?: string },
    ctx: Context,
  ): Promise<StopScheduleResult> {
    ctx.log.debug('getScheduleForStop', { stopId: params.stopId });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.scheduleForStop.retrieve(params.stopId, {
          ...(params.date && { date: params.date }),
        });
        if (!resp?.data)
          throw notFound(
            `stop "${params.stopId}" not found.`,
            notFoundData(params.stopId, 'stop_not_found'),
          );
        const refs = resp.data.references;
        const routeMap = new Map(refs.routes.map((r) => [r.id, r]));
        const entry = resp.data.entry;
        const stopRef = refs.stops.find((s) => s.id === params.stopId);

        const routes: StopScheduleRoute[] = entry.stopRouteSchedules.map((srs) => {
          const routeRef = routeMap.get(srs.routeId);
          return {
            routeId: srs.routeId,
            routeShortName: firstNonEmpty(
              routeRef?.shortName,
              routeRef?.nullSafeShortName,
              srs.routeId,
            ),
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
        classifyError(err, 'stop', params.stopId, 'stop_not_found');
      }
    });
  }

  getScheduleForRoute(
    params: { routeId: string; date?: string },
    ctx: Context,
  ): Promise<RouteScheduleResult> {
    ctx.log.debug('getScheduleForRoute', { routeId: params.routeId });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.scheduleForRoute.retrieve(params.routeId, {
          ...(params.date && { date: params.date }),
        });
        if (!resp?.data)
          throw notFound(
            `route "${params.routeId}" not found.`,
            notFoundData(params.routeId, 'route_not_found'),
          );
        const entry = resp.data.entry as typeof resp.data.entry & ScheduleRouteEntryExtension;
        const stopMap = new Map((entry.stops ?? []).map((s) => [s.id, s]));
        const groupings = entry.stopTripGroupings ?? [];

        /** Resolve raw stop times to the domain shape, naming stops from the entry's stop refs. */
        const toStops = (
          stopTimes: Array<{ stopId: string; arrivalTime: number; departureTime: number }>,
        ): RouteScheduleStopTime[] =>
          stopTimes.map((st) => ({
            stopId: st.stopId,
            stopName: stopMap.get(st.stopId)?.name ?? st.stopId,
            arrivalTime: st.arrivalTime,
            departureTime: st.departureTime,
          }));

        const entryTrips = entry.trips ?? [];
        let trips: RouteScheduleTrip[];
        if (entryTrips.length > 0) {
          // entry.trips carries per-trip metadata; the groupings carry each trip's stop times.
          const stopTimesByTrip = new Map<
            string,
            Array<{ stopId: string; arrivalTime: number; departureTime: number }>
          >();
          for (const grouping of groupings) {
            for (const twst of grouping.tripsWithStopTimes ?? []) {
              stopTimesByTrip.set(twst.tripId, twst.stopTimes);
            }
          }
          trips = entryTrips.map((t) => ({
            tripId: t.id,
            tripHeadsign: t.tripHeadsign ?? '',
            serviceId: t.serviceId,
            stops: toStops(stopTimesByTrip.get(t.id) ?? []),
          }));
        } else {
          // Puget Sound returns an empty entry.trips; the operating trips live in the groupings.
          // tripsWithStopTimes carries no per-trip headsign/serviceId — derive the headsign from
          // the grouping's direction headsign and the serviceId from the trip's own stop times.
          trips = groupings.flatMap((grouping) => {
            const tripHeadsign = grouping.tripHeadsigns?.[0] ?? '';
            return (grouping.tripsWithStopTimes ?? []).map((twst) => ({
              tripId: twst.tripId,
              tripHeadsign,
              serviceId: twst.stopTimes[0]?.serviceId ?? '',
              stops: toStops(twst.stopTimes),
            }));
          });
        }

        // Route short name is only carried on entry.trips; fall back to the route ID when empty.
        const routeShortName = firstNonEmpty(entryTrips[0]?.routeShortName, entry.routeId);

        return {
          routeId: entry.routeId,
          routeShortName,
          serviceDateMs: entry.scheduleDate,
          trips,
        };
      } catch (err) {
        classifyError(err, 'route', params.routeId, 'route_not_found');
      }
    });
  }

  // ----- Alerts (situations) -----

  getAlert(situationId: string, ctx: Context): Promise<SituationDetail> {
    ctx.log.debug('getAlert', { situationId });
    return this.paced(ctx, async () => {
      try {
        // The SDK has no dedicated situation endpoint — call the REST API directly.
        // client.get() is public on the base APIClient class (core.d.ts line 105).
        const resp = await this.client.get<unknown, { data: { entry: RawSituation } }>(
          `/api/where/situation/${situationId}.json`,
        );

        if (!resp?.data)
          throw notFound(
            `situation "${situationId}" not found.`,
            notFoundData(situationId, 'situation_not_found'),
          );
        const entry = resp.data.entry;
        if (!entry)
          throw notFound(
            `situation "${situationId}" not found.`,
            notFoundData(situationId, 'situation_not_found'),
          );

        return toSituationDetail(entry);
      } catch (err) {
        classifyError(err, 'situation', situationId, 'situation_not_found');
      }
    });
  }

  // ----- Block -----

  getBlock(blockId: string, ctx: Context): Promise<BlockResult> {
    ctx.log.debug('getBlock', { blockId });
    return this.paced(ctx, async () => {
      try {
        const resp = await this.client.block.retrieve(blockId);
        if (!resp?.data)
          throw notFound(`block "${blockId}" not found.`, notFoundData(blockId, 'block_not_found'));
        const entry = resp.data.entry;
        const configurations = entry?.configurations ?? [];
        // block endpoint returns an empty-ish entry (no configurations) when not found
        const config = configurations[0];
        if (!config) {
          throw notFound(`block "${blockId}" not found.`, notFoundData(blockId, 'block_not_found'));
        }

        return {
          blockId: entry.id,
          activeServiceIds: config.activeServiceIds,
          inactiveServiceIds: config.inactiveServiceIds ?? [],
          trips: config.trips.map((t) => ({
            tripId: t.tripId,
            distanceAlongBlock: t.distanceAlongBlock,
            accumulatedSlackTime: t.accumulatedSlackTime,
            blockStopTimes: t.blockStopTimes.map((bst) => ({
              arrivalTime: bst.stopTime.arrivalTime,
              departureTime: bst.stopTime.departureTime,
              stopId: bst.stopTime.stopId,
              ...(bst.stopTime.pickupType != null && { pickupType: bst.stopTime.pickupType }),
              ...(bst.stopTime.dropOffType != null && { dropOffType: bst.stopTime.dropOffType }),
            })),
          })),
        };
      } catch (err) {
        classifyError(err, 'block', blockId, 'block_not_found');
      }
    });
  }
}

// --- Init / accessor pattern ---

let _service: OneBusAwayService | undefined;

export function initOneBusAwayService(config: ServerConfig): void {
  _service = new OneBusAwayService(config);
}

/**
 * Releases the service's pacer and clears the singleton, so `createApp`'s
 * `teardown` leaves no dispatch timer or queued waiter behind and a later
 * `initOneBusAwayService` starts from a clean queue.
 */
export function disposeOneBusAwayService(): void {
  _service?.dispose();
  _service = undefined;
}

export function getOneBusAwayService(): OneBusAwayService {
  if (!_service) {
    throw new Error('OneBusAwayService not initialized — call initOneBusAwayService() in setup()');
  }
  return _service;
}
