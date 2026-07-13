/**
 * @fileoverview Error-path tests for OneBusAwayService: null-`resp.data` guards
 * (#22), rate-limit retry classification (#16), and not-found recovery hints
 * (#17). Mocks the onebusaway-sdk client so the guards run against the SDK's real
 * null-resolve shape (a resolved `null`, not a thrown error) without hitting the
 * live API.
 * @module tests/services/onebusaway/onebusaway-service.test
 */

import { JsonRpcErrorCode, McpError } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConfig } from '@/config/server-config.js';

/**
 * Hoisted mock state shared with the `vi.mock('onebusaway-sdk')` factory: the
 * SDK error classes (so `instanceof` checks in the service resolve) and a mock
 * per SDK sub-client method the service reaches through `this.client.<x>.<fn>`.
 */
const h = vi.hoisted(() => {
  class NotFoundError extends Error {}
  class RateLimitError extends Error {}
  class APIConnectionError extends Error {}
  const methods = {
    agenciesWithCoverage: { list: vi.fn() },
    stopsForLocation: { list: vi.fn() },
    routesForLocation: { list: vi.fn() },
    routesForAgency: { list: vi.fn() },
    searchForStop: { list: vi.fn() },
    searchForRoute: { list: vi.fn() },
    stop: { retrieve: vi.fn() },
    route: { retrieve: vi.fn() },
    tripDetails: { retrieve: vi.fn() },
    vehiclesForAgency: { list: vi.fn() },
    arrivalAndDeparture: { list: vi.fn() },
    scheduleForStop: { retrieve: vi.fn() },
    scheduleForRoute: { retrieve: vi.fn() },
    block: { retrieve: vi.fn() },
    get: vi.fn(),
  };
  return { NotFoundError, RateLimitError, APIConnectionError, methods };
});

vi.mock('onebusaway-sdk', () => {
  class MockSDK {
    constructor(_config: unknown) {
      Object.assign(this, h.methods);
    }
    static NotFoundError = h.NotFoundError;
    static RateLimitError = h.RateLimitError;
    static APIConnectionError = h.APIConnectionError;
  }
  return { default: MockSDK };
});

import {
  getOneBusAwayService,
  initOneBusAwayService,
} from '@/services/onebusaway/onebusaway-service.js';

type ErrData = {
  reason?: string;
  id?: string;
  retryable?: boolean;
  recovery?: { hint?: string };
};

const mockConfig: ServerConfig = {
  apiKey: 'TEST',
  baseUrl: 'https://api.pugetsound.onebusaway.org',
};

let ctx: ReturnType<typeof createMockContext>;

beforeEach(() => {
  vi.clearAllMocks();
  initOneBusAwayService(mockConfig);
  ctx = createMockContext();
});

/** Resolves a service promise to the rejected McpError for assertion. */
async function caught(promise: Promise<unknown>): Promise<McpError> {
  return (await promise.catch((e) => e)) as McpError;
}

/** Shared assertions for a clean NotFound carrying a reason + discovery hint and no leaked JS path. */
function expectNotFoundWithHint(err: McpError, reason: string, id: string, hint: RegExp): void {
  expect(err).toBeInstanceOf(McpError);
  expect(err.code).toBe(JsonRpcErrorCode.NotFound);
  const data = err.data as ErrData;
  expect(data.reason).toBe(reason);
  expect(data.id).toBe(id);
  expect(data.recovery?.hint).toMatch(hint);
  expect(err.message).toContain(id);
  expect(err.message).not.toMatch(/is not an object|resp\.data/);
}

// ---- #22: ID-lookup methods, null resp.data → NotFound + reason + hint ----

describe('ID-lookup null resp.data → NotFound with reason + recovery hint (#22, #17)', () => {
  it('getScheduleForStop: SDK resolves null → stop_not_found (no leaked JS path)', async () => {
    h.methods.scheduleForStop.retrieve.mockResolvedValue(null);
    const err = await caught(
      getOneBusAwayService().getScheduleForStop({ stopId: '1_99999999' }, ctx),
    );
    expectNotFoundWithHint(err, 'stop_not_found', '1_99999999', /onebusaway_search_stops/);
  });

  it('getScheduleForStop: SDK resolves {data:null} → stop_not_found', async () => {
    h.methods.scheduleForStop.retrieve.mockResolvedValue({ data: null });
    const err = await caught(
      getOneBusAwayService().getScheduleForStop({ stopId: '1_99999999' }, ctx),
    );
    expectNotFoundWithHint(err, 'stop_not_found', '1_99999999', /onebusaway_search_stops/);
  });

  it('getArrivals: SDK resolves null → stop_not_found', async () => {
    h.methods.arrivalAndDeparture.list.mockResolvedValue(null);
    const err = await caught(getOneBusAwayService().getArrivals({ stopId: '1_99999999' }, ctx));
    expectNotFoundWithHint(err, 'stop_not_found', '1_99999999', /onebusaway_search_stops/);
  });

  it('getRoute: SDK resolves null → route_not_found', async () => {
    h.methods.route.retrieve.mockResolvedValue(null);
    const err = await caught(getOneBusAwayService().getRoute('1_bad', ctx));
    expectNotFoundWithHint(err, 'route_not_found', '1_bad', /onebusaway_search_routes/);
  });

  it('getTrip: SDK resolves null → trip_not_found', async () => {
    h.methods.tripDetails.retrieve.mockResolvedValue(null);
    const err = await caught(getOneBusAwayService().getTrip({ tripId: 'bad_trip' }, ctx));
    expectNotFoundWithHint(err, 'trip_not_found', 'bad_trip', /onebusaway_get_arrivals/);
  });

  it('getVehicles: SDK resolves null → agency_not_found', async () => {
    h.methods.vehiclesForAgency.list.mockResolvedValue(null);
    const err = await caught(getOneBusAwayService().getVehicles({ agencyId: '99' }, ctx));
    expectNotFoundWithHint(err, 'agency_not_found', '99', /onebusaway_list_agencies/);
  });

  it('getScheduleForRoute: SDK resolves null → route_not_found', async () => {
    h.methods.scheduleForRoute.retrieve.mockResolvedValue(null);
    const err = await caught(getOneBusAwayService().getScheduleForRoute({ routeId: '1_bad' }, ctx));
    expectNotFoundWithHint(err, 'route_not_found', '1_bad', /onebusaway_search_routes/);
  });

  it('getBlock: SDK resolves null → block_not_found', async () => {
    h.methods.block.retrieve.mockResolvedValue(null);
    const err = await caught(getOneBusAwayService().getBlock('bad_block', ctx));
    expectNotFoundWithHint(err, 'block_not_found', 'bad_block', /onebusaway_get_trip/);
  });

  it('getAlert: SDK resolves null → situation_not_found (no leaked JS path)', async () => {
    h.methods.get.mockResolvedValue(null);
    const err = await caught(getOneBusAwayService().getAlert('bad_situation', ctx));
    expectNotFoundWithHint(err, 'situation_not_found', 'bad_situation', /onebusaway_get_arrivals/);
  });
});

// ---- #22: coordinate / no-input methods → ServiceUnavailable, never NotFound ----

describe('coordinate/no-input null resp.data → ServiceUnavailable, never NotFound (#22)', () => {
  function expectServiceUnavailable(err: McpError): void {
    expect(err).toBeInstanceOf(McpError);
    expect(err.code).toBe(JsonRpcErrorCode.ServiceUnavailable);
    // No reason attached — a shared/no-input anomaly is never a NotFound.
    expect((err.data as ErrData | undefined)?.reason).toBeUndefined();
    expect(err.message).not.toMatch(/is not an object|resp\.data|not found/);
  }

  it('listAgencies: null-resolve → ServiceUnavailable', async () => {
    h.methods.agenciesWithCoverage.list.mockResolvedValue(null);
    expectServiceUnavailable(await caught(getOneBusAwayService().listAgencies(ctx)));
  });

  it('findStops: null-resolve → ServiceUnavailable', async () => {
    h.methods.stopsForLocation.list.mockResolvedValue(null);
    expectServiceUnavailable(
      await caught(getOneBusAwayService().findStops({ lat: 47.6, lon: -122.3 }, ctx)),
    );
  });

  it('findRoutes: null-resolve → ServiceUnavailable', async () => {
    h.methods.routesForLocation.list.mockResolvedValue(null);
    expectServiceUnavailable(
      await caught(getOneBusAwayService().findRoutes({ lat: 47.6, lon: -122.3 }, ctx)),
    );
  });
});

// ---- #16: rate-limit retry classification ----

describe('rate-limit classification (#16)', () => {
  it('RateLimitError → RateLimited, retryable:false, shared-budget wording (no "per IP")', async () => {
    h.methods.arrivalAndDeparture.list.mockRejectedValue(
      new h.RateLimitError('429 Too Many Requests'),
    );
    const err = await caught(getOneBusAwayService().getArrivals({ stopId: '1_75403' }, ctx));
    expect(err.code).toBe(JsonRpcErrorCode.RateLimited);
    const data = err.data as ErrData;
    expect(data.reason).toBe('rate_limited');
    expect(data.retryable).toBe(false);
    expect(err.message).toMatch(/shared|global/i);
    expect(err.message).not.toMatch(/per IP/i);
  });
});

// ---- #17: recovery hints attach on SDK-thrown NotFoundError (classifyError path) ----

describe('recovery hints on SDK-thrown NotFoundError via classifyError (#17)', () => {
  it('getRoute: SDK NotFoundError → route_not_found carries discovery hint', async () => {
    h.methods.route.retrieve.mockRejectedValue(new h.NotFoundError('404 Not Found'));
    const err = await caught(getOneBusAwayService().getRoute('1_10', ctx));
    expect(err.code).toBe(JsonRpcErrorCode.NotFound);
    const data = err.data as ErrData;
    expect(data.reason).toBe('route_not_found');
    expect(data.recovery?.hint).toMatch(/onebusaway_search_routes/);
  });

  it('getStop: SDK NotFoundError → stop_not_found carries the {agencyId}_{localId} hint', async () => {
    h.methods.stop.retrieve.mockRejectedValue(new h.NotFoundError('404 Not Found'));
    const err = await caught(getOneBusAwayService().getStop('1_bad', ctx));
    expect(err.code).toBe(JsonRpcErrorCode.NotFound);
    const data = err.data as ErrData;
    expect(data.reason).toBe('stop_not_found');
    expect(data.recovery?.hint).toMatch(/\{agencyId\}_\{localId\}/);
  });
});

// ---- #22 regression: guards must pass valid data through unchanged ----

describe('guards pass valid data through (#22 regression)', () => {
  it('getScheduleForStop: valid resp.data returns the normalized schedule', async () => {
    h.methods.scheduleForStop.retrieve.mockResolvedValue({
      data: {
        references: {
          routes: [{ id: '1_100', shortName: '44' }],
          stops: [{ id: '1_75403', name: 'University Way NE & NE 42nd St' }],
        },
        entry: {
          date: 1748000000000,
          stopRouteSchedules: [
            {
              routeId: '1_100',
              stopRouteDirectionSchedules: [
                {
                  tripHeadsign: 'Downtown Seattle',
                  scheduleStopTimes: [{ departureTime: 1748000100000, tripId: 'trip_abc' }],
                },
              ],
            },
          ],
        },
      },
    });
    const result = await getOneBusAwayService().getScheduleForStop({ stopId: '1_75403' }, ctx);
    expect(result.stopId).toBe('1_75403');
    expect(result.stopName).toBe('University Way NE & NE 42nd St');
    expect(result.routes[0]?.routeShortName).toBe('44');
    expect(result.routes[0]?.directions[0]?.departures[0]?.tripId).toBe('trip_abc');
  });
});

// ---- #15: getTrip surfaces blockId and resolves a non-empty routeShortName ----

describe('getTrip data mapping (#15)', () => {
  it('surfaces blockId and falls through an empty routeShortName to nullSafeShortName', async () => {
    h.methods.tripDetails.retrieve.mockResolvedValue({
      data: {
        references: {
          trips: [
            {
              id: '1_800571170',
              routeId: '1_100210',
              serviceId: 'wkdy',
              blockId: '1_block42',
              routeShortName: '', // empty upstream — must not win the fallback chain
              tripHeadsign: 'Northgate',
            },
          ],
          // shortName is empty; OBA carries the real label on nullSafeShortName
          routes: [
            { id: '1_100210', agencyId: '1', type: 3, shortName: '', nullSafeShortName: '36' },
          ],
          stops: [],
        },
        entry: {
          tripId: '1_800571170',
          status: { phase: 'in_progress', predicted: true },
        },
      },
    });
    const result = await getOneBusAwayService().getTrip({ tripId: '1_800571170' }, ctx);
    expect(result.blockId).toBe('1_block42');
    expect(result.routeShortName).toBe('36');
  });
});

// ---- #20: getScheduleForRoute derives trips from stopTripGroupings ----

describe('getScheduleForRoute data mapping (#20)', () => {
  const groupings = [
    {
      directionId: '0',
      stopIds: ['1_75403'],
      tripHeadsigns: ['Downtown Seattle'],
      tripIds: ['1_trip_a'],
      tripsWithStopTimes: [
        {
          tripId: '1_trip_a',
          stopTimes: [
            {
              stopId: '1_75403',
              arrivalTime: 3600,
              departureTime: 3660,
              serviceId: 'wkdy',
              arrivalEnabled: true,
              departureEnabled: true,
              tripId: '1_trip_a',
            },
          ],
        },
      ],
    },
  ];
  const stops = [{ id: '1_75403', name: 'University Way NE & NE 42nd St' }];

  it('derives trips from tripsWithStopTimes when entry.trips is empty', async () => {
    h.methods.scheduleForRoute.retrieve.mockResolvedValue({
      data: {
        entry: {
          routeId: '1_100259',
          scheduleDate: 1752384000000,
          serviceIds: ['wkdy'],
          stops,
          trips: [], // Puget Sound leaves this empty; the schedule lives in the groupings
          stopTripGroupings: groupings,
        },
      },
    });
    const result = await getOneBusAwayService().getScheduleForRoute(
      { routeId: '1_100259', date: '2026-07-13' },
      ctx,
    );
    expect(result.trips).toHaveLength(1);
    const trip = result.trips[0];
    expect(trip?.tripId).toBe('1_trip_a');
    expect(trip?.tripHeadsign).toBe('Downtown Seattle');
    expect(trip?.serviceId).toBe('wkdy');
    expect(trip?.stops[0]?.stopName).toBe('University Way NE & NE 42nd St');
    expect(trip?.stops[0]?.departureTime).toBe(3660);
  });

  it('uses entry.trips when present, joining stop times from the groupings', async () => {
    h.methods.scheduleForRoute.retrieve.mockResolvedValue({
      data: {
        entry: {
          routeId: '1_100259',
          scheduleDate: 1752384000000,
          serviceIds: ['wkdy'],
          stops,
          trips: [
            {
              id: '1_trip_a',
              routeId: '1_100259',
              serviceId: 'wkdy',
              routeShortName: '45',
              tripHeadsign: 'Downtown Seattle',
            },
          ],
          stopTripGroupings: groupings,
        },
      },
    });
    const result = await getOneBusAwayService().getScheduleForRoute({ routeId: '1_100259' }, ctx);
    expect(result.routeShortName).toBe('45');
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0]?.tripHeadsign).toBe('Downtown Seattle');
    expect(result.trips[0]?.serviceId).toBe('wkdy');
    expect(result.trips[0]?.stops[0]?.stopName).toBe('University Way NE & NE 42nd St');
    expect(result.trips[0]?.stops[0]?.departureTime).toBe(3660);
  });
});

// ---- #23: empty shortName falls through to nullSafeShortName at the remaining sites ----

describe('route short name resolution skips empty shortName (#23)', () => {
  it('normalizeRoute (getRoute): empty shortName falls through to nullSafeShortName', async () => {
    h.methods.route.retrieve.mockResolvedValue({
      data: {
        references: { agencies: [{ id: '1', name: 'Metro Transit' }] },
        // shortName is empty; OBA carries the real label on nullSafeShortName
        entry: { id: '1_100210', agencyId: '1', type: 3, shortName: '', nullSafeShortName: '36' },
      },
    });
    const result = await getOneBusAwayService().getRoute('1_100210', ctx);
    expect(result.shortName).toBe('36');
  });

  it('getArrivals: empty ad.routeShortName and route shortName fall through to nullSafeShortName', async () => {
    h.methods.arrivalAndDeparture.list.mockResolvedValue({
      currentTime: 1748000000000,
      data: {
        references: {
          routes: [{ id: '1_100210', shortName: '', nullSafeShortName: '36' }],
          stops: [{ id: '1_75403', name: 'University Way NE & NE 42nd St' }],
          situations: [],
        },
        entry: {
          arrivalsAndDepartures: [
            {
              routeId: '1_100210',
              routeShortName: '', // empty upstream — must not win the fallback chain
              tripHeadsign: 'Northgate',
              predicted: false,
              predictedArrivalTime: 0,
              scheduledArrivalTime: 1748000600000,
              numberOfStopsAway: 2,
              tripId: '1_trip_a',
              situationIds: [],
            },
          ],
        },
      },
    });
    const result = await getOneBusAwayService().getArrivals({ stopId: '1_75403' }, ctx);
    expect(result.arrivals[0]?.routeShortName).toBe('36');
  });

  it('getVehicles: empty route shortName falls through to nullSafeShortName', async () => {
    h.methods.vehiclesForAgency.list.mockResolvedValue({
      data: {
        limitExceeded: false,
        references: {
          trips: [{ id: '1_trip_a', routeId: '1_100210' }],
          routes: [{ id: '1_100210', shortName: '', nullSafeShortName: '36' }],
        },
        list: [
          {
            vehicleId: '1_v1',
            tripId: '1_trip_a',
            location: { lat: 47.6, lon: -122.3 },
            lastUpdateTime: 1748000000000,
            tripStatus: { phase: 'in_progress' },
          },
        ],
      },
    });
    const result = await getOneBusAwayService().getVehicles({ agencyId: '1' }, ctx);
    expect(result.vehicles[0]?.routeShortName).toBe('36');
  });

  it('getScheduleForStop: empty route shortName falls through to nullSafeShortName', async () => {
    h.methods.scheduleForStop.retrieve.mockResolvedValue({
      data: {
        references: {
          routes: [{ id: '1_100210', shortName: '', nullSafeShortName: '36' }],
          stops: [{ id: '1_75403', name: 'University Way NE & NE 42nd St' }],
        },
        entry: {
          date: 1748000000000,
          stopRouteSchedules: [
            {
              routeId: '1_100210',
              stopRouteDirectionSchedules: [
                {
                  tripHeadsign: 'Northgate',
                  scheduleStopTimes: [{ departureTime: 1748000600000, tripId: '1_trip_a' }],
                },
              ],
            },
          ],
        },
      },
    });
    const result = await getOneBusAwayService().getScheduleForStop({ stopId: '1_75403' }, ctx);
    expect(result.routes[0]?.routeShortName).toBe('36');
  });
});

// ---- #18: collection methods propagate the upstream limitExceeded flag ----

describe('limitExceeded propagation (#18)', () => {
  it('listAgencies surfaces limitExceeded from the SDK response', async () => {
    h.methods.agenciesWithCoverage.list.mockResolvedValue({
      data: { limitExceeded: true, list: [], references: { agencies: [] } },
    });
    const result = await getOneBusAwayService().listAgencies(ctx);
    expect(result.limitExceeded).toBe(true);
    expect(result.agencies).toEqual([]);
  });

  it('findRoutes surfaces limitExceeded from the SDK response', async () => {
    h.methods.routesForLocation.list.mockResolvedValue({
      data: { limitExceeded: true, list: [], references: { agencies: [] } },
    });
    const result = await getOneBusAwayService().findRoutes({ lat: 47.6, lon: -122.3 }, ctx);
    expect(result.limitExceeded).toBe(true);
    expect(result.routes).toEqual([]);
  });

  it('searchStops surfaces limitExceeded from the SDK response', async () => {
    h.methods.searchForStop.list.mockResolvedValue({
      data: { limitExceeded: true, list: [] },
    });
    const result = await getOneBusAwayService().searchStops({ query: 'x' }, ctx);
    expect(result.limitExceeded).toBe(true);
    expect(result.stops).toEqual([]);
  });

  it('searchRoutes surfaces limitExceeded from the SDK response', async () => {
    h.methods.searchForRoute.list.mockResolvedValue({
      data: { limitExceeded: true, list: [], references: { agencies: [] } },
    });
    const result = await getOneBusAwayService().searchRoutes({ query: 'x' }, ctx);
    expect(result.limitExceeded).toBe(true);
    expect(result.routes).toEqual([]);
  });

  it('listRoutesForAgency surfaces limitExceeded from the SDK response', async () => {
    h.methods.routesForAgency.list.mockResolvedValue({
      data: { limitExceeded: true, list: [], references: { agencies: [] } },
    });
    const result = await getOneBusAwayService().listRoutesForAgency('1', ctx);
    expect(result.limitExceeded).toBe(true);
    expect(result.routes).toEqual([]);
  });

  it('getVehicles surfaces limitExceeded from the SDK response', async () => {
    h.methods.vehiclesForAgency.list.mockResolvedValue({
      data: { limitExceeded: true, list: [], references: { trips: [], routes: [] } },
    });
    const result = await getOneBusAwayService().getVehicles({ agencyId: '1' }, ctx);
    expect(result.limitExceeded).toBe(true);
    expect(result.vehicles).toEqual([]);
  });

  it('searchStops returns limitExceeded=false on the 404 empty path', async () => {
    h.methods.searchForStop.list.mockRejectedValue(new h.NotFoundError('404 Not Found'));
    const result = await getOneBusAwayService().searchStops({ query: 'nope' }, ctx);
    expect(result.limitExceeded).toBe(false);
    expect(result.stops).toEqual([]);
  });

  it('searchRoutes returns limitExceeded=false on the 404 empty path', async () => {
    h.methods.searchForRoute.list.mockRejectedValue(new h.NotFoundError('404 Not Found'));
    const result = await getOneBusAwayService().searchRoutes({ query: 'nope' }, ctx);
    expect(result.limitExceeded).toBe(false);
    expect(result.routes).toEqual([]);
  });
});
