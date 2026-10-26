/**
 * @fileoverview Tests for schedule tools: get-schedule-for-stop, get-schedule-for-route.
 * @module tests/tools/schedules.tool.test
 */

import { getEnrichment, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getScheduleForRoute } from '@/mcp-server/tools/definitions/get-schedule-for-route.tool.js';
import { getScheduleForStop } from '@/mcp-server/tools/definitions/get-schedule-for-stop.tool.js';
import { formatEpoch } from '@/mcp-server/tools/format-helpers.js';
import { createToolContext } from './tool-context.helper.js';

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
  timezone: 'America/Los_Angeles',
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
  timezone: 'America/Los_Angeles',
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
  it.each(['time', 'date', 'datetime'] as const)(
    'formats %s with explicit zones independently of host TZ',
    (kind) => {
      const old = process.env.TZ;
      try {
        process.env.TZ = 'UTC';
        const result = formatEpoch(1792988700000, 'America/Los_Angeles', kind);
        process.env.TZ = 'Asia/Tokyo';
        expect(formatEpoch(1792988700000, 'America/Los_Angeles', kind)).toBe(result);
        expect(result).toContain('America/Los_Angeles');
      } finally {
        if (old === undefined) delete process.env.TZ;
        else process.env.TZ = old;
      }
    },
  );
  it('keeps the same explicit-zone text under UTC and Tokyo host timezones', () => {
    const old = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const utc = getScheduleForStop.format!(STOP_SCHEDULE);
      process.env.TZ = 'Asia/Tokyo';
      expect(getScheduleForStop.format!(STOP_SCHEDULE)).toEqual(utc);
      expect(JSON.stringify(utc)).toContain('America/Los_Angeles');
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  });
  it('renders the agency date and clock independently of the host timezone', () => {
    const result = {
      ...STOP_SCHEDULE,
      timezone: 'America/Los_Angeles',
      serviceDateMs: 1792988700000,
      routes: [
        {
          ...STOP_SCHEDULE.routes[0]!,
          directions: [
            {
              tripHeadsign: 'Night',
              departures: [{ scheduledDepartureTime: 1792988700000, tripId: 'night' }],
            },
          ],
        },
      ],
    };
    const text = (getScheduleForStop.format!(result)[0] as { text: string }).text;
    expect(text).toContain('21:25 America/Los_Angeles');
    expect(text).toContain('Oct 25, 2026 America/Los_Angeles');
  });
  it('describes the stop marker without promising midnight', () => {
    expect(getScheduleForStop.output.shape.serviceDateMs.description).toContain('query time');
  });
  it.each([undefined, '', '2026-10-25'])(
    'preserves the upstream marker with date %s',
    async (date) => {
      const marker = date ? 1792911600000 : 1792988700123;
      mockService.getScheduleForStop.mockResolvedValue({ ...STOP_SCHEDULE, serviceDateMs: marker });
      const result = await getScheduleForStop.handler(
        getScheduleForStop.input.parse({ stopId: '1_75403', date }),
        createToolContext(getScheduleForStop),
      );
      expect(result.serviceDateMs).toBe(marker);
      expect((getScheduleForStop.format!(result)[0] as { text: string }).text).toContain(
        String(marker),
      );
    },
  );
  it('wires stop selectors and renders selection counts through the production contract', async () => {
    const selection = {
      routeId: '1_100259',
      departureFromMs: 0,
      departureBeforeMs: DEP_TIME_2,
      total: 4,
      returned: 2,
    };
    mockService.getScheduleForStop.mockResolvedValue({ ...STOP_SCHEDULE, selection });
    const result = await runToolContract(getScheduleForStop, {
      stopId: '1_75403',
      routeId: '1_100259',
      departureFromMs: 0,
      departureBeforeMs: DEP_TIME_2,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ selection });
    expect(mockService.getScheduleForStop).toHaveBeenCalledWith(
      { stopId: '1_75403', routeId: '1_100259', departureFromMs: 0, departureBeforeMs: DEP_TIME_2 },
      expect.anything(),
    );
    const text = result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    for (const value of [
      'departureFromMs: 0',
      `departureBeforeMs: ${DEP_TIME_2}`,
      'total: 4',
      'returned: 2',
      'trip_abc',
    ])
      expect(text).toContain(value);
  });

  it.each([
    { departureFromMs: 20, departureBeforeMs: 20 },
    { departureFromMs: -1 },
    { departureBeforeMs: 0.5 },
  ])('rejects invalid stop selector %j before I/O', async (selectors) => {
    const result = await runToolContract(getScheduleForStop, { stopId: 's', ...selectors });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code: -32602 } });
    expect(result.content.length).toBeGreaterThan(0);
    expect(mockService.getScheduleForStop).not.toHaveBeenCalled();
  });
  it('returns stop schedule from service', async () => {
    const ctx = createToolContext(getScheduleForStop);
    mockService.getScheduleForStop.mockResolvedValue(STOP_SCHEDULE);
    const input = getScheduleForStop.input.parse({ stopId: '1_75403' });
    const result = await getScheduleForStop.handler(input, ctx);
    expect(result.stopId).toBe('1_75403');
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]!.directions[0]!.departures).toHaveLength(2);
  });

  it('enriches with queriedStop and routeCount', async () => {
    const ctx = createToolContext(getScheduleForStop);
    mockService.getScheduleForStop.mockResolvedValue(STOP_SCHEDULE);
    const input = getScheduleForStop.input.parse({ stopId: '1_75403' });
    await getScheduleForStop.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.queriedStop).toBe('1_75403');
    expect(enrichment.routeCount).toBe(1);
    expect(enrichment.notice).toBeUndefined();
  });

  it('enriches with notice when no routes found', async () => {
    const ctx = createToolContext(getScheduleForStop);
    mockService.getScheduleForStop.mockResolvedValue({ ...STOP_SCHEDULE, routes: [] });
    const input = getScheduleForStop.input.parse({ stopId: '1_75403' });
    await getScheduleForStop.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.routeCount).toBe(0);
    expect(enrichment.notice).toMatch(/no scheduled departures/i);
  });

  it('echoes date in enrichment when provided', async () => {
    const ctx = createToolContext(getScheduleForStop);
    mockService.getScheduleForStop.mockResolvedValue(STOP_SCHEDULE);
    const input = getScheduleForStop.input.parse({ stopId: '1_75403', date: '2026-05-23' });
    await getScheduleForStop.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.date).toBe('2026-05-23');
  });

  it('passes date when provided', async () => {
    const ctx = createToolContext(getScheduleForStop);
    mockService.getScheduleForStop.mockResolvedValue(STOP_SCHEDULE);
    const input = getScheduleForStop.input.parse({ stopId: '1_75403', date: '2026-05-23' });
    await getScheduleForStop.handler(input, ctx);
    expect(mockService.getScheduleForStop).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-05-23' }),
      ctx,
    );
  });

  it('omits empty date from service call', async () => {
    const ctx = createToolContext(getScheduleForStop);
    mockService.getScheduleForStop.mockResolvedValue(STOP_SCHEDULE);
    const input = getScheduleForStop.input.parse({ stopId: '1_75403', date: '' });
    await getScheduleForStop.handler(input, ctx);
    expect(mockService.getScheduleForStop).toHaveBeenCalledWith(
      expect.not.objectContaining({ date: expect.anything() }),
      ctx,
    );
  });

  it('propagates service errors', async () => {
    const ctx = createToolContext(getScheduleForStop);
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
  it('wires exact trip selection and renders counts through the production contract', async () => {
    const selection = { tripId: 'trip_abc', total: 8, returned: 1 };
    mockService.getScheduleForRoute.mockResolvedValue({ ...ROUTE_SCHEDULE, selection });
    const result = await runToolContract(getScheduleForRoute, {
      routeId: '1_100259',
      tripId: 'trip_abc',
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ selection });
    expect(mockService.getScheduleForRoute).toHaveBeenCalledWith(
      { routeId: '1_100259', tripId: 'trip_abc' },
      expect.anything(),
    );
    const text = result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    for (const value of ['tripId: trip_abc', 'total: 8', 'returned: 1'])
      expect(text).toContain(value);
  });

  it.each([
    { tripId: 't', departureFromSec: 0 },
    { tripId: 't', departureBeforeSec: 1 },
    { departureFromSec: 2, departureBeforeSec: 1 },
    { departureFromSec: 0, departureBeforeSec: 0 },
    { departureFromSec: -1 },
    { departureBeforeSec: 1.5 },
  ])('rejects invalid route selector %j before I/O', async (selectors) => {
    const result = await runToolContract(getScheduleForRoute, { routeId: 'r', ...selectors });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code: -32602 } });
    expect(result.content.length).toBeGreaterThan(0);
    expect(mockService.getScheduleForRoute).not.toHaveBeenCalled();
  });
  it('returns route schedule from service', async () => {
    const ctx = createToolContext(getScheduleForRoute);
    mockService.getScheduleForRoute.mockResolvedValue(ROUTE_SCHEDULE);
    const input = getScheduleForRoute.input.parse({ routeId: '1_100259' });
    const result = await getScheduleForRoute.handler(input, ctx);
    expect(result.routeId).toBe('1_100259');
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0]!.stops).toHaveLength(2);
  });

  it('enriches with queriedRoute and tripCount', async () => {
    const ctx = createToolContext(getScheduleForRoute);
    mockService.getScheduleForRoute.mockResolvedValue(ROUTE_SCHEDULE);
    const input = getScheduleForRoute.input.parse({ routeId: '1_100259' });
    await getScheduleForRoute.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.queriedRoute).toBe('1_100259');
    expect(enrichment.tripCount).toBe(1);
    expect(enrichment.notice).toBeUndefined();
  });

  it('enriches with notice when no trips found', async () => {
    const ctx = createToolContext(getScheduleForRoute);
    mockService.getScheduleForRoute.mockResolvedValue({ ...ROUTE_SCHEDULE, trips: [] });
    const input = getScheduleForRoute.input.parse({ routeId: '1_100259' });
    await getScheduleForRoute.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.tripCount).toBe(0);
    expect(enrichment.notice).toMatch(/no trips/i);
  });

  it('echoes date in enrichment when provided', async () => {
    const ctx = createToolContext(getScheduleForRoute);
    mockService.getScheduleForRoute.mockResolvedValue(ROUTE_SCHEDULE);
    const input = getScheduleForRoute.input.parse({ routeId: '1_100259', date: '2026-05-23' });
    await getScheduleForRoute.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.date).toBe('2026-05-23');
  });

  it('passes date when provided', async () => {
    const ctx = createToolContext(getScheduleForRoute);
    mockService.getScheduleForRoute.mockResolvedValue(ROUTE_SCHEDULE);
    const input = getScheduleForRoute.input.parse({ routeId: '1_100259', date: '2026-05-23' });
    await getScheduleForRoute.handler(input, ctx);
    expect(mockService.getScheduleForRoute).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-05-23' }),
      ctx,
    );
  });

  it('propagates service errors', async () => {
    const ctx = createToolContext(getScheduleForRoute);
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
