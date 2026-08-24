/**
 * @fileoverview Tests for get-arrivals tool.
 * @module tests/tools/arrivals.tool.test
 */

import { getEnrichment } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArrivals } from '@/mcp-server/tools/definitions/get-arrivals.tool.js';
import { expectContentParity } from './format-parity.helper.js';
import { createToolContext } from './tool-context.helper.js';

vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = { getArrivals: vi.fn() };

beforeEach(() => {
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
  vi.clearAllMocks();
});

const NOW_MS = 1748000000000;

const ARRIVALS_RESULT = {
  stopId: '1_75403',
  stopName: 'University Way NE & NE 42nd St',
  currentTime: NOW_MS,
  arrivals: [
    {
      routeShortName: '44',
      tripHeadsign: 'Downtown Seattle',
      predicted: true,
      predictedArrivalTime: NOW_MS + 180_000,
      scheduledArrivalTime: NOW_MS + 120_000,
      scheduleDeviation: 60,
      vehicleId: 'bus_1234',
      vehiclePosition: { lat: 47.6591234, lon: -122.3151234 },
      stopsAway: 2,
      tripId: 'trip_abc',
      routeId: '1_100259',
      situationIds: [],
    },
  ],
  situations: [],
};

describe('getArrivals', () => {
  it('returns arrivals result from service', async () => {
    const ctx = createToolContext(getArrivals);
    mockService.getArrivals.mockResolvedValue(ARRIVALS_RESULT);
    const input = getArrivals.input.parse({ stopId: '1_75403' });
    const result = await getArrivals.handler(input, ctx);
    expect(result.stopId).toBe('1_75403');
    expect(result.arrivals).toHaveLength(1);
    expect(result.arrivals[0]!.routeShortName).toBe('44');
  });

  it('enriches with queriedStop, count, and window', async () => {
    const ctx = createToolContext(getArrivals);
    mockService.getArrivals.mockResolvedValue(ARRIVALS_RESULT);
    const input = getArrivals.input.parse({ stopId: '1_75403' });
    await getArrivals.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.queriedStop).toBe('1_75403');
    expect(enrichment.count).toBe(1);
    expect(enrichment.windowMinutes).toMatchObject({ before: 5, after: 35 });
    expect(enrichment.notice).toBeUndefined();
  });

  it('enriches with notice when no arrivals', async () => {
    const ctx = createToolContext(getArrivals);
    mockService.getArrivals.mockResolvedValue({ ...ARRIVALS_RESULT, arrivals: [] });
    const input = getArrivals.input.parse({ stopId: '1_75403' });
    await getArrivals.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.count).toBe(0);
    expect(enrichment.notice).toMatch(/no arrivals/i);
  });

  it('passes minutesBefore/minutesAfter to service', async () => {
    const ctx = createToolContext(getArrivals);
    mockService.getArrivals.mockResolvedValue({ ...ARRIVALS_RESULT, arrivals: [] });
    const input = getArrivals.input.parse({
      stopId: '1_75403',
      minutesBefore: 2,
      minutesAfter: 60,
    });
    await getArrivals.handler(input, ctx);
    expect(mockService.getArrivals).toHaveBeenCalledWith(
      expect.objectContaining({ minutesBefore: 2, minutesAfter: 60 }),
      ctx,
    );
  });

  it('propagates service errors', async () => {
    const ctx = createToolContext(getArrivals);
    mockService.getArrivals.mockRejectedValue(new Error('stop not found'));
    const input = getArrivals.input.parse({ stopId: 'bad_id' });
    await expect(getArrivals.handler(input, ctx)).rejects.toThrow();
  });

  it('formats arrivals with trip ID, route ID, exact position, and parity', () => {
    const blocks = getArrivals.format!(ARRIVALS_RESULT);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('1_75403');
    expect(text).toContain('44');
    expect(text).toContain('trip_abc');
    expect(text).toContain('1_100259');
    // schedule deviation in seconds must appear
    expect(text).toContain('60');
    // vehicle position at exact precision, not toFixed(5)-rounded
    expect(text).toContain('47.6591234');
    expect(text).toContain('-122.3151234');
    expectContentParity(blocks, ARRIVALS_RESULT);
  });

  it('formats empty arrivals', () => {
    const empty = { ...ARRIVALS_RESULT, arrivals: [] };
    const text = (getArrivals.format!(empty)[0] as { text: string }).text;
    expect(text).toContain('1_75403');
    expect(text).toMatch(/no arrivals/i);
  });

  it('includes service alert details when present', () => {
    const withAlert = {
      ...ARRIVALS_RESULT,
      arrivals: [{ ...ARRIVALS_RESULT.arrivals[0]!, situationIds: ['sit_1'] }],
      situations: [{ id: 'sit_1', summary: 'Delay on Route 44', description: 'Bridge closure.' }],
    };
    const text = (getArrivals.format!(withAlert)[0] as { text: string }).text;
    expect(text).toContain('Delay on Route 44');
    expect(text).toContain('sit_1');
  });

  it('formats predicted=false arrival as scheduled', () => {
    const scheduledOnly = {
      ...ARRIVALS_RESULT,
      arrivals: [
        {
          ...ARRIVALS_RESULT.arrivals[0]!,
          predicted: false,
          predictedArrivalTime: null,
          vehicleId: null,
          vehiclePosition: null,
        },
      ],
    };
    const text = (getArrivals.format!(scheduledOnly)[0] as { text: string }).text;
    expect(text).toContain('scheduled');
    // Absent vehicle data is explicit, so a content-only client sees "no vehicle".
    expect(text).toContain('**Vehicle:** none');
    expect(text).toContain('**Vehicle position:** none');
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
  });
});
