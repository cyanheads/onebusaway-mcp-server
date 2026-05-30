/**
 * @fileoverview Edge case tests — empty result sets, sparse payloads, unicode, format-only logic.
 * @module tests/tools/edge-cases.tool.test
 */

import { createMockContext, getEnrichment } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findRoutes } from '@/mcp-server/tools/definitions/find-routes.tool.js';
import { findStops } from '@/mcp-server/tools/definitions/find-stops.tool.js';
import { getAlert } from '@/mcp-server/tools/definitions/get-alert.tool.js';
import { getArrivals } from '@/mcp-server/tools/definitions/get-arrivals.tool.js';
import { getBlock } from '@/mcp-server/tools/definitions/get-block.tool.js';
import { getRoute } from '@/mcp-server/tools/definitions/get-route.tool.js';
import { getScheduleForRoute } from '@/mcp-server/tools/definitions/get-schedule-for-route.tool.js';
import { getScheduleForStop } from '@/mcp-server/tools/definitions/get-schedule-for-stop.tool.js';
import { getStop } from '@/mcp-server/tools/definitions/get-stop.tool.js';
import { getTrip } from '@/mcp-server/tools/definitions/get-trip.tool.js';
import { getVehicles } from '@/mcp-server/tools/definitions/get-vehicles.tool.js';
import { listAgencies } from '@/mcp-server/tools/definitions/list-agencies.tool.js';
import { listRoutesForAgency } from '@/mcp-server/tools/definitions/list-routes-for-agency.tool.js';
import { searchRoutes } from '@/mcp-server/tools/definitions/search-routes.tool.js';
import { searchStops } from '@/mcp-server/tools/definitions/search-stops.tool.js';

vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = {
  findStops: vi.fn(),
  searchStops: vi.fn(),
  getStop: vi.fn(),
  findRoutes: vi.fn(),
  searchRoutes: vi.fn(),
  getRoute: vi.fn(),
  listRoutesForAgency: vi.fn(),
  listAgencies: vi.fn(),
  getArrivals: vi.fn(),
  getTrip: vi.fn(),
  getVehicles: vi.fn(),
  getAlert: vi.fn(),
  getBlock: vi.fn(),
  getScheduleForStop: vi.fn(),
  getScheduleForRoute: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
  vi.clearAllMocks();
});

const NOW_MS = 1748000000000;

// ---- findStops edge cases ----

describe('findStops edge cases', () => {
  it('handles unicode stop name in output correctly', async () => {
    const ctx = createMockContext();
    const unicodeStop = {
      id: '1_75403',
      code: '75403',
      name: 'Café Universitaire & Université Ave NE',
      lat: 47.6586,
      lon: -122.3146,
      direction: 'N',
      routeIds: [],
      wheelchairBoarding: 'UNKNOWN' as const,
    };
    mockService.findStops.mockResolvedValue({ stops: [unicodeStop], limitExceeded: false });
    const input = findStops.input.parse({ lat: 47.6, lon: -122.3 });
    const result = await findStops.handler(input, ctx);
    expect(result.stops[0]!.name).toContain('Café');
    const text = (findStops.format!(result)[0] as { text: string }).text;
    expect(text).toContain('Café');
  });

  it('handles stop with multiple routes in format output', () => {
    const manyRoutes = {
      id: '1_99999',
      code: '99999',
      name: 'Busy Hub Stop',
      lat: 47.6,
      lon: -122.3,
      direction: 'SE',
      routeIds: ['1_100259', '1_100262', '40_100001', '40_100002'],
      wheelchairBoarding: 'ACCESSIBLE' as const,
    };
    const text = (
      findStops.format!({ stops: [manyRoutes], limitExceeded: false })[0] as { text: string }
    ).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('40_100002');
  });

  it('handles zero-radius search gracefully', async () => {
    const ctx = createMockContext();
    mockService.findStops.mockResolvedValue({ stops: [], limitExceeded: false });
    const input = findStops.input.parse({ lat: 47.6, lon: -122.3, radius: 0 });
    const result = await findStops.handler(input, ctx);
    expect(result.stops).toHaveLength(0);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.notice).toMatch(/no stops/i);
  });

  it('formats stop with empty routeIds as "none"', () => {
    const stopNoRoutes = {
      id: '1_99001',
      code: '99001',
      name: 'Isolated Stop',
      lat: 47.6,
      lon: -122.3,
      direction: '',
      routeIds: [],
      wheelchairBoarding: 'NOT_ACCESSIBLE' as const,
    };
    const text = (
      findStops.format!({ stops: [stopNoRoutes], limitExceeded: false })[0] as { text: string }
    ).text;
    expect(text).toContain('none');
  });

  it('formats NOT_ACCESSIBLE wheelchair status', () => {
    const notAccessible = {
      id: '1_99002',
      code: '99002',
      name: 'Inaccessible Stop',
      lat: 47.6,
      lon: -122.3,
      direction: 'S',
      routeIds: ['1_100259'],
      wheelchairBoarding: 'NOT_ACCESSIBLE' as const,
    };
    const text = (
      findStops.format!({ stops: [notAccessible], limitExceeded: false })[0] as { text: string }
    ).text;
    expect(text).toContain('NOT_ACCESSIBLE');
  });
});

// ---- getStop edge cases ----

describe('getStop edge cases', () => {
  it('formats stop coordinates with 6 decimal precision', () => {
    const stop = {
      id: '1_75403',
      code: '75403',
      name: 'Test Stop',
      lat: 47.6586001,
      lon: -122.3146123,
      direction: 'N',
      routeIds: [],
      wheelchairBoarding: 'UNKNOWN' as const,
    };
    const text = (getStop.format!(stop)[0] as { text: string }).text;
    // toFixed(6) should appear in the output
    expect(text).toContain('47.658600'); // 47.6586001.toFixed(6) = '47.658600'
  });

  it('formats stop with empty direction', () => {
    const stop = {
      id: '1_75403',
      code: '75403',
      name: 'Test Stop',
      lat: 47.6586,
      lon: -122.3146,
      direction: '',
      routeIds: [],
      wheelchairBoarding: 'UNKNOWN' as const,
    };
    const text = (getStop.format!(stop)[0] as { text: string }).text;
    expect(text).toContain('1_75403');
    // Should not throw on empty direction
    expect(typeof text).toBe('string');
  });
});

// ---- listAgencies edge cases ----

describe('listAgencies edge cases', () => {
  it('handles agency with null phone — formats without null string', async () => {
    const ctx = createMockContext();
    mockService.listAgencies.mockResolvedValue([
      {
        id: '1',
        name: 'Metro Transit',
        url: 'https://kingcounty.gov/metro',
        phone: null,
        timezone: 'America/Los_Angeles',
        coverageCenter: { lat: 47.6062, lon: -122.3321 },
        coverageSpan: { latSpan: 0.5, lonSpan: 0.8 },
      },
    ]);
    const input = listAgencies.input.parse({});
    const result = await listAgencies.handler(input, ctx);
    const text = (listAgencies.format!(result)[0] as { text: string }).text;
    expect(text).toContain('Metro Transit');
    expect(text).not.toContain('Phone: null');
  });

  it('formats multiple agencies in a single output block', async () => {
    const ctx = createMockContext();
    mockService.listAgencies.mockResolvedValue([
      {
        id: '1',
        name: 'Metro Transit',
        url: 'https://kingcounty.gov/metro',
        phone: '206-553-3000',
        timezone: 'America/Los_Angeles',
        coverageCenter: { lat: 47.6062, lon: -122.3321 },
        coverageSpan: { latSpan: 0.5, lonSpan: 0.8 },
      },
      {
        id: '40',
        name: 'Sound Transit',
        url: 'https://soundtransit.org',
        phone: null,
        timezone: 'America/Los_Angeles',
        coverageCenter: { lat: 47.5, lon: -122.2 },
        coverageSpan: { latSpan: 1.0, lonSpan: 1.5 },
      },
    ]);
    const input = listAgencies.input.parse({});
    const result = await listAgencies.handler(input, ctx);
    expect(result.agencies).toHaveLength(2);
    const text = (listAgencies.format!(result)[0] as { text: string }).text;
    expect(text).toContain('Metro Transit');
    expect(text).toContain('Sound Transit');
    expect(text).toContain('40');
    const enrichment = getEnrichment(ctx);
    expect(enrichment.count).toBe(2);
  });
});

// ---- getArrivals edge cases ----

describe('getArrivals edge cases', () => {
  it('handles stopsAway=0 (at stop) in format output', () => {
    const atStop = {
      stopId: '1_75403',
      stopName: 'Test Stop',
      currentTime: NOW_MS,
      arrivals: [
        {
          routeShortName: '44',
          tripHeadsign: 'Downtown',
          predicted: true,
          predictedArrivalTime: NOW_MS + 60_000,
          scheduledArrivalTime: NOW_MS + 60_000,
          scheduleDeviation: 0,
          vehicleId: 'bus_1',
          vehiclePosition: { lat: 47.659, lon: -122.315 },
          stopsAway: 0,
          tripId: 'trip_abc',
          routeId: '1_100259',
          situationIds: [],
        },
      ],
      situations: [],
    };
    const text = (getArrivals.format!(atStop)[0] as { text: string }).text;
    expect(text).toContain('At stop');
  });

  it('handles stopsAway=-1 (arrived/passed) in format output', () => {
    const arrived = {
      stopId: '1_75403',
      stopName: 'Test Stop',
      currentTime: NOW_MS,
      arrivals: [
        {
          routeShortName: '44',
          tripHeadsign: 'Downtown',
          predicted: true,
          predictedArrivalTime: NOW_MS - 60_000,
          scheduledArrivalTime: NOW_MS - 60_000,
          scheduleDeviation: 0,
          vehicleId: 'bus_1',
          vehiclePosition: null,
          stopsAway: -1,
          tripId: 'trip_abc',
          routeId: '1_100259',
          situationIds: [],
        },
      ],
      situations: [],
    };
    const text = (getArrivals.format!(arrived)[0] as { text: string }).text;
    expect(text).toContain('Arrived');
  });

  it('handles null stopsAway gracefully', () => {
    const nullStops = {
      stopId: '1_75403',
      stopName: 'Test Stop',
      currentTime: NOW_MS,
      arrivals: [
        {
          routeShortName: '44',
          tripHeadsign: 'Downtown',
          predicted: false,
          predictedArrivalTime: null,
          scheduledArrivalTime: NOW_MS + 120_000,
          scheduleDeviation: 0,
          vehicleId: null,
          vehiclePosition: null,
          stopsAway: null,
          tripId: 'trip_abc',
          routeId: '1_100259',
          situationIds: [],
        },
      ],
      situations: [],
    };
    const text = (getArrivals.format!(nullStops)[0] as { text: string }).text;
    expect(text).toContain('trip_abc');
    expect(text).not.toContain('undefined');
  });

  it('formats multiple situation alerts in arrivals output', () => {
    const withAlerts = {
      stopId: '1_75403',
      stopName: 'Test Stop',
      currentTime: NOW_MS,
      arrivals: [
        {
          routeShortName: '44',
          tripHeadsign: 'Downtown',
          predicted: true,
          predictedArrivalTime: NOW_MS + 120_000,
          scheduledArrivalTime: NOW_MS + 120_000,
          scheduleDeviation: 0,
          vehicleId: null,
          vehiclePosition: null,
          stopsAway: 3,
          tripId: 'trip_abc',
          routeId: '1_100259',
          situationIds: ['sit_1', 'sit_2'],
        },
      ],
      situations: [
        { id: 'sit_1', summary: 'Detour on 44', description: null },
        { id: 'sit_2', summary: 'Reduced service', description: 'Due to construction.' },
      ],
    };
    const text = (getArrivals.format!(withAlerts)[0] as { text: string }).text;
    expect(text).toContain('sit_1');
    expect(text).toContain('sit_2');
    expect(text).toContain('Detour on 44');
    expect(text).toContain('Reduced service');
  });

  it('formats early arrival correctly', () => {
    const early = {
      stopId: '1_75403',
      stopName: 'Test Stop',
      currentTime: NOW_MS,
      arrivals: [
        {
          routeShortName: '44',
          tripHeadsign: 'Downtown',
          predicted: true,
          predictedArrivalTime: NOW_MS + 60_000,
          scheduledArrivalTime: NOW_MS + 180_000,
          scheduleDeviation: -120,
          vehicleId: null,
          vehiclePosition: null,
          stopsAway: 1,
          tripId: 'trip_abc',
          routeId: '1_100259',
          situationIds: [],
        },
      ],
      situations: [],
    };
    const text = (getArrivals.format!(early)[0] as { text: string }).text;
    expect(text).toContain('early');
  });
});

// ---- getVehicles edge cases ----

describe('getVehicles edge cases', () => {
  it('formats vehicle with large schedule deviation', () => {
    const veryLate = {
      vehicleId: 'bus_9999',
      tripId: 'trip_xyz',
      routeId: '1_100259',
      routeShortName: '44',
      tripHeadsign: 'Downtown',
      position: { lat: 47.659, lon: -122.315 },
      lastUpdateTime: NOW_MS,
      phase: 'in_progress',
      scheduleDeviation: 3600, // 60 min late
      orientation: 90,
      nextStop: '1_75403',
      predicted: true,
    };
    const text = (getVehicles.format!({ vehicles: [veryLate] })[0] as { text: string }).text;
    expect(text).toContain('60 min late');
  });

  it('formats multiple vehicles from same agency', () => {
    const v1 = {
      vehicleId: 'bus_001',
      tripId: 'trip_A',
      routeId: '1_100259',
      routeShortName: '44',
      tripHeadsign: 'Downtown',
      position: { lat: 47.65, lon: -122.31 },
      lastUpdateTime: NOW_MS,
      phase: 'in_progress',
      scheduleDeviation: 30,
      orientation: null,
      nextStop: null,
      predicted: true,
    };
    const v2 = {
      vehicleId: 'bus_002',
      tripId: 'trip_B',
      routeId: '1_100262',
      routeShortName: '45',
      tripHeadsign: 'Eastlake',
      position: { lat: 47.66, lon: -122.32 },
      lastUpdateTime: NOW_MS,
      phase: 'in_progress',
      scheduleDeviation: -60,
      orientation: 180,
      nextStop: '1_75500',
      predicted: true,
    };
    const text = (getVehicles.format!({ vehicles: [v1, v2] })[0] as { text: string }).text;
    expect(text).toContain('bus_001');
    expect(text).toContain('bus_002');
    expect(text).toContain('early');
  });

  it('formats vehicle with early deviation', () => {
    const v = {
      vehicleId: 'bus_100',
      tripId: null,
      routeId: null,
      routeShortName: null,
      tripHeadsign: null,
      position: { lat: 47.65, lon: -122.31 },
      lastUpdateTime: NOW_MS,
      phase: 'deadhead_before',
      scheduleDeviation: -180,
      orientation: 270,
      nextStop: null,
      predicted: false,
    };
    const text = (getVehicles.format!({ vehicles: [v] })[0] as { text: string }).text;
    expect(text).toContain('early');
    expect(text).toContain('bus_100');
  });
});

// ---- getTrip edge cases ----

describe('getTrip edge cases', () => {
  it('formats trip with active situation IDs', () => {
    const tripWithAlerts = {
      tripId: 'trip_abc',
      routeShortName: '44',
      tripHeadsign: 'Downtown',
      status: {
        phase: 'in_progress',
        predicted: true,
        position: { lat: 47.659, lon: -122.315 },
        scheduleDeviation: 60,
        nextStop: '1_75403',
        closestStop: '1_75400',
        vehicleId: 'bus_1234',
        lastUpdateTime: NOW_MS,
      },
      schedule: [],
      situations: ['sit_1', 'sit_2'],
    };
    const text = (getTrip.format!(tripWithAlerts)[0] as { text: string }).text;
    expect(text).toContain('sit_1');
    expect(text).toContain('sit_2');
  });

  it('formats trip with null position', () => {
    const noPos = {
      tripId: 'trip_abc',
      routeShortName: '44',
      tripHeadsign: 'Downtown',
      status: {
        phase: 'layover_before',
        predicted: false,
        position: null,
        scheduleDeviation: 0,
        nextStop: null,
        closestStop: null,
        vehicleId: null,
        lastUpdateTime: NOW_MS,
      },
      schedule: null,
      situations: [],
    };
    const text = (getTrip.format!(noPos)[0] as { text: string }).text;
    expect(text).toContain('trip_abc');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
  });

  it('formats large stop sequence without truncation', () => {
    const stops = Array.from({ length: 50 }, (_, i) => ({
      stopId: `1_stop_${i}`,
      stopName: `Stop ${i}`,
      arrivalTime: 28800 + i * 60,
      departureTime: 28800 + i * 60 + 30,
      distanceAlongTripMeters: i * 200,
    }));
    const bigTrip = {
      tripId: 'trip_big',
      routeShortName: '44',
      tripHeadsign: 'Terminus',
      status: {
        phase: 'in_progress',
        predicted: true,
        position: null,
        scheduleDeviation: 0,
        nextStop: null,
        closestStop: null,
        vehicleId: null,
        lastUpdateTime: NOW_MS,
      },
      schedule: stops,
      situations: [],
    };
    const text = (getTrip.format!(bigTrip)[0] as { text: string }).text;
    expect(text).toContain('Stop Sequence');
    expect(text).toContain('1_stop_0');
    expect(text).toContain('1_stop_49');
  });
});

// ---- getAlert edge cases ----

describe('getAlert edge cases', () => {
  it('handles alert with open-ended active window (no "to")', async () => {
    const ctx = createMockContext();
    const openEndedAlert = {
      id: '1_sit_open',
      summary: 'Ongoing disruption',
      description: null,
      reason: null,
      severity: null,
      consequenceMessage: null,
      affects: [],
      consequences: [],
      activeWindows: [{ from: 1700000000000 }],
      url: null,
    };
    mockService.getAlert.mockResolvedValue(openEndedAlert);
    const input = getAlert.input.parse({ situationId: '1_sit_open' });
    const result = await getAlert.handler(input, ctx);
    const text = (getAlert.format!(result)[0] as { text: string }).text;
    expect(text).toContain('1_sit_open');
    expect(text).toContain('open end');
  });

  it('handles alert with no "from" time (open start)', () => {
    const openStartAlert = {
      id: '1_sit_nostart',
      summary: 'Preexisting issue',
      description: null,
      reason: null,
      severity: null,
      consequenceMessage: null,
      affects: [],
      consequences: [],
      activeWindows: [{ to: 1800000000000 }],
      url: null,
    };
    const text = (getAlert.format!(openStartAlert)[0] as { text: string }).text;
    expect(text).toContain('open start');
  });

  it('formats alert with agency-scoped affect', () => {
    const agencyAlert = {
      id: '1_sit_agency',
      summary: 'Agency-wide alert',
      description: null,
      reason: 'miscellaneousReason',
      severity: 'severe',
      consequenceMessage: null,
      affects: [{ agencyId: '1' }, { agencyId: '40' }],
      consequences: [],
      activeWindows: [],
      url: 'https://example.com/alert',
    };
    const text = (getAlert.format!(agencyAlert)[0] as { text: string }).text;
    expect(text).toContain('agency:1');
    expect(text).toContain('agency:40');
    expect(text).toContain('miscellaneousReason');
    expect(text).toContain('severe');
  });

  it('formats alert with trip-scoped affect', () => {
    const tripAlert = {
      id: '1_sit_trip',
      summary: 'Trip-specific alert',
      description: null,
      reason: null,
      severity: null,
      consequenceMessage: null,
      affects: [{ tripId: '1_trip_XYZ' }],
      consequences: [],
      activeWindows: [],
      url: null,
    };
    const text = (getAlert.format!(tripAlert)[0] as { text: string }).text;
    expect(text).toContain('trip:1_trip_XYZ');
  });

  it('formats consequence without diversionStopIds', () => {
    const noDetour = {
      id: '1_sit_nodiv',
      summary: 'Reduced service',
      description: null,
      reason: null,
      severity: null,
      consequenceMessage: null,
      affects: [],
      consequences: [{ condition: 'reducedService' }],
      activeWindows: [],
      url: null,
    };
    const text = (getAlert.format!(noDetour)[0] as { text: string }).text;
    expect(text).toContain('reducedService');
    expect(text).not.toContain('undefined');
  });
});

// ---- getBlock edge cases ----

describe('getBlock edge cases', () => {
  it('formats block with multiple trips and non-zero distanceAlongBlock', () => {
    const blockWithDist = {
      blockId: '1_block_202',
      activeServiceIds: ['svc_1'],
      inactiveServiceIds: [],
      trips: [
        {
          tripId: '1_trip_first',
          distanceAlongBlock: 0,
          accumulatedSlackTime: 0,
          blockStopTimes: [{ stopId: '1_75400', arrivalTime: 32400, departureTime: 32400 }],
        },
        {
          tripId: '1_trip_second',
          distanceAlongBlock: 15000,
          accumulatedSlackTime: 600,
          blockStopTimes: [
            { stopId: '1_75500', arrivalTime: 36000, departureTime: 36060 },
            {
              stopId: '1_75600',
              arrivalTime: 36300,
              departureTime: 36360,
              pickupType: 1,
              dropOffType: 0,
            },
          ],
        },
      ],
    };
    const text = (getBlock.format!(blockWithDist)[0] as { text: string }).text;
    expect(text).toContain('15000');
    expect(text).toContain('600');
    expect(text).toContain('pickup:1');
    expect(text).toContain('dropoff:0');
  });

  it('formats GTFS midnight-overflow stop times (> 24h)', () => {
    const afterMidnight = {
      blockId: '1_block_203',
      activeServiceIds: [],
      inactiveServiceIds: [],
      trips: [
        {
          tripId: '1_trip_late',
          distanceAlongBlock: 0,
          accumulatedSlackTime: 0,
          blockStopTimes: [
            // 25:30:00 = seconds past midnight of the next day
            { stopId: '1_75400', arrivalTime: 91800, departureTime: 91800 },
          ],
        },
      ],
    };
    const text = (getBlock.format!(afterMidnight)[0] as { text: string }).text;
    expect(text).toContain('1_block_203');
    // fmtSec(91800) = 25:30 — should render without crash
    expect(text).toContain('25:30');
  });
});

// ---- getScheduleForStop edge cases ----

describe('getScheduleForStop edge cases', () => {
  it('formats schedule with multiple routes and directions', () => {
    const multiRoute = {
      stopId: '1_75403',
      stopName: 'Hub Stop',
      serviceDateMs: NOW_MS,
      routes: [
        {
          routeId: '1_100259',
          routeShortName: '44',
          directions: [
            {
              tripHeadsign: 'Downtown Seattle',
              departures: [
                { scheduledDepartureTime: NOW_MS + 2 * 60 * 1000, tripId: 'trip_A' },
                { scheduledDepartureTime: NOW_MS + 12 * 60 * 1000, tripId: 'trip_B' },
              ],
            },
            {
              tripHeadsign: 'Ballard',
              departures: [{ scheduledDepartureTime: NOW_MS + 5 * 60 * 1000, tripId: 'trip_C' }],
            },
          ],
        },
        {
          routeId: '1_100262',
          routeShortName: '45',
          directions: [
            {
              tripHeadsign: 'Eastlake',
              departures: [{ scheduledDepartureTime: NOW_MS + 7 * 60 * 1000, tripId: 'trip_D' }],
            },
          ],
        },
      ],
    };
    const text = (getScheduleForStop.format!(multiRoute)[0] as { text: string }).text;
    expect(text).toContain('44');
    expect(text).toContain('45');
    expect(text).toContain('Downtown Seattle');
    expect(text).toContain('Ballard');
    expect(text).toContain('Eastlake');
    expect(text).toContain('trip_A');
    expect(text).toContain('trip_D');
  });

  it('echoes date in enrichment when date provided', async () => {
    const ctx = createMockContext();
    mockService.getScheduleForStop.mockResolvedValue({
      stopId: '1_75403',
      stopName: 'Hub Stop',
      serviceDateMs: NOW_MS,
      routes: [],
    });
    const input = getScheduleForStop.input.parse({ stopId: '1_75403', date: '2026-05-30' });
    await getScheduleForStop.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.date).toBe('2026-05-30');
    expect(enrichment.routeCount).toBe(0);
  });
});

// ---- getScheduleForRoute edge cases ----

describe('getScheduleForRoute edge cases', () => {
  it('formats route schedule with zero stops in a trip', () => {
    const emptyTripStops = {
      routeId: '1_100259',
      routeShortName: '44',
      serviceDateMs: NOW_MS,
      trips: [
        {
          tripId: 'trip_empty',
          tripHeadsign: 'Downtown',
          serviceId: 'svc_weekend',
          stops: [],
        },
      ],
    };
    const text = (getScheduleForRoute.format!(emptyTripStops)[0] as { text: string }).text;
    expect(text).toContain('trip_empty');
    expect(text).not.toContain('undefined');
  });

  it('handles route schedule with multiple trips', async () => {
    const ctx = createMockContext();
    const manyTrips = {
      routeId: '1_100259',
      routeShortName: '44',
      serviceDateMs: NOW_MS,
      trips: Array.from({ length: 5 }, (_, i) => ({
        tripId: `trip_${i}`,
        tripHeadsign: 'Downtown',
        serviceId: 'svc_weekday',
        stops: [
          {
            stopId: '1_75400',
            stopName: 'Start',
            arrivalTime: 28800 + i * 3600,
            departureTime: 28800 + i * 3600 + 30,
          },
        ],
      })),
    };
    mockService.getScheduleForRoute.mockResolvedValue(manyTrips);
    const input = getScheduleForRoute.input.parse({ routeId: '1_100259' });
    const result = await getScheduleForRoute.handler(input, ctx);
    expect(result.trips).toHaveLength(5);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.tripCount).toBe(5);
  });
});

// ---- searchStops edge cases ----

describe('searchStops edge cases', () => {
  it('passes maxCount to service', async () => {
    const ctx = createMockContext();
    mockService.searchStops.mockResolvedValue([]);
    const input = searchStops.input.parse({ query: 'University', maxCount: 3 });
    await searchStops.handler(input, ctx);
    expect(mockService.searchStops).toHaveBeenCalledWith(
      expect.objectContaining({ maxCount: 3 }),
      ctx,
    );
  });

  it('formats multiple stops in results', () => {
    const stops = [
      {
        id: '1_75403',
        code: '75403',
        name: 'University Way NE & NE 42nd St',
        lat: 47.6586,
        lon: -122.3146,
        direction: 'N',
        routeIds: ['1_100259'],
        wheelchairBoarding: 'ACCESSIBLE' as const,
      },
      {
        id: '1_75404',
        code: '75404',
        name: 'University Way NE & NE 43rd St',
        lat: 47.659,
        lon: -122.315,
        direction: 'S',
        routeIds: [],
        wheelchairBoarding: 'UNKNOWN' as const,
      },
    ];
    const text = (searchStops.format!({ stops })[0] as { text: string }).text;
    expect(text).toContain('1_75403');
    expect(text).toContain('1_75404');
    expect(text).toContain('2');
  });
});

// ---- searchRoutes edge cases ----

describe('searchRoutes edge cases', () => {
  it('passes maxCount to service', async () => {
    const ctx = createMockContext();
    mockService.searchRoutes.mockResolvedValue([]);
    const input = searchRoutes.input.parse({ query: '44', maxCount: 5 });
    await searchRoutes.handler(input, ctx);
    expect(mockService.searchRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ maxCount: 5 }),
      ctx,
    );
  });

  it('formats routes with empty description gracefully', () => {
    const routeNoDesc = {
      id: '1_100259',
      shortName: '44',
      longName: 'Ballard - University District',
      description: '',
      agencyId: '1',
      agencyName: 'Metro Transit',
      type: 3,
    };
    const text = (searchRoutes.format!({ routes: [routeNoDesc] })[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).not.toContain('undefined');
  });
});

// ---- listRoutesForAgency edge cases ----

describe('listRoutesForAgency edge cases', () => {
  it('formats routes with color and url', () => {
    const routeWithColor = {
      id: '1_100259',
      shortName: '44',
      longName: 'Ballard - University District',
      description: 'Description text',
      type: 3,
      color: 'FF6600',
      url: 'https://example.com/route/44',
    };
    const text = (listRoutesForAgency.format!({ routes: [routeWithColor] })[0] as { text: string })
      .text;
    expect(text).toContain('#FF6600');
    expect(text).toContain('https://example.com/route/44');
  });

  it('formats large list of routes without crash', async () => {
    const ctx = createMockContext();
    const routes = Array.from({ length: 100 }, (_, i) => ({
      id: `1_route_${i}`,
      shortName: `R${i}`,
      longName: `Route ${i}`,
      description: '',
      type: 3,
      color: null,
      url: null,
    }));
    mockService.listRoutesForAgency.mockResolvedValue(routes);
    const input = listRoutesForAgency.input.parse({ agencyId: '1' });
    const result = await listRoutesForAgency.handler(input, ctx);
    expect(result.routes).toHaveLength(100);
    const text = (listRoutesForAgency.format!(result)[0] as { text: string }).text;
    expect(text).toContain('1_route_0');
    expect(text).toContain('1_route_99');
    const enrichment = getEnrichment(ctx);
    expect(enrichment.count).toBe(100);
  });
});

// ---- findRoutes edge cases ----

describe('findRoutes edge cases', () => {
  it('formats route with url in output', () => {
    const routeWithUrl = {
      id: '1_100259',
      shortName: '44',
      longName: 'Ballard - University District',
      description: 'Wallingford',
      agencyId: '1',
      agencyName: 'Metro Transit',
      type: 3,
      color: '0073CF',
      url: 'https://metro.kingcounty.gov/schedules/044',
    };
    const text = (findRoutes.format!({ routes: [routeWithUrl] })[0] as { text: string }).text;
    expect(text).toContain('#0073CF');
    expect(text).toContain('https://metro.kingcounty.gov/schedules/044');
  });

  it('formats route with type=4 (ferry)', () => {
    const ferry = {
      id: '98_ferry_1',
      shortName: 'Bainbridge',
      longName: 'Seattle - Bainbridge Island',
      description: 'Washington State Ferries',
      agencyId: '98',
      agencyName: 'WSF',
      type: 4,
      color: null,
      url: null,
    };
    const text = (findRoutes.format!({ routes: [ferry] })[0] as { text: string }).text;
    expect(text).toContain('Bainbridge');
    expect(text).toContain('4');
  });
});

// ---- getRoute edge cases ----

describe('getRoute edge cases', () => {
  it('formats route without optional color and url', () => {
    const minimal = {
      id: '1_100259',
      shortName: '44',
      longName: '',
      description: '',
      agencyId: '1',
      agencyName: 'Metro Transit',
      type: 3,
      color: null,
      url: null,
    };
    const text = (getRoute.format!(minimal)[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).not.toContain('#null');
    expect(text).not.toContain('null');
  });
});
