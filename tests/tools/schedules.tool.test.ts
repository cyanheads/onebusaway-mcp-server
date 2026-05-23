/**
 * @fileoverview Tests for schedule tools: get-schedule-for-stop, get-schedule-for-route.
 * @module tests/tools/schedules.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
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
            { scheduledDepartureTime: NOW_MS + 120_000, tripId: 'trip_abc' },
            { scheduledDepartureTime: NOW_MS + 480_000, tripId: 'trip_def' },
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
          arrivalTime: NOW_MS,
          departureTime: NOW_MS + 60_000,
        },
        {
          stopId: '1_75403',
          stopName: 'University Way',
          arrivalTime: NOW_MS + 120_000,
          departureTime: NOW_MS + 180_000,
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
    expect(text).toContain(NOW_MS.toString());
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
    expect(text).toContain(NOW_MS.toString());
  });

  it('formats empty trips list', () => {
    const empty = { ...ROUTE_SCHEDULE, trips: [] };
    const text = (getScheduleForRoute.format!(empty)[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('0');
  });
});
