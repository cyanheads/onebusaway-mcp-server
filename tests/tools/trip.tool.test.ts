/**
 * @fileoverview Tests for get-trip tool.
 * @module tests/tools/trip.tool.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrip } from '@/mcp-server/tools/definitions/get-trip.tool.js';
import { expectContentParity } from './format-parity.helper.js';
import { createToolContext } from './tool-context.helper.js';

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

/** Seconds from midnight for stop times — GTFS schedule format. */
const SCHED_ARR_1 = 8 * 3600; // 08:00
const SCHED_DEP_1 = 8 * 3600 + 60; // 08:01
const SCHED_ARR_2 = 8 * 3600 + 2 * 60; // 08:02
const SCHED_DEP_2 = 8 * 3600 + 3 * 60; // 08:03

const TRIP_RESULT = {
  tripId: 'trip_abc',
  routeShortName: '44',
  tripHeadsign: 'Downtown Seattle',
  blockId: '1_block_42',
  status: {
    phase: 'in_progress',
    predicted: true,
    // High-precision coordinates so a toFixed(5) regression would visibly round them.
    position: { lat: 47.6598765, lon: -122.3151234 },
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
      arrivalTime: SCHED_ARR_1,
      departureTime: SCHED_DEP_1,
      // Fractional so a Math.round regression would be caught (would render 501).
      distanceAlongTripMeters: 500.7,
    },
    {
      stopId: '1_75403',
      stopName: 'University Way',
      arrivalTime: SCHED_ARR_2,
      departureTime: SCHED_DEP_2,
      distanceAlongTripMeters: 1200.4,
    },
  ],
  situations: [],
};

describe('getTrip', () => {
  it('returns trip status from service', async () => {
    const ctx = createToolContext(getTrip);
    mockService.getTrip.mockResolvedValue(TRIP_RESULT);
    const input = getTrip.input.parse({ tripId: 'trip_abc' });
    const result = await getTrip.handler(input, ctx);
    expect(result.tripId).toBe('trip_abc');
    expect(result.routeShortName).toBe('44');
    expect(result.status.phase).toBe('in_progress');
  });

  it('passes optional serviceDate when provided', async () => {
    const ctx = createToolContext(getTrip);
    mockService.getTrip.mockResolvedValue(TRIP_RESULT);
    const input = getTrip.input.parse({ tripId: 'trip_abc', serviceDateMs: NOW_MS });
    await getTrip.handler(input, ctx);
    expect(mockService.getTrip).toHaveBeenCalledWith(
      expect.objectContaining({ serviceDate: NOW_MS }),
      ctx,
    );
  });

  it('propagates service errors', async () => {
    const ctx = createToolContext(getTrip);
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

  it('renders position and stop distances at exact precision, not rounded', () => {
    const text = (getTrip.format!(TRIP_RESULT)[0] as { text: string }).text;
    // toFixed(5) would round the coordinates; Math.round would turn 500.7 into 501.
    expect(text).toContain('47.6598765');
    expect(text).toContain('-122.3151234');
    expect(text).toContain('500.7');
    expect(text).toContain('1200.4');
  });

  it('has full content[]/structuredContent value parity', () => {
    expectContentParity(getTrip.format!(TRIP_RESULT), TRIP_RESULT);
  });
});
