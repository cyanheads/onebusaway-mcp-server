/**
 * @fileoverview Tests for get-trip tool.
 * @module tests/tools/trip.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrip } from '@/mcp-server/tools/definitions/get-trip.tool.js';

vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = { getTrip: vi.fn() };

beforeEach(() => {
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
  vi.clearAllMocks();
});

const NOW_MS = 1748000000000;

const TRIP_RESULT = {
  tripId: 'trip_abc',
  routeShortName: '44',
  tripHeadsign: 'Downtown Seattle',
  status: {
    phase: 'in_progress',
    predicted: true,
    position: { lat: 47.659, lon: -122.315 },
    scheduleDeviation: 60,
    nextStop: '1_75403',
    closestStop: '1_75400',
    vehicleId: 'bus_1234',
    lastUpdateTime: NOW_MS - 10_000,
  },
  schedule: [
    {
      stopId: '1_75400',
      stopName: 'U-District',
      arrivalTime: NOW_MS,
      departureTime: NOW_MS + 60_000,
      distanceAlongTripMeters: 500,
    },
    {
      stopId: '1_75403',
      stopName: 'University Way',
      arrivalTime: NOW_MS + 120_000,
      departureTime: NOW_MS + 180_000,
      distanceAlongTripMeters: 1200,
    },
  ],
  situations: [],
};

describe('getTrip', () => {
  it('returns trip status from service', async () => {
    const ctx = createMockContext();
    mockService.getTrip.mockResolvedValue(TRIP_RESULT);
    const input = getTrip.input.parse({ tripId: 'trip_abc' });
    const result = await getTrip.handler(input, ctx);
    expect(result.tripId).toBe('trip_abc');
    expect(result.routeShortName).toBe('44');
    expect(result.status.phase).toBe('in_progress');
  });

  it('passes optional serviceDate when provided', async () => {
    const ctx = createMockContext();
    mockService.getTrip.mockResolvedValue(TRIP_RESULT);
    const input = getTrip.input.parse({ tripId: 'trip_abc', serviceDateMs: NOW_MS });
    await getTrip.handler(input, ctx);
    expect(mockService.getTrip).toHaveBeenCalledWith(
      expect.objectContaining({ serviceDate: NOW_MS }),
      ctx,
    );
  });

  it('propagates service errors', async () => {
    const ctx = createMockContext();
    mockService.getTrip.mockRejectedValue(new Error('trip not found'));
    const input = getTrip.input.parse({ tripId: 'bad_trip' });
    await expect(getTrip.handler(input, ctx)).rejects.toThrow();
  });

  it('formats trip with tripId, route, and schedule deviation', () => {
    const blocks = getTrip.format!(TRIP_RESULT);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('trip_abc');
    expect(text).toContain('44');
    expect(text).toContain('in_progress');
    expect(text).toContain('60');
  });

  it('includes stop sequence in format output', () => {
    const text = (getTrip.format!(TRIP_RESULT)[0] as { text: string }).text;
    expect(text).toContain('1_75403');
    expect(text).toContain('University Way');
  });

  it('formats trip with null schedule (includeSchedule=false)', () => {
    const noSchedule = { ...TRIP_RESULT, schedule: null };
    const text = (getTrip.format!(noSchedule)[0] as { text: string }).text;
    expect(text).toContain('trip_abc');
    // should not crash without schedule block
    expect(text).not.toContain('Stop Sequence');
  });

  it('formats on-time deviation as "on time"', () => {
    const onTime = { ...TRIP_RESULT, status: { ...TRIP_RESULT.status, scheduleDeviation: 0 } };
    const text = (getTrip.format!(onTime)[0] as { text: string }).text;
    expect(text).toContain('on time');
  });

  it('formats early deviation', () => {
    const early = { ...TRIP_RESULT, status: { ...TRIP_RESULT.status, scheduleDeviation: -120 } };
    const text = (getTrip.format!(early)[0] as { text: string }).text;
    expect(text).toContain('early');
  });
});
