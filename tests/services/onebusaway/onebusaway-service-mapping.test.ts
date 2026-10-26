/**
 * @fileoverview Response mapping for every OneBusAwayService method, on a populated
 *   upstream payload and on a sparse one that omits every optional field. Sparse
 *   cases assert the documented fallback value (`''`, `null`, `[]`, `'UNKNOWN'`,
 *   `false`, the ID standing in for a missing name) so a wrong fallback fails, not
 *   just an unexecuted line. Also covers `classifyError`'s reason-less not-found and
 *   non-Error arms. Only the onebusaway-sdk client is mocked, and every SDK call
 *   rejects unless a test supplies a response, so nothing reaches the network.
 * @module tests/services/onebusaway/onebusaway-service-mapping.test
 */

import { JsonRpcErrorCode, McpError } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAlert } from '@/mcp-server/tools/definitions/get-alert.tool.js';
import { getArrivals } from '@/mcp-server/tools/definitions/get-arrivals.tool.js';
import { getBlock } from '@/mcp-server/tools/definitions/get-block.tool.js';
import { getScheduleForRoute } from '@/mcp-server/tools/definitions/get-schedule-for-route.tool.js';
import { getScheduleForStop } from '@/mcp-server/tools/definitions/get-schedule-for-stop.tool.js';
import { getStopContext } from '@/mcp-server/tools/definitions/get-stop-context.tool.js';
import { getTrip } from '@/mcp-server/tools/definitions/get-trip.tool.js';
import { getVehicles } from '@/mcp-server/tools/definitions/get-vehicles.tool.js';

const h = vi.hoisted(() => {
  class NotFoundError extends Error {}
  class RateLimitError extends Error {}
  class APIConnectionError extends Error {}
  class BadRequestError extends Error {}
  type SdkCall = (...args: unknown[]) => Promise<unknown>;
  const unmocked: SdkCall = () => Promise.reject(new Error('Unmocked OneBusAway SDK call'));
  const fn = () => vi.fn<SdkCall>(unmocked);
  const methods = {
    agenciesWithCoverage: { list: fn() },
    stopsForLocation: { list: fn() },
    routesForLocation: { list: fn() },
    routesForAgency: { list: fn() },
    searchForStop: { list: fn() },
    searchForRoute: { list: fn() },
    stop: { retrieve: fn() },
    route: { retrieve: fn() },
    tripDetails: { retrieve: fn() },
    vehiclesForAgency: { list: fn() },
    arrivalAndDeparture: { list: fn() },
    scheduleForStop: { retrieve: fn() },
    scheduleForRoute: { retrieve: fn() },
    block: { retrieve: fn() },
    get: fn(),
  };
  const all = [
    ...Object.values(methods).flatMap((m) => (typeof m === 'function' ? [m] : Object.values(m))),
  ];
  return { NotFoundError, RateLimitError, APIConnectionError, BadRequestError, methods, all };
});

vi.mock('onebusaway-sdk', () => {
  class MockSDK {
    constructor(_config: unknown) {
      Object.assign(this, h.methods);
    }
    static NotFoundError = h.NotFoundError;
    static RateLimitError = h.RateLimitError;
    static APIConnectionError = h.APIConnectionError;
    static BadRequestError = h.BadRequestError;
  }
  return { default: MockSDK };
});

import {
  disposeOneBusAwayService,
  getOneBusAwayService,
  initOneBusAwayService,
} from '@/services/onebusaway/onebusaway-service.js';

let ctx: ReturnType<typeof createMockContext>;

beforeEach(() => {
  for (const m of h.all) m.mockReset().mockRejectedValue(new Error('Unmocked OneBusAway SDK call'));
  initOneBusAwayService({
    apiKey: 'TEST',
    baseUrl: 'https://api.pugetsound.onebusaway.org',
    rateLimitRequests: 1_000,
    rateLimitWindowMs: 60_000,
    rateLimitMaxWaitMs: 1_000,
  });
  ctx = createMockContext();
});

afterEach(() => {
  disposeOneBusAwayService();
});

const svc = () => getOneBusAwayService();

describe('scoped timezone mapping', () => {
  const agencies = [
    { id: '2', timezone: 'Asia/Tokyo' },
    { id: '1', timezone: 'America/Los_Angeles' },
  ];
  const refs = {
    agencies,
    routes: [{ id: 'route', agencyId: '1', shortName: '44' }],
    trips: [{ id: 'trip', routeId: 'route' }],
    stops: [],
  };
  const epoch = 1792988700000;
  it.each([
    { affects: [{ agencyId: '1' }], zone: 'America/Los_Angeles' },
    { affects: [{ routeId: 'route' }], zone: 'America/Los_Angeles' },
    { affects: [{ tripId: 'trip' }], zone: 'America/Los_Angeles' },
    { affects: [{ stopId: '1_stop' }], zone: 'America/Los_Angeles' },
    {
      affects: [{ agencyId: '1', routeId: 'route', tripId: 'trip', stopId: '1_stop' }],
      zone: 'America/Los_Angeles',
    },
    { affects: [{ agencyId: '1' }, { agencyId: '2' }], zone: 'UTC' },
    { affects: [{ agencyId: '1', routeId: 'missing' }], zone: 'UTC' },
    { affects: [{ tripId: 'missing' }], zone: 'UTC' },
    { affects: [{ stopId: 'missing' }], zone: 'UTC' },
    { affects: [{ stopId: '3_missing' }], zone: 'UTC' },
    { affects: [{ agencyId: '3' }], zone: 'UTC' },
    { affects: [{}], zone: 'UTC' },
    { affects: [], zone: 'UTC' },
  ])(
    'resolves standalone, nested and lightweight alert scopes $affects to $zone',
    async ({ affects, zone }) => {
      const situation = {
        id: 'alert',
        allAffects: affects,
        activeWindows: [{ from: epoch, to: epoch + 60000 }],
      };
      h.methods.get.mockResolvedValue({ data: { entry: situation, references: refs } });
      const standalone = await runToolContract(getAlert, { situationId: 'alert' });
      expect(standalone.isError).toBeFalsy();
      expect(standalone.structuredContent).toMatchObject({
        timezone: zone,
        activeWindows: [{ from: epoch, to: epoch + 60000 }],
      });
      expect(JSON.stringify(standalone.content)).toContain(zone);
      expect(JSON.stringify(standalone.content)).toContain(String(epoch));
      h.methods.arrivalAndDeparture.list.mockResolvedValue({
        currentTime: epoch,
        data: {
          references: { ...refs, situations: [situation] },
          entry: { situationIds: ['alert'], arrivalsAndDepartures: [] },
        },
      });
      const nested = await runToolContract(getStopContext, { stopId: '1_stop', minutesAfter: 240 });
      expect(nested.isError).toBeFalsy();
      expect(nested.structuredContent).toMatchObject({
        timezone: 'America/Los_Angeles',
        alerts: [{ timezone: zone }],
      });
      expect(JSON.stringify(nested.content)).toContain(zone);
      expect(JSON.stringify(nested.content)).toContain('21:25 America/Los_Angeles');
      const lightweight = await runToolContract(getArrivals, { stopId: '1_stop' });
      expect(lightweight.isError).toBeFalsy();
      expect(lightweight.structuredContent).toMatchObject({
        timezone: 'America/Los_Angeles',
        situations: [{ timezone: zone }],
      });
      expect(JSON.stringify(lightweight.content)).toContain(zone);
    },
  );

  it.each(['', 'Not/A_Zone', '+01:00'])(
    'uses UTC for invalid agency timezone %s on both surfaces',
    async (timezone) => {
      h.methods.get.mockResolvedValue({
        data: {
          entry: { id: 'alert', allAffects: [{ agencyId: '1' }] },
          references: { agencies: [{ id: '1', timezone }] },
        },
      });
      const result = await runToolContract(getAlert, { situationId: 'alert' });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ timezone: 'UTC' });
      expect(JSON.stringify(result.content)).toContain('UTC');
    },
  );

  it.each([false, true])(
    'resolves trip, route and requested vehicle agency independently of reference order (%s)',
    async (reverse) => {
      const references = { ...refs, agencies: reverse ? [...agencies].reverse() : agencies };
      h.methods.tripDetails.retrieve.mockResolvedValue({ data: { references, entry: {} } });
      const trip = await runToolContract(getTrip, { tripId: 'trip' });
      expect(trip.isError).toBeFalsy();
      expect(trip.structuredContent).toMatchObject({ timezone: 'America/Los_Angeles' });
      expect(JSON.stringify(trip.content)).toContain('America/Los_Angeles');
      h.methods.scheduleForRoute.retrieve.mockResolvedValue({
        data: { references, entry: { routeId: 'route', scheduleDate: epoch } },
      });
      const route = await runToolContract(getScheduleForRoute, { routeId: 'route' });
      expect(route.isError).toBeFalsy();
      expect(route.structuredContent).toMatchObject({
        timezone: 'America/Los_Angeles',
        serviceDateMs: epoch,
      });
      expect(JSON.stringify(route.content)).toContain('Oct 25, 2026 America/Los_Angeles');
      h.methods.vehiclesForAgency.list.mockResolvedValue({
        data: { references, list: [], limitExceeded: true },
      });
      const vehicles = await runToolContract(getVehicles, { agencyId: '2' });
      expect(vehicles.isError).toBeFalsy();
      expect(vehicles.structuredContent).toMatchObject({
        timezone: 'Asia/Tokyo',
        vehicles: [],
        limitExceeded: true,
      });
      expect(JSON.stringify(vehicles.content)).toContain('Asia/Tokyo');
    },
  );

  it.each([undefined, '', '2026-10-25'])(
    'forwards date %s and preserves the exact marker on both surfaces',
    async (date) => {
      const marker = date ? 1792911600000 : epoch + 123;
      h.methods.scheduleForStop.retrieve.mockResolvedValue({
        data: { references: refs, entry: { date: marker, stopRouteSchedules: [] } },
      });
      const stop = await runToolContract(getScheduleForStop, {
        stopId: '1_stop',
        ...(date !== undefined && { date }),
      });
      expect(stop.isError).toBeFalsy();
      expect(stop.structuredContent).toMatchObject({
        timezone: 'America/Los_Angeles',
        serviceDateMs: marker,
      });
      expect(JSON.stringify(stop.content)).toContain(String(marker));
      expect(h.methods.scheduleForStop.retrieve).toHaveBeenCalledWith(
        '1_stop',
        date ? { date } : {},
      );
      h.methods.scheduleForRoute.retrieve.mockResolvedValue({
        data: { references: refs, entry: { routeId: 'route', scheduleDate: marker } },
      });
      const route = await runToolContract(getScheduleForRoute, {
        routeId: 'route',
        ...(date !== undefined && { date }),
      });
      expect(route.isError).toBeFalsy();
      expect(route.structuredContent).toMatchObject({ serviceDateMs: marker });
      expect(JSON.stringify(route.content)).toContain(String(marker));
      expect(h.methods.scheduleForRoute.retrieve).toHaveBeenCalledWith(
        'route',
        date ? { date } : {},
      );
    },
  );
  it('uses the queried stop agency rather than reference order', async () => {
    h.methods.scheduleForStop.retrieve.mockResolvedValue({
      data: {
        references: {
          stops: [],
          routes: [],
          agencies: [
            { id: '2', timezone: 'Asia/Tokyo' },
            { id: '1', timezone: 'America/Los_Angeles' },
          ],
        },
        entry: { date: 1792988700123, stopRouteSchedules: [] },
      },
    });
    expect(await svc().getScheduleForStop({ stopId: '1_570' }, ctx)).toMatchObject({
      timezone: 'America/Los_Angeles',
      serviceDateMs: 1792988700123,
    });
  });
});

/** Resolves a service promise to its rejection. */
async function caught(promise: Promise<unknown>): Promise<McpError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(McpError);
  return err as McpError;
}

// ---- Stops: normalizeStop / normalizeWheelchair ----

const RAW_STOP = {
  id: '1_75403',
  code: '75403',
  name: 'University Way NE & NE 42nd St',
  lat: 47.6586,
  lon: -122.3134,
  direction: 'S',
  routeIds: ['1_100259'],
  wheelchairBoarding: 'ACCESSIBLE',
};

/** A stop carrying only the fields OneBusAway always sends. */
const SPARSE_STOP = { id: '1_1', name: 'Unnamed Stop', lat: 47.6, lon: -122.3, routeIds: [] };

describe('stop mapping (getStop, findStops, searchStops)', () => {
  it('getStop: populated stop maps every field', async () => {
    h.methods.stop.retrieve.mockResolvedValueOnce({ data: { entry: RAW_STOP } });
    expect(await svc().getStop('1_75403', ctx)).toEqual({
      id: '1_75403',
      code: '75403',
      name: 'University Way NE & NE 42nd St',
      lat: 47.6586,
      lon: -122.3134,
      direction: 'S',
      routeIds: ['1_100259'],
      wheelchairBoarding: 'ACCESSIBLE',
    });
  });

  it('getStop: sparse stop falls back to empty code/direction and UNKNOWN accessibility', async () => {
    h.methods.stop.retrieve.mockResolvedValueOnce({ data: { entry: SPARSE_STOP } });
    expect(await svc().getStop('1_1', ctx)).toEqual({
      id: '1_1',
      code: '',
      name: 'Unnamed Stop',
      lat: 47.6,
      lon: -122.3,
      direction: '',
      routeIds: [],
      wheelchairBoarding: 'UNKNOWN',
    });
  });

  it('getStop: a response without an entry is stop_not_found', async () => {
    h.methods.stop.retrieve.mockResolvedValueOnce({ data: {} });
    const err = await caught(svc().getStop('1_gone', ctx));
    expect(err.code).toBe(JsonRpcErrorCode.NotFound);
    expect(err.data).toMatchObject({ reason: 'stop_not_found', id: '1_gone' });
  });

  it.each([
    ['1', 'ACCESSIBLE'],
    ['ACCESSIBLE', 'ACCESSIBLE'],
    ['2', 'NOT_ACCESSIBLE'],
    ['NOT_ACCESSIBLE', 'NOT_ACCESSIBLE'],
    ['0', 'UNKNOWN'],
    ['UNKNOWN', 'UNKNOWN'],
  ])('findStops: wheelchairBoarding %j → %s', async (raw, expected) => {
    h.methods.stopsForLocation.list.mockResolvedValueOnce({
      data: { list: [{ ...RAW_STOP, wheelchairBoarding: raw }], limitExceeded: false },
    });
    const { stops } = await svc().findStops({ lat: 47.6, lon: -122.3 }, ctx);
    expect(stops[0]?.wheelchairBoarding).toBe(expected);
  });

  it('findStops: forwards radius and query; limitExceeded omitted → false', async () => {
    h.methods.stopsForLocation.list.mockResolvedValueOnce({ data: { list: [SPARSE_STOP] } });
    const result = await svc().findStops(
      { lat: 47.6, lon: -122.3, radius: 250, query: '75403' },
      ctx,
    );
    expect(h.methods.stopsForLocation.list).toHaveBeenCalledWith({
      lat: 47.6,
      lon: -122.3,
      radius: 250,
      query: '75403',
    });
    expect(result).toEqual({
      stops: [expect.objectContaining({ id: '1_1', code: '', wheelchairBoarding: 'UNKNOWN' })],
      limitExceeded: false,
    });
  });

  it('findStops: an omitted radius and blank query are not forwarded', async () => {
    h.methods.stopsForLocation.list.mockResolvedValueOnce({ data: { list: [] } });
    await svc().findStops({ lat: 47.6, lon: -122.3, query: '' }, ctx);
    expect(h.methods.stopsForLocation.list).toHaveBeenCalledWith({ lat: 47.6, lon: -122.3 });
  });

  it('searchStops: populated and sparse stops both map; maxCount forwarded; limitExceeded omitted → false', async () => {
    h.methods.searchForStop.list.mockResolvedValueOnce({ data: { list: [RAW_STOP, SPARSE_STOP] } });
    const result = await svc().searchStops({ query: 'University', maxCount: 5 }, ctx);
    expect(h.methods.searchForStop.list).toHaveBeenCalledWith({ input: 'University', maxCount: 5 });
    expect(result.limitExceeded).toBe(false);
    expect(result.stops.map((s) => [s.code, s.direction, s.wheelchairBoarding])).toEqual([
      ['75403', 'S', 'ACCESSIBLE'],
      ['', '', 'UNKNOWN'],
    ]);
  });
});

// ---- Agencies ----

describe('listAgencies mapping', () => {
  it('populated: joins each coverage row to its agency reference', async () => {
    h.methods.agenciesWithCoverage.list.mockResolvedValueOnce({
      data: {
        limitExceeded: false,
        list: [{ agencyId: '1', lat: 47.53, lon: -122.3, latSpan: 0.7, lonSpan: 0.9 }],
        references: {
          agencies: [
            {
              id: '1',
              name: 'Metro Transit',
              url: 'https://kingcounty.gov/metro',
              phone: '206-553-3000',
              timezone: 'America/Los_Angeles',
            },
          ],
        },
      },
    });
    expect((await svc().listAgencies(ctx)).agencies).toEqual([
      {
        id: '1',
        name: 'Metro Transit',
        url: 'https://kingcounty.gov/metro',
        phone: '206-553-3000',
        timezone: 'America/Los_Angeles',
        coverageCenter: { lat: 47.53, lon: -122.3 },
        coverageSpan: { latSpan: 0.7, lonSpan: 0.9 },
      },
    ]);
  });

  it('sparse: a row with no agency reference falls back to the ID, empty url/timezone, null phone', async () => {
    h.methods.agenciesWithCoverage.list.mockResolvedValueOnce({
      data: {
        list: [{ agencyId: '97', lat: 47.9, lon: -122.2, latSpan: 0.1, lonSpan: 0.1 }],
        references: { agencies: [] },
      },
    });
    const result = await svc().listAgencies(ctx);
    expect(result.limitExceeded).toBe(false);
    expect(result.agencies[0]).toEqual({
      id: '97',
      name: '97',
      url: '',
      phone: null,
      timezone: '',
      coverageCenter: { lat: 47.9, lon: -122.2 },
      coverageSpan: { latSpan: 0.1, lonSpan: 0.1 },
    });
  });
});

// ---- Routes: normalizeRoute ----

const RAW_ROUTE = {
  id: '1_100259',
  agencyId: '1',
  type: 3,
  shortName: '44',
  nullSafeShortName: '44',
  longName: 'Ballard - Montlake',
  description: 'Ballard to UW via Wallingford',
  color: 'FDB71A',
  url: 'https://kingcounty.gov/44',
};

/** A route carrying only id, agencyId, and type. */
const SPARSE_ROUTE = { id: '40_100479', agencyId: '40', type: 0 };

const POPULATED_ROUTE = {
  id: '1_100259',
  shortName: '44',
  longName: 'Ballard - Montlake',
  description: 'Ballard to UW via Wallingford',
  agencyId: '1',
  agencyName: 'Metro Transit',
  type: 3,
  color: 'FDB71A',
  url: 'https://kingcounty.gov/44',
};

const SPARSE_ROUTE_MAPPED = {
  id: '40_100479',
  shortName: '',
  longName: '',
  description: '',
  agencyId: '40',
  agencyName: '40',
  type: 0,
  color: null,
  url: null,
};

describe('route mapping (findRoutes, searchRoutes, listRoutesForAgency, getRoute)', () => {
  const refs = { agencies: [{ id: '1', name: 'Metro Transit' }] };

  it('findRoutes: populated and sparse routes; filters forwarded; limitExceeded omitted → false', async () => {
    h.methods.routesForLocation.list.mockResolvedValueOnce({
      data: { list: [RAW_ROUTE, SPARSE_ROUTE], references: refs },
    });
    const result = await svc().findRoutes(
      { lat: 47.6, lon: -122.3, radius: 400, latSpan: 0.01, lonSpan: 0.02, query: '44' },
      ctx,
    );
    expect(h.methods.routesForLocation.list).toHaveBeenCalledWith({
      lat: 47.6,
      lon: -122.3,
      radius: 400,
      latSpan: 0.01,
      lonSpan: 0.02,
      query: '44',
    });
    expect(result).toEqual({
      routes: [POPULATED_ROUTE, SPARSE_ROUTE_MAPPED],
      limitExceeded: false,
    });
  });

  it('searchRoutes: populated and sparse routes; maxCount forwarded', async () => {
    h.methods.searchForRoute.list.mockResolvedValueOnce({
      data: { list: [RAW_ROUTE, SPARSE_ROUTE], references: refs },
    });
    const result = await svc().searchRoutes({ query: '44', maxCount: 3 }, ctx);
    expect(h.methods.searchForRoute.list).toHaveBeenCalledWith({ input: '44', maxCount: 3 });
    expect(result).toEqual({
      routes: [POPULATED_ROUTE, SPARSE_ROUTE_MAPPED],
      limitExceeded: false,
    });
  });

  it('searchRoutes: a response without data is an empty result', async () => {
    h.methods.searchForRoute.list.mockResolvedValueOnce(null);
    expect(await svc().searchRoutes({ query: 'x' }, ctx)).toEqual({
      routes: [],
      limitExceeded: false,
    });
  });

  it('listRoutesForAgency: names every route with the queried agency, or its ID when unreferenced', async () => {
    h.methods.routesForAgency.list.mockResolvedValueOnce({
      data: { list: [RAW_ROUTE], references: refs },
    });
    const named = await svc().listRoutesForAgency('1', ctx);
    expect(named).toEqual({ routes: [POPULATED_ROUTE], limitExceeded: false });

    h.methods.routesForAgency.list.mockResolvedValueOnce({
      data: { list: [SPARSE_ROUTE], references: { agencies: [] } },
    });
    const unnamed = await svc().listRoutesForAgency('40', ctx);
    expect(unnamed.routes).toEqual([SPARSE_ROUTE_MAPPED]);
  });

  it('listRoutesForAgency: a response without data is agency_not_found', async () => {
    h.methods.routesForAgency.list.mockResolvedValueOnce(null);
    const err = await caught(svc().listRoutesForAgency('999', ctx));
    expect(err.data).toMatchObject({ reason: 'agency_not_found', id: '999' });
  });

  it('getRoute: sparse route with no agency reference', async () => {
    h.methods.route.retrieve.mockResolvedValueOnce({
      data: { entry: SPARSE_ROUTE, references: { agencies: [] } },
    });
    expect(await svc().getRoute('40_100479', ctx)).toEqual(SPARSE_ROUTE_MAPPED);
  });
});

// ---- Arrivals ----

describe('getArrivals mapping, sparse payload', () => {
  it('fills every fallback when upstream omits optional arrival, stop, and situation fields', async () => {
    h.methods.arrivalAndDeparture.list.mockResolvedValueOnce({
      currentTime: 1790307153437,
      data: {
        references: {
          routes: [],
          stops: [],
          situations: [{ id: '1_sit' }],
        },
        entry: {
          situationIds: ['1_sit'],
          arrivalsAndDepartures: [
            {
              routeId: '1_100229',
              routeShortName: '',
              tripHeadsign: 'Shoreline',
              predictedArrivalTime: 1790307300000,
              scheduledArrivalTime: 1790307200000,
              numberOfStopsAway: 3,
              tripId: '1_trip',
            },
          ],
        },
      },
    });
    const result = await svc().getArrivals({ stopId: '1_570' }, ctx);
    expect(h.methods.arrivalAndDeparture.list).toHaveBeenCalledWith('1_570', {});
    // The queried ID stands in for a stop missing from references.
    expect(result.stopName).toBe('1_570');
    expect(result.arrivals).toEqual([
      {
        // No short name anywhere → the route ID.
        routeShortName: '1_100229',
        tripHeadsign: 'Shoreline',
        // predicted omitted → false, so the predicted time is dropped.
        predicted: false,
        predictedArrivalTime: null,
        scheduledArrivalTime: 1790307200000,
        scheduleDeviation: 0,
        vehicleId: null,
        vehiclePosition: null,
        stopsAway: 3,
        tripId: '1_trip',
        routeId: '1_100229',
        situationIds: [],
      },
    ]);
    expect(result.situations).toEqual([
      { timezone: 'UTC', id: '1_sit', summary: '', description: null },
    ]);
  });

  it('keeps a predicted time only when predicted and positive', async () => {
    const arrival = (over: Record<string, unknown>) => ({
      routeId: '1_100229',
      routeShortName: '5',
      tripHeadsign: 'Shoreline',
      predictedArrivalTime: 0,
      scheduledArrivalTime: 1790307200000,
      numberOfStopsAway: 1,
      tripId: '1_trip',
      situationIds: [],
      tripStatus: { scheduleDeviation: 120, vehicleId: '1_8217', position: { lat: 47.61 } },
      ...over,
    });
    h.methods.arrivalAndDeparture.list.mockResolvedValueOnce({
      currentTime: 1,
      data: {
        references: { routes: [], stops: [], situations: [] },
        entry: {
          arrivalsAndDepartures: [
            arrival({ predicted: true, predictedArrivalTime: 0 }),
            arrival({ predicted: true, predictedArrivalTime: 1790307260000 }),
          ],
        },
      },
    });
    const { arrivals } = await svc().getArrivals({ stopId: '1_570' }, ctx);
    expect(arrivals.map((a) => a.predictedArrivalTime)).toEqual([null, 1790307260000]);
    // A position missing lon is no position at all.
    expect(arrivals[0]?.vehiclePosition).toBeNull();
    expect(arrivals[0]?.scheduleDeviation).toBe(120);
    expect(arrivals[0]?.vehicleId).toBe('1_8217');
  });
});

// ---- Trip ----

describe('getTrip mapping', () => {
  it('populated: maps status and names each scheduled stop from references', async () => {
    h.methods.tripDetails.retrieve.mockResolvedValueOnce({
      data: {
        references: {
          trips: [
            {
              id: '1_trip',
              routeId: '1_100229',
              routeShortName: '5',
              tripHeadsign: 'Shoreline',
              blockId: '1_block',
            },
          ],
          routes: [{ id: '1_100229', shortName: '5' }],
          stops: [{ id: '1_570', name: '3rd Ave & Union St' }],
        },
        entry: {
          situationIds: ['1_sit'],
          status: {
            phase: 'in_progress',
            predicted: true,
            position: { lat: 47.61, lon: -122.34 },
            scheduleDeviation: 44,
            nextStop: '1_575',
            closestStop: '1_570',
            vehicleId: '1_8217',
            lastUpdateTime: 1790307100000,
          },
          schedule: {
            stopTimes: [
              {
                stopId: '1_570',
                arrivalTime: 36000,
                departureTime: 36060,
                distanceAlongTrip: 1200.5,
              },
              {
                stopId: '1_unknown',
                arrivalTime: 36300,
                departureTime: 36300,
                distanceAlongTrip: 2000,
              },
            ],
          },
        },
      },
    });
    const result = await svc().getTrip(
      { tripId: '1_trip', serviceDate: 1790233200000, includeSchedule: true },
      ctx,
    );
    expect(h.methods.tripDetails.retrieve).toHaveBeenCalledWith('1_trip', {
      serviceDate: 1790233200000,
      includeSchedule: true,
    });
    expect(result).toEqual({
      tripId: '1_trip',
      timezone: 'UTC',
      routeShortName: '5',
      tripHeadsign: 'Shoreline',
      blockId: '1_block',
      status: {
        phase: 'in_progress',
        predicted: true,
        position: { lat: 47.61, lon: -122.34 },
        scheduleDeviation: 44,
        nextStop: '1_575',
        closestStop: '1_570',
        vehicleId: '1_8217',
        lastUpdateTime: 1790307100000,
      },
      schedule: [
        {
          stopId: '1_570',
          stopName: '3rd Ave & Union St',
          arrivalTime: 36000,
          departureTime: 36060,
          distanceAlongTripMeters: 1200.5,
        },
        // A stop missing from references is named by its ID.
        {
          stopId: '1_unknown',
          stopName: '1_unknown',
          arrivalTime: 36300,
          departureTime: 36300,
          distanceAlongTripMeters: 2000,
        },
      ],
      situations: ['1_sit'],
    });
  });

  it('sparse: no trip reference, status, or situations; stop times missing every field', async () => {
    h.methods.tripDetails.retrieve.mockResolvedValueOnce({
      data: {
        references: { trips: [], routes: [], stops: [] },
        entry: { tripId: '1_trip', schedule: { stopTimes: [{}] } },
      },
    });
    const result = await svc().getTrip({ tripId: '1_trip' }, ctx);
    // includeSchedule defaults to true; no serviceDate is forwarded.
    expect(h.methods.tripDetails.retrieve).toHaveBeenCalledWith('1_trip', {
      includeSchedule: true,
    });
    expect(result).toEqual({
      tripId: '1_trip',
      timezone: 'UTC',
      routeShortName: '',
      tripHeadsign: '',
      blockId: null,
      status: {
        phase: 'unknown',
        predicted: false,
        position: null,
        scheduleDeviation: 0,
        nextStop: null,
        closestStop: null,
        vehicleId: null,
        lastUpdateTime: 0,
      },
      schedule: [
        { stopId: '', stopName: '', arrivalTime: 0, departureTime: 0, distanceAlongTripMeters: 0 },
      ],
      situations: [],
    });
  });

  it('sparse: no schedule block → schedule null; an empty blockId → null', async () => {
    h.methods.tripDetails.retrieve.mockResolvedValueOnce({
      data: {
        references: {
          trips: [{ id: '1_trip', routeId: '1_r', blockId: '' }],
          routes: [],
          stops: [],
        },
        entry: { tripId: '1_trip' },
      },
    });
    const result = await svc().getTrip({ tripId: '1_trip', includeSchedule: false }, ctx);
    expect(h.methods.tripDetails.retrieve).toHaveBeenCalledWith('1_trip', {
      includeSchedule: false,
    });
    expect(result.schedule).toBeNull();
    expect(result.blockId).toBeNull();
  });
});

// ---- Vehicles ----

describe('getVehicles mapping', () => {
  it('retains zero coordinates and skips absent coordinates without using status position', async () => {
    h.methods.vehiclesForAgency.list.mockResolvedValueOnce({
      data: {
        references: { trips: [], routes: [] },
        list: [
          { vehicleId: 'zero', location: { lat: 0, lon: 0 }, lastUpdateTime: 1 },
          { vehicleId: 'absent', tripStatus: { position: { lat: 1, lon: 2 } } },
          { vehicleId: 'partial', location: { lat: 1 } },
        ],
      },
    });
    const result = await svc().getVehicles({ agencyId: '1' }, ctx);
    expect(result.vehicles.map((v) => [v.vehicleId, v.position])).toEqual([
      ['zero', { lat: 0, lon: 0 }],
    ]);
  });
  const data = {
    limitExceeded: false,
    references: {
      trips: [
        { id: '1_trip_a', routeId: '1_100229', tripHeadsign: 'Shoreline' },
        { id: '1_trip_b', routeId: '1_100259', tripHeadsign: 'Ballard' },
      ],
      routes: [
        { id: '1_100229', shortName: '5' },
        { id: '1_100259', shortName: '44' },
      ],
    },
    list: [
      {
        vehicleId: '1_v1',
        tripId: '1_trip_a',
        location: { lat: 47.61, lon: -122.34 },
        lastUpdateTime: 1790307100000,
        tripStatus: {
          phase: 'in_progress',
          scheduleDeviation: 60,
          orientation: 270,
          nextStop: '1_575',
          predicted: true,
        },
      },
      {
        // The active trip decides the route, not the vehicle's own tripId.
        vehicleId: '1_v2',
        tripId: '1_trip_a',
        location: { lat: 47.66, lon: -122.31 },
        lastUpdateTime: 1790307000000,
        tripStatus: { activeTripId: '1_trip_b', phase: 'layover_before' },
      },
      {
        // No trip at all.
        vehicleId: '1_v3',
        tripId: '',
        location: { lat: 47.5, lon: -122.2 },
        lastUpdateTime: 1790306900000,
      },
    ],
  };

  it('populated and sparse vehicles map with their fallbacks', async () => {
    h.methods.vehiclesForAgency.list.mockResolvedValueOnce({ data });
    const { vehicles } = await svc().getVehicles({ agencyId: '1' }, ctx);
    expect(vehicles).toEqual([
      {
        vehicleId: '1_v1',
        tripId: '1_trip_a',
        routeId: '1_100229',
        routeShortName: '5',
        tripHeadsign: 'Shoreline',
        position: { lat: 47.61, lon: -122.34 },
        lastUpdateTime: 1790307100000,
        phase: 'in_progress',
        scheduleDeviation: 60,
        orientation: 270,
        nextStop: '1_575',
        predicted: true,
      },
      {
        vehicleId: '1_v2',
        tripId: '1_trip_b',
        routeId: '1_100259',
        routeShortName: '44',
        tripHeadsign: 'Ballard',
        position: { lat: 47.66, lon: -122.31 },
        lastUpdateTime: 1790307000000,
        phase: 'layover_before',
        scheduleDeviation: null,
        orientation: null,
        nextStop: null,
        predicted: false,
      },
      {
        vehicleId: '1_v3',
        tripId: null,
        routeId: null,
        routeShortName: null,
        tripHeadsign: null,
        position: { lat: 47.5, lon: -122.2 },
        lastUpdateTime: 1790306900000,
        phase: 'unknown',
        scheduleDeviation: null,
        orientation: null,
        nextStop: null,
        predicted: false,
      },
    ]);
  });

  it('routeId filters client-side to the vehicles on that route', async () => {
    h.methods.vehiclesForAgency.list.mockResolvedValueOnce({ data });
    const { vehicles } = await svc().getVehicles({ agencyId: '1', routeId: '1_100259' }, ctx);
    expect(vehicles.map((v) => v.vehicleId)).toEqual(['1_v2']);
    expect(h.methods.vehiclesForAgency.list).toHaveBeenCalledWith('1');
  });

  it('an unreferenced active trip retains its ID without borrowing another trip metadata', async () => {
    h.methods.vehiclesForAgency.list.mockResolvedValueOnce({
      data: {
        references: data.references,
        list: [
          {
            vehicleId: '1_v4',
            tripId: '1_trip_a',
            location: { lat: 47.6, lon: -122.3 },
            lastUpdateTime: 1,
            tripStatus: { activeTripId: '1_trip_unreferenced' },
          },
        ],
      },
    });
    const result = await svc().getVehicles({ agencyId: '1' }, ctx);
    expect(result.limitExceeded).toBe(false);
    expect(result.vehicles[0]).toMatchObject({
      tripId: '1_trip_unreferenced',
      routeId: null,
      routeShortName: null,
      tripHeadsign: null,
    });
  });
  it('counts omitted coordinates agency-wide and only canonical matching trips on route', async () => {
    h.methods.vehiclesForAgency.list.mockResolvedValueOnce({
      data: {
        references: data.references,
        list: [
          { vehicleId: 'active', tripId: '1_trip_a', tripStatus: { activeTripId: '1_trip_b' } },
          { vehicleId: 'unresolved', tripId: '1_trip_b', tripStatus: { activeTripId: 'missing' } },
          {
            vehicleId: 'fallback',
            tripId: '1_trip_b',
            location: { lon: 0 },
            tripStatus: { activeTripId: '' },
          },
          { vehicleId: 'other', tripId: '1_trip_a', location: { lat: 0 } },
        ],
      },
    });
    expect(await svc().getVehicles({ agencyId: '1', routeId: '1_100259' }, ctx)).toMatchObject({
      vehicles: [],
      omittedWithoutPosition: 4,
      omittedWithoutPositionOnRoute: 2,
    });
  });
  it.each([
    { routeId: undefined, positioned: true, capped: false, omitted: 1, onRoute: undefined },
    { routeId: '1_100259', positioned: true, capped: false, omitted: 1, onRoute: 1 },
    { routeId: '1_100229', positioned: true, capped: true, omitted: 1, onRoute: 0 },
    { routeId: '1_100259', positioned: false, capped: true, omitted: 1, onRoute: 1 },
    { routeId: undefined, positioned: false, capped: false, omitted: 0, onRoute: undefined },
  ])(
    'preserves vehicle identity, counts and independent notices on both contract surfaces: %j',
    async (tc) => {
      h.methods.vehiclesForAgency.list.mockResolvedValueOnce({
        data: {
          references: data.references,
          limitExceeded: tc.capped,
          list: [
            ...(tc.positioned
              ? [{ ...data.list[1], tripStatus: { activeTripId: '1_trip_b', orientation: 90 } }]
              : []),
            ...(tc.omitted
              ? [
                  {
                    vehicleId: 'missing',
                    tripId: '1_trip_a',
                    tripStatus: { activeTripId: '1_trip_b' },
                  },
                ]
              : []),
          ],
        },
      });
      const result = await runToolContract(getVehicles, {
        agencyId: '1',
        ...(tc.routeId && { routeId: tc.routeId }),
      });
      expect(result.isError).toBeFalsy();
      const output = getVehicles.output.parse(result.structuredContent);
      expect(output.omittedWithoutPosition).toBe(tc.omitted);
      expect(output.omittedWithoutPositionOnRoute).toBe(tc.onRoute);
      const text = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      expect(text).toContain(`**Omitted without position (agency):** ${tc.omitted}`);
      if (tc.onRoute !== undefined)
        expect(text).toContain(`**Omitted without position (route):** ${tc.onRoute}`);
      if (tc.capped) expect(text).toContain('truncated upstream');
      if (tc.omitted) expect(text).toContain('without position coordinates');
      if (tc.positioned && tc.routeId !== '1_100229') {
        expect(output.vehicles).toHaveLength(1);
        expect(output.vehicles[0]).toMatchObject({
          tripId: '1_trip_b',
          routeId: '1_100259',
          tripHeadsign: 'Ballard',
          orientation: 90,
        });
        expect(text).toContain('**Trip ID:** 1_trip_b');
        expect(text).toContain('Ballard');
        expect(text).toContain('**Orientation (0=east, counter-clockwise):** 90°');
      } else {
        expect(output.vehicles).toEqual([]);
        expect(text).toContain('No active vehicles');
      }
    },
  );

  it.each([
    {
      error: new h.NotFoundError('missing'),
      reason: 'agency_not_found',
      hint: 'onebusaway_list_agencies',
    },
    { error: new h.RateLimitError('limited'), reason: 'rate_limited', hint: 'retry' },
  ])(
    'renders declared $reason recovery through the real service',
    async ({ error, reason, hint }) => {
      h.methods.vehiclesForAgency.list.mockRejectedValueOnce(error);
      const result = await runToolContract(getVehicles, { agencyId: '1' });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error: { data: { reason } } });
      const text = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      expect(text).toContain(reason);
      expect(text).toContain(hint);
    },
  );

  it('rejects invalid agency input before requesting vehicles', async () => {
    const result = await runToolContract(getVehicles, { agencyId: '' });
    expect(result.isError).toBe(true);
    expect(h.methods.vehiclesForAgency.list).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.InvalidParams },
    });
    expect(result.content.length).toBeGreaterThan(0);
  });
});

// ---- Schedules ----

describe('schedule mapping, sparse payloads', () => {
  it('falls back field by field from empty references to legacy and grouping metadata', async () => {
    h.methods.scheduleForRoute.retrieve.mockResolvedValueOnce({
      data: {
        references: {
          routes: [{ id: 'r', shortName: '', nullSafeShortName: '' }],
          stops: [{ id: 's', name: '' }],
          trips: [{ id: 't', tripHeadsign: '', serviceId: '' }],
        },
        entry: {
          routeId: 'r',
          scheduleDate: 0,
          stops: [{ id: 's', name: 'Legacy stop' }],
          trips: [{ id: 't', tripHeadsign: '', serviceId: '', routeShortName: 'Legacy route' }],
          stopTripGroupings: [
            {
              tripHeadsigns: ['Grouping headsign'],
              tripsWithStopTimes: [
                {
                  tripId: 't',
                  stopTimes: [
                    { stopId: 's', arrivalTime: 5, departureTime: 6, serviceId: 'stop-service' },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    const result = await svc().getScheduleForRoute({ routeId: 'r' }, ctx);
    expect(result).toEqual({
      timezone: 'UTC',
      routeId: 'r',
      routeShortName: 'Legacy route',
      serviceDateMs: 0,
      trips: [
        {
          tripId: 't',
          tripHeadsign: 'Grouping headsign',
          serviceId: 'stop-service',
          stops: [{ stopId: 's', stopName: 'Legacy stop', arrivalTime: 5, departureTime: 6 }],
        },
      ],
    });
  });

  it('counts zero departures in an empty upstream response with selection', async () => {
    h.methods.scheduleForStop.retrieve.mockResolvedValueOnce({
      data: { references: { routes: [], stops: [] }, entry: { date: 0, stopRouteSchedules: [] } },
    });
    const result = await runToolContract(getScheduleForStop, { stopId: 's', departureFromMs: 0 });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      routes: [],
      selection: { departureFromMs: 0, total: 0, returned: 0 },
      notice: expect.stringContaining('No departures matched'),
    });
    expect(
      result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n'),
    ).toContain('total: 0');
  });

  it('counts zero trips in an empty route response with selection', async () => {
    h.methods.scheduleForRoute.retrieve.mockResolvedValueOnce({
      data: { entry: { routeId: 'r', scheduleDate: 0 } },
    });
    const result = await runToolContract(getScheduleForRoute, { routeId: 'r', tripId: 'missing' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      trips: [],
      selection: { tripId: 'missing', total: 0, returned: 0 },
      notice: expect.stringContaining('No trips matched'),
    });
  });

  it.each([
    {
      tool: getScheduleForStop,
      args: { stopId: 's' },
      method: h.methods.scheduleForStop.retrieve,
      reason: 'stop_not_found',
      hint: 'onebusaway_search_stops',
    },
    {
      tool: getScheduleForRoute,
      args: { routeId: 'r' },
      method: h.methods.scheduleForRoute.retrieve,
      reason: 'route_not_found',
      hint: 'onebusaway_search_routes',
    },
    {
      tool: getBlock,
      args: { blockId: 'b' },
      method: h.methods.block.retrieve,
      reason: 'block_not_found',
      hint: 'onebusaway_get_trip',
    },
  ])(
    'renders $reason and rate_limited recovery on both surfaces',
    async ({ tool, args, method, reason, hint }) => {
      method.mockRejectedValueOnce(new h.NotFoundError('missing'));
      const missing = await runToolContract(tool, args as never);
      expect(missing.isError).toBe(true);
      expect(missing.structuredContent).toMatchObject({
        error: { data: { reason, recovery: { hint: expect.stringContaining(hint) } } },
      });
      expect(
        missing.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n'),
      ).toContain(hint);
      method.mockRejectedValueOnce(new h.RateLimitError('limited'));
      const limited = await runToolContract(tool, args as never);
      expect(limited.isError).toBe(true);
      expect(limited.structuredContent).toMatchObject({
        error: { data: { reason: 'rate_limited' } },
      });
      expect(
        limited.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n'),
      ).toContain('retry');
    },
  );

  it.each([
    { selectors: { tripId: 'a' }, ids: ['a'] },
    { selectors: { tripId: 'missing' }, ids: [] },
    { selectors: { departureFromSec: 90001 }, ids: ['a', 'b'] },
    { selectors: { departureBeforeSec: 90000 }, ids: [] },
    { selectors: { departureBeforeSec: 90001 }, ids: ['a'] },
    { selectors: { tripId: '   ' }, ids: ['a', 'b', 'empty'] },
  ])(
    'route selection $selectors preserves full trips and echoes applied fields',
    async ({ selectors, ids }) => {
      h.methods.scheduleForRoute.retrieve.mockResolvedValueOnce({
        data: {
          entry: {
            routeId: 'r',
            scheduleDate: 0,
            stopTripGroupings: [
              {
                tripsWithStopTimes: [
                  {
                    tripId: 'a',
                    stopTimes: [
                      { stopId: 's', arrivalTime: 89999, departureTime: 90000 },
                      { stopId: 's2', arrivalTime: 91000, departureTime: 91001 },
                    ],
                  },
                  {
                    tripId: 'b',
                    stopTimes: [{ stopId: 's', arrivalTime: 90001, departureTime: 90002 }],
                  },
                  { tripId: 'empty', stopTimes: [] },
                ],
              },
            ],
          },
        },
      });
      const result = await runToolContract(getScheduleForRoute, { routeId: 'r', ...selectors });
      expect(result.isError).toBeFalsy();
      const output = getScheduleForRoute.output.parse(result.structuredContent);
      expect(output.trips.map((trip) => trip.tripId)).toEqual(ids);
      if (ids.includes('a')) expect(output.trips[0]?.stops).toHaveLength(2);
      if (selectors.tripId === '   ') expect(output.selection).toBeUndefined();
      else expect(output.selection).toEqual({ ...selectors, total: 3, returned: ids.length });
      const text = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      if (ids.length === 0) expect(text).toContain('No trips matched');
      if (output.selection)
        for (const value of Object.values(output.selection)) expect(text).toContain(String(value));
    },
  );

  it.each([
    { selectors: { routeId: 'missing' }, count: 0 },
    { selectors: { departureFromMs: 20 }, count: 1 },
    { selectors: { departureBeforeMs: 20 }, count: 1 },
    { selectors: { departureFromMs: 0 }, count: 2 },
    { selectors: { routeId: '' }, count: 2 },
  ])(
    'stop selection $selectors handles open bounds and empty matches',
    async ({ selectors, count }) => {
      h.methods.scheduleForStop.retrieve.mockResolvedValueOnce({
        data: {
          references: { routes: [], stops: [] },
          entry: {
            date: 0,
            stopRouteSchedules: [
              {
                routeId: 'r',
                stopRouteDirectionSchedules: [
                  {
                    tripHeadsign: 'A',
                    scheduleStopTimes: [
                      { tripId: 'a', departureTime: 10 },
                      { tripId: 'b', departureTime: 20 },
                    ],
                  },
                ],
              },
            ],
          },
        },
      });
      const result = await runToolContract(getScheduleForStop, { stopId: 's', ...selectors });
      expect(result.isError).toBeFalsy();
      const output = getScheduleForStop.output.parse(result.structuredContent);
      if (selectors.routeId === '') expect(output.selection).toBeUndefined();
      else expect(output.selection).toEqual({ ...selectors, total: 2, returned: count });
      expect(
        output.routes.flatMap((route) =>
          route.directions.flatMap((direction) => direction.departures),
        ),
      ).toHaveLength(count);
      const text = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      if (count === 0) expect(text).toContain('No departures matched');
      if (output.selection)
        for (const value of Object.values(output.selection)) expect(text).toContain(String(value));
    },
  );

  it('selects complete route trips at inclusive lower/exclusive upper bounds after midnight', async () => {
    h.methods.scheduleForRoute.retrieve.mockResolvedValueOnce({
      data: {
        entry: {
          routeId: 'r',
          scheduleDate: 0,
          stopTripGroupings: [
            {
              tripsWithStopTimes: [
                {
                  tripId: 'a',
                  stopTimes: [
                    { stopId: 's', arrivalTime: 89999, departureTime: 90000 },
                    { stopId: 's2', arrivalTime: 91000, departureTime: 91001 },
                  ],
                },
                {
                  tripId: 'b',
                  stopTimes: [{ stopId: 's', arrivalTime: 90001, departureTime: 90002 }],
                },
              ],
            },
          ],
        },
      },
    });
    const result = await runToolContract(getScheduleForRoute, {
      routeId: 'r',
      departureFromSec: 90000,
      departureBeforeSec: 90002,
    } as never);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      trips: [{ tripId: 'a', stops: [{ stopId: 's' }, { stopId: 's2' }] }],
      selection: { departureFromSec: 90000, departureBeforeSec: 90002, total: 2, returned: 1 },
    });
    const text = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    for (const value of ['90000', '90002', '91001', 'total', 'returned'])
      expect(text).toContain(value);
  });

  it('selects stop departure rows with route AND epoch bounds, removing empty nested groups', async () => {
    h.methods.scheduleForStop.retrieve.mockResolvedValueOnce({
      data: {
        references: { routes: [], stops: [] },
        entry: {
          date: 0,
          stopRouteSchedules: [
            {
              routeId: 'r',
              stopRouteDirectionSchedules: [
                {
                  tripHeadsign: 'A',
                  scheduleStopTimes: [
                    { tripId: 'a', departureTime: 10 },
                    { tripId: 'b', departureTime: 20 },
                  ],
                },
                { tripHeadsign: 'empty', scheduleStopTimes: [] },
              ],
            },
            {
              routeId: 'other',
              stopRouteDirectionSchedules: [
                { tripHeadsign: 'B', scheduleStopTimes: [{ tripId: 'c', departureTime: 10 }] },
              ],
            },
          ],
        },
      },
    });
    const result = await runToolContract(getScheduleForStop, {
      stopId: 's',
      routeId: 'r',
      departureFromMs: 10,
      departureBeforeMs: 20,
    } as never);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      routes: [
        { routeId: 'r', directions: [{ tripHeadsign: 'A', departures: [{ tripId: 'a' }] }] },
      ],
      selection: {
        routeId: 'r',
        departureFromMs: 10,
        departureBeforeMs: 20,
        total: 3,
        returned: 1,
      },
    });
  });

  it('characterizes selector-free schedules preserving empty routes/directions and all departures', async () => {
    h.methods.scheduleForStop.retrieve.mockResolvedValueOnce({
      data: {
        references: { routes: [], stops: [] },
        entry: {
          date: 0,
          stopRouteSchedules: [
            {
              routeId: 'r',
              stopRouteDirectionSchedules: [
                {
                  tripHeadsign: 'A',
                  scheduleStopTimes: [
                    { tripId: 'a', departureTime: 10 },
                    { tripId: 'b', departureTime: 20 },
                  ],
                },
                { tripHeadsign: 'empty', scheduleStopTimes: [] },
              ],
            },
            { routeId: 'empty', stopRouteDirectionSchedules: [] },
          ],
        },
      },
    });
    const result = await svc().getScheduleForStop({ stopId: 's' }, ctx);
    expect(result.routes.map((route) => route.routeId)).toEqual(['r', 'empty']);
    expect(result.routes[0]?.directions.map((direction) => direction.departures.length)).toEqual([
      2, 0,
    ]);
    expect(result).not.toHaveProperty('selection');
  });

  it.each([false, true])(
    'resolves referenced route/stop/trip metadata on both surfaces (legacy=%s)',
    async (legacy) => {
      h.methods.scheduleForRoute.retrieve.mockResolvedValueOnce({
        data: {
          entry: {
            routeId: 'r',
            scheduleDate: 0,
            ...(legacy && {
              trips: [
                {
                  id: 't',
                  tripHeadsign: 'Legacy headsign',
                  serviceId: 'legacy',
                  routeShortName: 'Legacy route',
                },
              ],
              stops: [{ id: 's', name: 'Legacy stop' }],
            }),
            stopTripGroupings: [
              {
                tripHeadsigns: ['Grouping'],
                tripsWithStopTimes: [
                  {
                    tripId: 't',
                    stopTimes: [
                      {
                        stopId: 's',
                        arrivalTime: 90000,
                        departureTime: 90001,
                        serviceId: 'stop-service',
                      },
                    ],
                  },
                ],
              },
            ],
          },
          references: {
            routes: [{ id: 'r', shortName: '', nullSafeShortName: 'Referenced route' }],
            stops: [{ id: 's', name: 'Referenced stop' }],
            trips: [
              { id: 't', tripHeadsign: 'Referenced headsign', serviceId: 'referenced' },
              { id: 'unscheduled' },
            ],
          },
        },
      });
      const result = await runToolContract(getScheduleForRoute, { routeId: 'r' });
      expect(result.isError).toBeFalsy();
      const output = getScheduleForRoute.output.parse(result.structuredContent);
      expect(output.routeShortName).toBe('Referenced route');
      expect(output.trips).toEqual([
        {
          tripId: 't',
          tripHeadsign: 'Referenced headsign',
          serviceId: 'referenced',
          stops: [
            { stopId: 's', stopName: 'Referenced stop', arrivalTime: 90000, departureTime: 90001 },
          ],
        },
      ]);
      const text = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      for (const value of [
        'Referenced route',
        'Referenced stop',
        'Referenced headsign',
        'referenced',
        '90001',
      ])
        expect(text).toContain(value);
    },
  );

  it('characterizes legacy enumeration and stop order independently of reference trips', async () => {
    h.methods.scheduleForRoute.retrieve.mockResolvedValueOnce({
      data: {
        entry: {
          routeId: 'r',
          scheduleDate: 0,
          trips: [
            { id: 'b', serviceId: 'week', routeShortName: '44' },
            { id: 'a', serviceId: 'week' },
          ],
          stops: [{ id: 's', name: 'Legacy stop' }],
          stopTripGroupings: [
            {
              tripsWithStopTimes: [
                {
                  tripId: 'b',
                  stopTimes: [{ stopId: 's', arrivalTime: 90000, departureTime: 90001 }],
                },
              ],
            },
          ],
        },
        references: { trips: [{ id: 'unscheduled' }] },
      },
    });
    const result = await svc().getScheduleForRoute({ routeId: 'r' }, ctx);
    expect(result.trips.map((trip) => trip.tripId)).toEqual(['b', 'a']);
    expect(result.trips[0]?.stops).toEqual([
      { stopId: 's', stopName: 'Legacy stop', arrivalTime: 90000, departureTime: 90001 },
    ]);
    expect(result.routeShortName).toBe('44');
  });

  it('getScheduleForStop: stop and route missing from references are named by their IDs', async () => {
    h.methods.scheduleForStop.retrieve.mockResolvedValueOnce({
      data: {
        references: { routes: [], stops: [] },
        entry: {
          date: 1790233200000,
          stopRouteSchedules: [
            {
              routeId: '1_100229',
              stopRouteDirectionSchedules: [
                {
                  tripHeadsign: 'Shoreline',
                  scheduleStopTimes: [{ departureTime: 1, tripId: 't' }],
                },
              ],
            },
          ],
        },
      },
    });
    const result = await svc().getScheduleForStop({ stopId: '1_570', date: '2026-09-24' }, ctx);
    expect(h.methods.scheduleForStop.retrieve).toHaveBeenCalledWith('1_570', {
      date: '2026-09-24',
    });
    expect(result).toEqual({
      stopId: '1_570',
      timezone: 'UTC',
      stopName: '1_570',
      serviceDateMs: 1790233200000,
      routes: [
        {
          routeId: '1_100229',
          routeShortName: '1_100229',
          directions: [
            { tripHeadsign: 'Shoreline', departures: [{ scheduledDepartureTime: 1, tripId: 't' }] },
          ],
        },
      ],
    });
  });

  it('getScheduleForRoute: no stops, trips, or groupings → no trips, route ID as short name', async () => {
    h.methods.scheduleForRoute.retrieve.mockResolvedValueOnce({
      data: { entry: { routeId: '1_100229', scheduleDate: 1790233200000 } },
    });
    const result = await svc().getScheduleForRoute({ routeId: '1_100229' }, ctx);
    expect(h.methods.scheduleForRoute.retrieve).toHaveBeenCalledWith('1_100229', {});
    expect(result).toEqual({
      routeId: '1_100229',
      timezone: 'UTC',
      routeShortName: '1_100229',
      serviceDateMs: 1790233200000,
      trips: [],
    });
  });

  it('getScheduleForRoute (groupings path): missing headsigns, stop times, and stop names fall back', async () => {
    h.methods.scheduleForRoute.retrieve.mockResolvedValueOnce({
      data: {
        entry: {
          routeId: '1_100229',
          scheduleDate: 1790233200000,
          stopTripGroupings: [
            {
              tripsWithStopTimes: [
                { tripId: '1_empty', stopTimes: [] },
                {
                  tripId: '1_named',
                  stopTimes: [
                    { stopId: '1_x', arrivalTime: 60, departureTime: 90, serviceId: 'wkdy' },
                  ],
                },
              ],
            },
            {},
          ],
        },
      },
    });
    const result = await svc().getScheduleForRoute({ routeId: '1_100229' }, ctx);
    expect(result.trips).toEqual([
      { tripId: '1_empty', tripHeadsign: '', serviceId: '', stops: [] },
      {
        tripId: '1_named',
        tripHeadsign: '',
        serviceId: 'wkdy',
        stops: [{ stopId: '1_x', stopName: '1_x', arrivalTime: 60, departureTime: 90 }],
      },
    ]);
  });

  it('getScheduleForRoute (entry.trips path): a trip absent from the groupings has no stops; headsign omitted → ""', async () => {
    h.methods.scheduleForRoute.retrieve.mockResolvedValueOnce({
      data: {
        entry: {
          routeId: '1_100229',
          scheduleDate: 1790233200000,
          trips: [{ id: '1_t', serviceId: 'sat', routeShortName: '' }],
          stopTripGroupings: [{ tripsWithStopTimes: [] }, {}],
        },
      },
    });
    const result = await svc().getScheduleForRoute({ routeId: '1_100229' }, ctx);
    expect(result.routeShortName).toBe('1_100229');
    expect(result.trips).toEqual([
      { tripId: '1_t', tripHeadsign: '', serviceId: 'sat', stops: [] },
    ]);
  });
});

// ---- Alerts ----

describe('getAlert mapping', () => {
  it('sparse: a situation carrying only its ID maps every field to its fallback', async () => {
    h.methods.get.mockResolvedValueOnce({ data: { entry: { id: '1_bare' } } });
    expect(await svc().getAlert('1_bare', ctx)).toEqual({
      timezone: 'UTC',
      id: '1_bare',
      summary: '',
      description: null,
      reason: null,
      severity: null,
      consequenceMessage: null,
      affects: [],
      consequences: [],
      activeWindows: [],
      url: null,
    });
  });

  it('populated: stop/trip affects and diversion stops survive; empty-string fields are dropped', async () => {
    h.methods.get.mockResolvedValueOnce({
      data: {
        entry: {
          id: '1_detour',
          summary: { value: 'Detour' },
          allAffects: [
            { agencyId: '', routeId: '', stopId: '1_570', tripId: '1_trip' },
            { agencyId: '', routeId: '', stopId: '', tripId: '' },
          ],
          consequences: [
            { condition: 'DETOUR', conditionDetails: { diversionStopIds: ['1_575', '1_580'] } },
            { condition: 'DETOUR', conditionDetails: { diversionStopIds: [] } },
          ],
          activeWindows: [{ from: 1, to: 2 }],
          url: { value: 'https://example.org/detour' },
        },
      },
    });
    const alert = await svc().getAlert('1_detour', ctx);
    expect(alert.affects).toEqual([{ stopId: '1_570', tripId: '1_trip' }, {}]);
    expect(alert.consequences).toEqual([
      { condition: 'DETOUR', diversionStopIds: ['1_575', '1_580'] },
      { condition: 'DETOUR' },
    ]);
    expect(alert.activeWindows).toEqual([{ from: 1, to: 2 }]);
    expect(alert.url).toBe('https://example.org/detour');
  });

  it('a response with data but no entry is situation_not_found', async () => {
    h.methods.get.mockResolvedValueOnce({ data: {} });
    const err = await caught(svc().getAlert('1_gone', ctx));
    expect(err.data).toMatchObject({ reason: 'situation_not_found', id: '1_gone' });
  });
});

// ---- Block ----

describe('getBlock mapping', () => {
  it.each([
    { selector: { tripId: 'same' }, returned: 2, perSlot: [0, 1, 1] },
    { selector: { tripId: 'missing' }, returned: 0, perSlot: [0, 0, 0] },
    {
      selector: { departureFromSec: 90000, departureBeforeSec: 90002 },
      returned: 2,
      perSlot: [0, 1, 1],
    },
    { selector: { departureBeforeSec: 90000 }, returned: 0, perSlot: [0, 0, 0] },
    { selector: { departureFromSec: 90002 }, returned: 2, perSlot: [0, 1, 1] },
  ])(
    'block selectors $selector preserve slots and count repeated trip occurrences',
    async ({ selector, returned, perSlot }) => {
      const trip = {
        tripId: 'same',
        distanceAlongBlock: 2,
        accumulatedSlackTime: 3,
        blockStopTimes: [
          { stopTime: { stopId: 's', arrivalTime: 89999, departureTime: 90000, pickupType: 1 } },
          { stopTime: { stopId: 's2', arrivalTime: 90002, departureTime: 90002, dropOffType: 2 } },
        ],
      };
      h.methods.block.retrieve.mockResolvedValueOnce({
        data: {
          entry: {
            id: 'b',
            configurations: [
              { activeServiceIds: ['first'], trips: [] },
              { activeServiceIds: ['second'], trips: [trip] },
              { activeServiceIds: ['third'], inactiveServiceIds: ['holiday'], trips: [trip] },
            ],
          },
        },
      });
      const result = await runToolContract(getBlock, { blockId: 'b', ...selector });
      expect(result.isError).toBeFalsy();
      const output = getBlock.output.parse(result.structuredContent);
      expect(output.trips).toEqual([]);
      expect(output.activeServiceIds).toEqual(['first']);
      expect(output.alternateConfigurations.map((config) => config.activeServiceIds)).toEqual([
        ['second'],
        ['third'],
      ]);
      expect(output.selection).toEqual({
        ...selector,
        total: 2,
        returned,
        configurationCounts: [0, 1, 1].map((total, index) => ({ total, returned: perSlot[index] })),
      });
      for (const config of output.alternateConfigurations)
        if (returned > 0) expect(config.trips[0]?.blockStopTimes).toHaveLength(2);
      const text = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      for (const value of [
        'first',
        'second',
        'third',
        'holiday',
        'Configuration 0 (first returned)',
        'Configuration 1 (alternative 1)',
        'Configuration 2 (alternative 2)',
      ])
        expect(text).toContain(value);
      if (returned === 0) {
        expect(result.structuredContent).toMatchObject({
          notice: expect.stringContaining('No trips matched'),
        });
        expect(text).toContain('No trips matched');
      }
    },
  );

  it('preserves all alternative configuration slots and fields on both surfaces', async () => {
    h.methods.block.retrieve.mockResolvedValueOnce({
      data: {
        entry: {
          id: 'b',
          configurations: [
            { activeServiceIds: ['first'], trips: [] },
            {
              activeServiceIds: ['alternate'],
              inactiveServiceIds: ['holiday'],
              trips: [
                {
                  tripId: 't',
                  distanceAlongBlock: 12,
                  accumulatedSlackTime: 34,
                  blockStopTimes: [
                    {
                      stopTime: {
                        stopId: 's',
                        arrivalTime: 90000,
                        departureTime: 90001,
                        pickupType: 1,
                        dropOffType: 2,
                      },
                    },
                  ],
                },
              ],
            },
            { activeServiceIds: ['empty'], trips: [] },
          ],
        },
      },
    });
    const result = await runToolContract(getBlock, { blockId: 'b' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      activeServiceIds: ['first'],
      trips: [],
      alternateConfigurations: [
        {
          activeServiceIds: ['alternate'],
          inactiveServiceIds: ['holiday'],
          trips: [{ tripId: 't', blockStopTimes: [{ pickupType: 1, dropOffType: 2 }] }],
        },
        { activeServiceIds: ['empty'], inactiveServiceIds: [], trips: [] },
      ],
    });
    const text = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    for (const value of [
      'first',
      'alternate',
      'holiday',
      'empty',
      '90001',
      'pickup:1',
      'dropoff:2',
    ])
      expect(text).toContain(value);
    expect(text).toContain('First returned configuration');
  });

  it('characterizes first returned configuration selection and stop order', async () => {
    h.methods.block.retrieve.mockResolvedValueOnce({
      data: {
        entry: {
          id: 'b',
          configurations: [
            { activeServiceIds: ['weekend'], trips: [] },
            { activeServiceIds: ['weekday'], trips: [] },
          ],
        },
      },
    });
    const block = await svc().getBlock('b', ctx);
    expect(block.activeServiceIds).toEqual(['weekend']);
    expect(block.trips).toEqual([]);
  });

  it('populated: carries inactive services and pickup/drop-off types', async () => {
    h.methods.block.retrieve.mockResolvedValueOnce({
      data: {
        entry: {
          id: '1_block',
          configurations: [
            {
              activeServiceIds: ['wkdy'],
              inactiveServiceIds: ['hol'],
              trips: [
                {
                  tripId: '1_trip',
                  distanceAlongBlock: 0,
                  accumulatedSlackTime: 120,
                  blockStopTimes: [
                    {
                      stopTime: {
                        arrivalTime: 36000,
                        departureTime: 36060,
                        stopId: '1_570',
                        pickupType: 1,
                        dropOffType: 0,
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    expect(await svc().getBlock('1_block', ctx)).toEqual({
      blockId: '1_block',
      alternateConfigurations: [],
      activeServiceIds: ['wkdy'],
      inactiveServiceIds: ['hol'],
      trips: [
        {
          tripId: '1_trip',
          distanceAlongBlock: 0,
          accumulatedSlackTime: 120,
          blockStopTimes: [
            {
              arrivalTime: 36000,
              departureTime: 36060,
              stopId: '1_570',
              pickupType: 1,
              dropOffType: 0,
            },
          ],
        },
      ],
    });
  });

  it('sparse: inactive services omitted → []; pickup/drop-off types omitted → absent', async () => {
    h.methods.block.retrieve.mockResolvedValueOnce({
      data: {
        entry: {
          id: '1_block',
          configurations: [
            {
              activeServiceIds: ['wkdy'],
              trips: [
                {
                  tripId: '1_trip',
                  distanceAlongBlock: 0,
                  accumulatedSlackTime: 0,
                  blockStopTimes: [
                    { stopTime: { arrivalTime: 1, departureTime: 2, stopId: '1_570' } },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    const block = await svc().getBlock('1_block', ctx);
    expect(block.inactiveServiceIds).toEqual([]);
    expect(block.trips[0]?.blockStopTimes).toEqual([
      { arrivalTime: 1, departureTime: 2, stopId: '1_570' },
    ]);
  });

  it.each([
    ['no entry', { data: {} }],
    ['no configurations', { data: { entry: { id: '1_block' } } }],
    ['an empty configuration list', { data: { entry: { id: '1_block', configurations: [] } } }],
  ])('%s → block_not_found', async (_label, payload) => {
    h.methods.block.retrieve.mockResolvedValueOnce(payload);
    const err = await caught(svc().getBlock('1_block', ctx));
    expect(err.code).toBe(JsonRpcErrorCode.NotFound);
    expect(err.data).toMatchObject({ reason: 'block_not_found', id: '1_block' });
  });
});

// ---- classifyError arms not reached through a typed SDK error ----

describe('classifyError', () => {
  it('an SDK not-found on a call with no contract reason → NotFound carrying only the ID', async () => {
    h.methods.agenciesWithCoverage.list.mockRejectedValueOnce(new h.NotFoundError('404'));
    const err = await caught(svc().listAgencies(ctx));
    expect(err.code).toBe(JsonRpcErrorCode.NotFound);
    expect(err.message).toBe('agencies "list" not found.');
    expect(err.data).toEqual({ id: 'list' });
  });

  it('an unrecognized Error → ServiceUnavailable naming it, with the error as cause', async () => {
    const boom = new TypeError('socket hang up');
    h.methods.stop.retrieve.mockRejectedValueOnce(boom);
    const err = await caught(svc().getStop('1_570', ctx));
    expect(err.code).toBe(JsonRpcErrorCode.ServiceUnavailable);
    expect(err.message).toBe('OneBusAway API error: socket hang up');
    expect(err.cause).toBe(boom);
  });

  it('an unrecognized non-Error value → ServiceUnavailable naming its string form, no cause', async () => {
    h.methods.stop.retrieve.mockRejectedValueOnce('upstream went away');
    const err = await caught(svc().getStop('1_570', ctx));
    expect(err.code).toBe(JsonRpcErrorCode.ServiceUnavailable);
    expect(err.message).toBe('OneBusAway API error: upstream went away');
    expect(err.cause).toBeUndefined();
  });

  it('an SDK connection error → ServiceUnavailable', async () => {
    h.methods.stop.retrieve.mockRejectedValueOnce(new h.APIConnectionError('ECONNRESET'));
    const err = await caught(svc().getStop('1_570', ctx));
    expect(err.code).toBe(JsonRpcErrorCode.ServiceUnavailable);
    expect(err.message).toBe('Cannot connect to OneBusAway API.');
  });
});
