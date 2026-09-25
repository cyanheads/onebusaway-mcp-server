/**
 * @fileoverview Error contract coverage — data.reason assertions for all tools with declared errors.
 * @module tests/tools/error-contracts.tool.test
 */

import { JsonRpcErrorCode, McpError } from '@cyanheads/mcp-ts-core/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArrivals } from '@/mcp-server/tools/definitions/get-arrivals.tool.js';
import { getScheduleForRoute } from '@/mcp-server/tools/definitions/get-schedule-for-route.tool.js';
import { getScheduleForStop } from '@/mcp-server/tools/definitions/get-schedule-for-stop.tool.js';
import { getStop } from '@/mcp-server/tools/definitions/get-stop.tool.js';
import { getStopContext } from '@/mcp-server/tools/definitions/get-stop-context.tool.js';
import { getTrip } from '@/mcp-server/tools/definitions/get-trip.tool.js';
import { getVehicles } from '@/mcp-server/tools/definitions/get-vehicles.tool.js';
import { searchRoutes } from '@/mcp-server/tools/definitions/search-routes.tool.js';
import { createToolContext } from './tool-context.helper.js';

vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = {
  getStop: vi.fn(),
  getArrivals: vi.fn(),
  getStopContext: vi.fn(),
  getTrip: vi.fn(),
  getVehicles: vi.fn(),
  searchRoutes: vi.fn(),
  getScheduleForStop: vi.fn(),
  getScheduleForRoute: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
  vi.clearAllMocks();
});

// ---- getStop error contract ----

describe('getStop error contracts', () => {
  it('data.reason is "stop_not_found" when service throws NotFound', async () => {
    const ctx = createToolContext(getStop);
    mockService.getStop.mockRejectedValue(
      new McpError(-32001, 'stop "1_INVALID" not found.', {
        id: '1_INVALID',
        reason: 'stop_not_found',
      }),
    );
    const input = getStop.input.parse({ stopId: '1_INVALID' });
    await expect(getStop.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'stop_not_found' },
    });
  });

  it('propagates generic service error without contract wrapping', async () => {
    const ctx = createToolContext(getStop);
    mockService.getStop.mockRejectedValue(new Error('Network timeout'));
    const input = getStop.input.parse({ stopId: '1_75403' });
    await expect(getStop.handler(input, ctx)).rejects.toThrow('Network timeout');
  });
});

// ---- getArrivals error contracts ----

describe('getArrivals error contracts', () => {
  it('data.reason is "stop_not_found" on NotFound from service', async () => {
    const ctx = createToolContext(getArrivals);
    mockService.getArrivals.mockRejectedValue(
      new McpError(-32001, 'stop "bad_id" not found.', {
        id: 'bad_id',
        reason: 'stop_not_found',
      }),
    );
    const input = getArrivals.input.parse({ stopId: 'bad_id' });
    await expect(getArrivals.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'stop_not_found' },
    });
  });

  it('data.reason is "rate_limited" on 429 response', async () => {
    const ctx = createToolContext(getArrivals);
    mockService.getArrivals.mockRejectedValue(
      new McpError(JsonRpcErrorCode.RateLimited, 'API rate limited.', {
        reason: 'rate_limited',
        retryAfter: 60,
      }),
    );
    const input = getArrivals.input.parse({ stopId: '1_75403' });
    await expect(getArrivals.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'rate_limited' },
    });
  });

  it('propagates generic service errors', async () => {
    const ctx = createToolContext(getArrivals);
    mockService.getArrivals.mockRejectedValue(new Error('Service unavailable'));
    const input = getArrivals.input.parse({ stopId: '1_75403' });
    await expect(getArrivals.handler(input, ctx)).rejects.toThrow();
  });

  it('declares rate_limited as retryable — the pacer queues against the shared budget and reports retryAfter, so a retry is paced rather than blind', () => {
    const entry = getArrivals.errors?.find((e) => e.reason === 'rate_limited');
    expect(entry?.retryable).toBe(true);
    expect(entry?.recovery).toContain('retryAfter');
  });
});

// ---- getStopContext error contracts ----

describe('getStopContext error contracts', () => {
  it('declares the same failure modes as getArrivals', () => {
    const summary = (errors: readonly { reason: string; code: number; retryable?: boolean }[]) =>
      errors.map(({ reason, code, retryable }) => ({ reason, code, retryable }));
    expect(summary(getStopContext.errors ?? [])).toEqual(summary(getArrivals.errors ?? []));
  });

  it.each([
    ['stop_not_found', JsonRpcErrorCode.NotFound],
    ['rate_limited', JsonRpcErrorCode.RateLimited],
  ])('surfaces a service-thrown %s unchanged', async (reason, code) => {
    const ctx = createToolContext(getStopContext);
    mockService.getStopContext.mockRejectedValue(new McpError(code, 'failed', { reason }));
    const input = getStopContext.input.parse({ stopId: '1_570' });
    await expect(getStopContext.handler(input, ctx)).rejects.toMatchObject({
      code,
      data: { reason },
    });
  });
});

// ---- getTrip error contracts ----

describe('getTrip error contracts', () => {
  it('data.reason is "trip_not_found" on NotFound', async () => {
    const ctx = createToolContext(getTrip);
    mockService.getTrip.mockRejectedValue(
      new McpError(-32001, 'trip "bad_trip" not found.', {
        id: 'bad_trip',
        reason: 'trip_not_found',
      }),
    );
    const input = getTrip.input.parse({ tripId: 'bad_trip' });
    await expect(getTrip.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'trip_not_found' },
    });
  });

  it('omits serviceDate when serviceDateMs not provided', async () => {
    const ctx = createToolContext(getTrip);
    const tripResult = {
      tripId: 'trip_abc',
      routeShortName: '44',
      tripHeadsign: 'Downtown Seattle',
      status: {
        phase: 'in_progress',
        predicted: true,
        position: null,
        scheduleDeviation: 0,
        nextStop: null,
        closestStop: null,
        vehicleId: null,
        lastUpdateTime: 1748000000000,
      },
      schedule: [],
      situations: [],
    };
    mockService.getTrip.mockResolvedValue(tripResult);
    const input = getTrip.input.parse({ tripId: 'trip_abc' });
    await getTrip.handler(input, ctx);
    expect(mockService.getTrip).toHaveBeenCalledWith(
      expect.not.objectContaining({ serviceDate: expect.anything() }),
      ctx,
    );
  });

  it('passes serviceDate when serviceDateMs provided', async () => {
    const ctx = createToolContext(getTrip);
    const tripResult = {
      tripId: 'trip_abc',
      routeShortName: '44',
      tripHeadsign: 'Downtown Seattle',
      status: {
        phase: 'layover_before',
        predicted: false,
        position: null,
        scheduleDeviation: 0,
        nextStop: null,
        closestStop: null,
        vehicleId: null,
        lastUpdateTime: 1748000000000,
      },
      schedule: null,
      situations: [],
    };
    mockService.getTrip.mockResolvedValue(tripResult);
    const input = getTrip.input.parse({ tripId: 'trip_abc', serviceDateMs: 1748000000000 });
    await getTrip.handler(input, ctx);
    expect(mockService.getTrip).toHaveBeenCalledWith(
      expect.objectContaining({ serviceDate: 1748000000000 }),
      ctx,
    );
  });

  it('passes includeSchedule=false to service', async () => {
    const ctx = createToolContext(getTrip);
    const tripResult = {
      tripId: 'trip_abc',
      routeShortName: '44',
      tripHeadsign: 'Downtown',
      status: {
        phase: 'in_progress',
        predicted: true,
        position: null,
        scheduleDeviation: 0,
        nextStop: null,
        closestStop: null,
        vehicleId: null,
        lastUpdateTime: 1748000000000,
      },
      schedule: null,
      situations: [],
    };
    mockService.getTrip.mockResolvedValue(tripResult);
    const input = getTrip.input.parse({ tripId: 'trip_abc', includeSchedule: false });
    await getTrip.handler(input, ctx);
    expect(mockService.getTrip).toHaveBeenCalledWith(
      expect.objectContaining({ includeSchedule: false }),
      ctx,
    );
  });
});

// ---- getVehicles error contracts ----

describe('getVehicles error contracts', () => {
  it('data.reason is "agency_not_found" when service throws NotFound', async () => {
    const ctx = createToolContext(getVehicles);
    mockService.getVehicles.mockRejectedValue(
      new McpError(-32001, 'agency "bad_agency" not found.', {
        id: 'bad_agency',
        reason: 'agency_not_found',
      }),
    );
    const input = getVehicles.input.parse({ agencyId: 'bad_agency' });
    await expect(getVehicles.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'agency_not_found' },
    });
  });
});

// ---- searchRoutes error contracts ----

describe('searchRoutes error contracts', () => {
  it('data.reason is "endpoint_unavailable" on 404 response', async () => {
    const ctx = createToolContext(searchRoutes);
    mockService.searchRoutes.mockRejectedValue(
      new McpError(-32001, 'endpoint not found.', {
        reason: 'endpoint_unavailable',
      }),
    );
    const input = searchRoutes.input.parse({ query: '44' });
    await expect(searchRoutes.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'endpoint_unavailable' },
    });
  });
});

// ---- getScheduleForStop error contracts ----

describe('getScheduleForStop error contracts', () => {
  it('data.reason is "stop_not_found" on NotFound', async () => {
    const ctx = createToolContext(getScheduleForStop);
    mockService.getScheduleForStop.mockRejectedValue(
      new McpError(-32001, 'stop "1_INVALID" not found.', {
        id: '1_INVALID',
        reason: 'stop_not_found',
      }),
    );
    const input = getScheduleForStop.input.parse({ stopId: '1_INVALID' });
    await expect(getScheduleForStop.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'stop_not_found' },
    });
  });
});

// ---- getScheduleForRoute error contracts ----

describe('getScheduleForRoute error contracts', () => {
  it('data.reason is "route_not_found" on NotFound', async () => {
    const ctx = createToolContext(getScheduleForRoute);
    mockService.getScheduleForRoute.mockRejectedValue(
      new McpError(-32001, 'route "1_INVALID" not found.', {
        id: '1_INVALID',
        reason: 'route_not_found',
      }),
    );
    const input = getScheduleForRoute.input.parse({ routeId: '1_INVALID' });
    await expect(getScheduleForRoute.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'route_not_found' },
    });
  });
});
