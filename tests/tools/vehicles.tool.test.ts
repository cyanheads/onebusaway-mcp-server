/**
 * @fileoverview Tests for get-vehicles tool.
 * @module tests/tools/vehicles.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getVehicles } from '@/mcp-server/tools/definitions/get-vehicles.tool.js';

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
  position: { lat: 47.659, lon: -122.315 },
  lastUpdateTime: NOW_MS,
  phase: 'in_progress',
  scheduleDeviation: 60,
  orientation: 270,
  nextStop: '1_75403',
  predicted: true,
};

describe('getVehicles', () => {
  it('returns active vehicles', async () => {
    const ctx = createMockContext();
    mockService.getVehicles.mockResolvedValue([VEHICLE_FIXTURE]);
    const input = getVehicles.input.parse({ agencyId: '1' });
    const result = await getVehicles.handler(input, ctx);
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0]!.vehicleId).toBe('bus_1234');
  });

  it('passes optional routeId to service', async () => {
    const ctx = createMockContext();
    mockService.getVehicles.mockResolvedValue([]);
    const input = getVehicles.input.parse({ agencyId: '1', routeId: '1_100259' });
    await getVehicles.handler(input, ctx);
    expect(mockService.getVehicles).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: '1_100259' }),
      ctx,
    );
  });

  it('omits empty routeId from service call', async () => {
    const ctx = createMockContext();
    mockService.getVehicles.mockResolvedValue([]);
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

  it('formats vehicles with ID, route, and position', () => {
    const blocks = getVehicles.format!({ vehicles: [VEHICLE_FIXTURE] });
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('bus_1234');
    expect(text).toContain('44');
    expect(text).toContain('trip_abc');
    expect(text).toContain('1_100259');
    // position must appear
    expect(text).toContain('47.659');
    expect(text).toContain(NOW_MS.toString());
  });

  it('formats late deviation', () => {
    const text = (getVehicles.format!({ vehicles: [VEHICLE_FIXTURE] })[0] as { text: string }).text;
    expect(text).toContain('late');
  });

  it('formats on-time deviation', () => {
    const onTime = { ...VEHICLE_FIXTURE, scheduleDeviation: 0 };
    const text = (getVehicles.format!({ vehicles: [onTime] })[0] as { text: string }).text;
    expect(text).toContain('on time');
  });

  it('formats empty vehicle list', () => {
    const text = (getVehicles.format!({ vehicles: [] })[0] as { text: string }).text;
    expect(text).toMatch(/no active vehicles/i);
  });

  it('formats vehicle with null route and trip', () => {
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
    const text = (getVehicles.format!({ vehicles: [sparse] })[0] as { text: string }).text;
    expect(text).toContain('bus_1234');
  });
});
