/**
 * @fileoverview Tests for get-vehicles tool.
 * @module tests/tools/vehicles.tool.test
 */

import { createMockContext, getEnrichment } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getVehicles } from '@/mcp-server/tools/definitions/get-vehicles.tool.js';
import { expectContentParity } from './format-parity.helper.js';

vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = { getVehicles: vi.fn() };

beforeEach(() => {
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
  vi.clearAllMocks();
});

const NOW_MS = 1748000000000;

const VEHICLE_FIXTURE = {
  vehicleId: 'bus_1234',
  tripId: 'trip_abc',
  routeId: '1_100259',
  routeShortName: '44',
  tripHeadsign: 'Downtown Seattle',
  position: { lat: 47.6591234, lon: -122.3151234 },
  lastUpdateTime: NOW_MS,
  phase: 'in_progress',
  scheduleDeviation: 60,
  orientation: 270,
  nextStop: '1_75403',
  predicted: true,
};

describe('getVehicles', () => {
  it('returns active vehicles with limitExceeded flag', async () => {
    const ctx = createMockContext();
    mockService.getVehicles.mockResolvedValue({
      vehicles: [VEHICLE_FIXTURE],
      limitExceeded: false,
    });
    const input = getVehicles.input.parse({ agencyId: '1' });
    const result = await getVehicles.handler(input, ctx);
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0]!.vehicleId).toBe('bus_1234');
    expect(result.limitExceeded).toBe(false);
  });

  it('enriches with agencyId and count', async () => {
    const ctx = createMockContext();
    mockService.getVehicles.mockResolvedValue({
      vehicles: [VEHICLE_FIXTURE],
      limitExceeded: false,
    });
    const input = getVehicles.input.parse({ agencyId: '1' });
    await getVehicles.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.agencyId).toBe('1');
    expect(enrichment.count).toBe(1);
    expect(enrichment.notice).toBeUndefined();
  });

  it('enriches with routeId when filter provided', async () => {
    const ctx = createMockContext();
    mockService.getVehicles.mockResolvedValue({
      vehicles: [VEHICLE_FIXTURE],
      limitExceeded: false,
    });
    const input = getVehicles.input.parse({ agencyId: '1', routeId: '1_100259' });
    await getVehicles.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.routeId).toBe('1_100259');
  });

  it('enriches with notice when no vehicles found', async () => {
    const ctx = createMockContext();
    mockService.getVehicles.mockResolvedValue({ vehicles: [], limitExceeded: false });
    const input = getVehicles.input.parse({ agencyId: '1' });
    await getVehicles.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.count).toBe(0);
    expect(enrichment.notice).toMatch(/no active vehicles/i);
  });

  it('enriches with truncation notice when limitExceeded', async () => {
    const ctx = createMockContext();
    mockService.getVehicles.mockResolvedValue({ vehicles: [VEHICLE_FIXTURE], limitExceeded: true });
    const input = getVehicles.input.parse({ agencyId: '1' });
    await getVehicles.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.notice).toMatch(/truncated/i);
  });

  it('passes optional routeId to service', async () => {
    const ctx = createMockContext();
    mockService.getVehicles.mockResolvedValue({ vehicles: [], limitExceeded: false });
    const input = getVehicles.input.parse({ agencyId: '1', routeId: '1_100259' });
    await getVehicles.handler(input, ctx);
    expect(mockService.getVehicles).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: '1_100259' }),
      ctx,
    );
  });

  it('omits empty routeId from service call', async () => {
    const ctx = createMockContext();
    mockService.getVehicles.mockResolvedValue({ vehicles: [], limitExceeded: false });
    const input = getVehicles.input.parse({ agencyId: '1', routeId: '' });
    await getVehicles.handler(input, ctx);
    expect(mockService.getVehicles).toHaveBeenCalledWith(
      expect.not.objectContaining({ routeId: expect.anything() }),
      ctx,
    );
  });

  it('propagates service errors', async () => {
    const ctx = createMockContext();
    mockService.getVehicles.mockRejectedValue(new Error('agency not found'));
    const input = getVehicles.input.parse({ agencyId: 'bad' });
    await expect(getVehicles.handler(input, ctx)).rejects.toThrow();
  });

  it('formats vehicles with ID, route, and exact position', () => {
    const output = { vehicles: [VEHICLE_FIXTURE], limitExceeded: false };
    const blocks = getVehicles.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('bus_1234');
    expect(text).toContain('44');
    expect(text).toContain('trip_abc');
    expect(text).toContain('1_100259');
    // position must appear at exact precision, not toFixed(5)-rounded
    expect(text).toContain('47.6591234');
    expect(text).toContain('-122.3151234');
    // last update shown with human-readable time AND raw ms for format parity
    expect(text).toMatch(/last update/i);
    expect(text).toContain(NOW_MS.toString());
    expectContentParity(blocks, output);
  });

  it('formats late deviation', () => {
    const text = (
      getVehicles.format!({ vehicles: [VEHICLE_FIXTURE], limitExceeded: false })[0] as {
        text: string;
      }
    ).text;
    expect(text).toContain('late');
  });

  it('formats on-time deviation', () => {
    const onTime = { ...VEHICLE_FIXTURE, scheduleDeviation: 0 };
    const text = (
      getVehicles.format!({ vehicles: [onTime], limitExceeded: false })[0] as { text: string }
    ).text;
    expect(text).toContain('on time');
  });

  it('formats empty vehicle list', () => {
    const text = (
      getVehicles.format!({ vehicles: [], limitExceeded: false })[0] as { text: string }
    ).text;
    expect(text).toMatch(/no active vehicles/i);
  });

  it('shows truncation notice in format when limitExceeded', () => {
    const text = (
      getVehicles.format!({ vehicles: [VEHICLE_FIXTURE], limitExceeded: true })[0] as {
        text: string;
      }
    ).text;
    expect(text).toMatch(/truncated/i);
  });

  it('renders null vehicle fields as explicit "none", never omitted or "null"', () => {
    const sparse = {
      ...VEHICLE_FIXTURE,
      routeId: null,
      tripId: null,
      routeShortName: null,
      tripHeadsign: null,
      scheduleDeviation: null,
      orientation: null,
      nextStop: null,
    };
    const text = (
      getVehicles.format!({ vehicles: [sparse], limitExceeded: false })[0] as { text: string }
    ).text;
    expect(text).toContain('bus_1234');
    // Every absent field is explicit — no dropped line, no "null"/"undefined".
    expect(text).toContain('**Route:** none');
    expect(text).toContain('**Route ID:** none');
    expect(text).toContain('**Trip ID:** none');
    expect(text).toContain('**Schedule deviation:** none');
    expect(text).toContain('**Heading:** none');
    expect(text).toContain('**Next stop:** none');
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
  });
});
