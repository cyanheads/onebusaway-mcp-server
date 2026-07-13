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
