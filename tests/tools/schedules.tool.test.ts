/**
 * @fileoverview Tests for schedule tools: get-schedule-for-stop, get-schedule-for-route.
 * @module tests/tools/schedules.tool.test
 */

import { createMockContext, getEnrichment } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getScheduleForRoute } from '@/mcp-server/tools/definitions/get-schedule-for-route.tool.js';
import { getScheduleForStop } from '@/mcp-server/tools/definitions/get-schedule-for-stop.tool.js';

vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = {
  getScheduleForStop: vi.fn(),
  getScheduleForRoute: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
  vi.clearAllMocks();
});

const NOW_MS = 1748000000000;

/** Unix ms for stop schedule departure times (OBA schedule-for-stop returns Unix ms). */
const DEP_TIME_1 = NOW_MS + 2 * 60 * 1000; // 2 min after base time
const DEP_TIME_2 = NOW_MS + 8 * 60 * 1000; // 8 min after base time

/** Seconds from midnight for route schedule stop times. */
const ARR_TIME_A = 8 * 3600; // 08:00
const DEP_TIME_A = 8 * 3600 + 60; // 08:01
const ARR_TIME_B = 8 * 3600 + 2 * 60; // 08:02
const DEP_TIME_B = 8 * 3600 + 3 * 60; // 08:03

const STOP_SCHEDULE = {
  stopId: '1_75403',
  stopName: 'University Way NE & NE 42nd St',
  serviceDateMs: NOW_MS,
  routes: [
    {
      routeId: '1_100259',
      routeShortName: '44',
      directions: [
        {
          tripHeadsign: 'Downtown Seattle',
          departures: [
            { scheduledDepartureTime: DEP_TIME_1, tripId: 'trip_abc' },
            { scheduledDepartureTime: DEP_TIME_2, tripId: 'trip_def' },
          ],
        },
      ],
    },
  ],
};

const ROUTE_SCHEDULE = {
  routeId: '1_100259',
  routeShortName: '44',
  serviceDateMs: NOW_MS,
  trips: [
    {
      tripId: 'trip_abc',
      tripHeadsign: 'Downtown Seattle',
      serviceId: 'svc_weekday',
      stops: [
        {
          stopId: '1_75400',
          stopName: 'U-District',
          arrivalTime: ARR_TIME_A,
          departureTime: DEP_TIME_A,
        },
        {
          stopId: '1_75403',
          stopName: 'University Way',
          arrivalTime: ARR_TIME_B,
          departureTime: DEP_TIME_B,
        },
      ],
    },
  ],
};

// ---- getScheduleForStop ----

describe('getScheduleForStop', () => {
  it('returns stop schedule from service', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForStop.mockResolvedValue(STOP_SCHEDULE);
    const input = getScheduleForStop.input.parse({ stopId: '1_75403' });
    const result = await getScheduleForStop.handler(input, ctx);
    expect(result.stopId).toBe('1_75403');
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]!.directions[0]!.departures).toHaveLength(2);
  });

  it('enriches with queriedStop and routeCount', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForStop.mockResolvedValue(STOP_SCHEDULE);
    const input = getScheduleForStop.input.parse({ stopId: '1_75403' });
    await getScheduleForStop.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.queriedStop).toBe('1_75403');
    expect(enrichment.routeCount).toBe(1);
    expect(enrichment.notice).toBeUndefined();
  });

  it('enriches with notice when no routes found', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForStop.mockResolvedValue({ ...STOP_SCHEDULE, routes: [] });
    const input = getScheduleForStop.input.parse({ stopId: '1_75403' });
    await getScheduleForStop.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.routeCount).toBe(0);
    expect(enrichment.notice).toMatch(/no scheduled departures/i);
  });

  it('echoes date in enrichment when provided', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForStop.mockResolvedValue(STOP_SCHEDULE);
    const input = getScheduleForStop.input.parse({ stopId: '1_75403', date: '2026-05-23' });
    await getScheduleForStop.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.date).toBe('2026-05-23');
  });

  it('passes date when provided', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForStop.mockResolvedValue(STOP_SCHEDULE);
    const input = getScheduleForStop.input.parse({ stopId: '1_75403', date: '2026-05-23' });
    await getScheduleForStop.handler(input, ctx);
    expect(mockService.getScheduleForStop).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-05-23' }),
      ctx,
    );
  });

  it('omits empty date from service call', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForStop.mockResolvedValue(STOP_SCHEDULE);
    const input = getScheduleForStop.input.parse({ stopId: '1_75403', date: '' });
    await getScheduleForStop.handler(input, ctx);
    expect(mockService.getScheduleForStop).toHaveBeenCalledWith(
      expect.not.objectContaining({ date: expect.anything() }),
      ctx,
    );
  });

  it('propagates service errors', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForStop.mockRejectedValue(new Error('stop not found'));
    const input = getScheduleForStop.input.parse({ stopId: 'bad_id' });
    await expect(getScheduleForStop.handler(input, ctx)).rejects.toThrow();
  });

  it('formats schedule with stop ID and route ID', () => {
    const blocks = getScheduleForStop.format!(STOP_SCHEDULE);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('1_75403');
    expect(text).toContain('1_100259');
    expect(text).toContain('44');
    expect(text).toContain('trip_abc');
    // service date shown as human-readable text AND raw ms for format parity
    expect(text).toMatch(/service date/i);
    expect(text).toContain(NOW_MS.toString());
    // departure times shown as HH:MM alongside raw ms
    expect(text).toMatch(/\d{2}:\d{2}/);
    expect(text).toContain(DEP_TIME_1.toString());
  });
});

// ---- getScheduleForRoute ----

describe('getScheduleForRoute', () => {
  it('returns route schedule from service', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForRoute.mockResolvedValue(ROUTE_SCHEDULE);
    const input = getScheduleForRoute.input.parse({ routeId: '1_100259' });
    const result = await getScheduleForRoute.handler(input, ctx);
    expect(result.routeId).toBe('1_100259');
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0]!.stops).toHaveLength(2);
  });

  it('enriches with queriedRoute and tripCount', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForRoute.mockResolvedValue(ROUTE_SCHEDULE);
    const input = getScheduleForRoute.input.parse({ routeId: '1_100259' });
    await getScheduleForRoute.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.queriedRoute).toBe('1_100259');
    expect(enrichment.tripCount).toBe(1);
    expect(enrichment.notice).toBeUndefined();
  });

  it('enriches with notice when no trips found', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForRoute.mockResolvedValue({ ...ROUTE_SCHEDULE, trips: [] });
    const input = getScheduleForRoute.input.parse({ routeId: '1_100259' });
    await getScheduleForRoute.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.tripCount).toBe(0);
    expect(enrichment.notice).toMatch(/no trips/i);
  });

  it('echoes date in enrichment when provided', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForRoute.mockResolvedValue(ROUTE_SCHEDULE);
    const input = getScheduleForRoute.input.parse({ routeId: '1_100259', date: '2026-05-23' });
    await getScheduleForRoute.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.date).toBe('2026-05-23');
  });

  it('passes date when provided', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForRoute.mockResolvedValue(ROUTE_SCHEDULE);
    const input = getScheduleForRoute.input.parse({ routeId: '1_100259', date: '2026-05-23' });
    await getScheduleForRoute.handler(input, ctx);
    expect(mockService.getScheduleForRoute).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-05-23' }),
      ctx,
    );
  });

  it('propagates service errors', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForRoute.mockRejectedValue(new Error('route not found'));
    const input = getScheduleForRoute.input.parse({ routeId: 'bad_id' });
    await expect(getScheduleForRoute.handler(input, ctx)).rejects.toThrow();
  });

  it('formats schedule with route ID, trip ID, and stops', () => {
    const blocks = getScheduleForRoute.format!(ROUTE_SCHEDULE);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('44');
    expect(text).toContain('trip_abc');
    expect(text).toContain('1_75403');
    // service date shown as human-readable text AND raw ms for format parity
    expect(text).toMatch(/service date/i);
    expect(text).toContain(NOW_MS.toString());
    // stop times shown as HH:MM alongside raw seconds-from-midnight for format parity
    expect(text).toMatch(/\d{2}:\d{2}/);
    expect(text).toContain(ARR_TIME_A.toString());
  });

  it('formats empty trips list', () => {
    const empty = { ...ROUTE_SCHEDULE, trips: [] };
    const text = (getScheduleForRoute.format!(empty)[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('0');
  });
});
