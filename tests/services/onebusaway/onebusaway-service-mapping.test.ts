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
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  for (const m of h.all) m.mockClear();
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
    expect(result.situations).toEqual([{ id: '1_sit', summary: '', description: null }]);
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
        tripId: '1_trip_a',
        routeId: '1_100259',
        routeShortName: '44',
        tripHeadsign: 'Shoreline',
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

  it('an active trip missing from references falls back to the vehicle trip route', async () => {
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
    expect(result.vehicles[0]?.routeId).toBe('1_100229');
  });
});

// ---- Schedules ----

describe('schedule mapping, sparse payloads', () => {
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
