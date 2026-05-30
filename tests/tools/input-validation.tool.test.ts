/**
 * @fileoverview Input validation tests — Zod schema rejection for all tools.
 * @module tests/tools/input-validation.tool.test
 */

import { describe, expect, it } from 'vitest';
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

// ---- findStops ----

describe('findStops input validation', () => {
  it('rejects missing lat', () => {
    expect(() => findStops.input.parse({ lon: -122.3 })).toThrow();
  });

  it('rejects missing lon', () => {
    expect(() => findStops.input.parse({ lat: 47.6 })).toThrow();
  });

  it('rejects non-numeric lat', () => {
    expect(() => findStops.input.parse({ lat: 'notanumber', lon: -122.3 })).toThrow();
  });

  it('rejects non-numeric radius', () => {
    expect(() => findStops.input.parse({ lat: 47.6, lon: -122.3, radius: 'big' })).toThrow();
  });

  it('accepts valid input with defaults applied', () => {
    const result = findStops.input.parse({ lat: 47.6586, lon: -122.3146 });
    expect(result.radius).toBe(300);
  });

  it('accepts optional query when present', () => {
    const result = findStops.input.parse({ lat: 47.6, lon: -122.3, query: '75403' });
    expect(result.query).toBe('75403');
  });

  it('accepts empty string query (treated as omitted by handler)', () => {
    const result = findStops.input.parse({ lat: 47.6, lon: -122.3, query: '' });
    expect(result.query).toBe('');
  });
});

// ---- searchStops ----

describe('searchStops input validation', () => {
  it('rejects empty query string', () => {
    expect(() => searchStops.input.parse({ query: '' })).toThrow();
  });

  it('rejects missing query', () => {
    expect(() => searchStops.input.parse({})).toThrow();
  });

  it('accepts query with default maxCount', () => {
    const result = searchStops.input.parse({ query: 'University Way' });
    expect(result.maxCount).toBe(10);
  });

  it('accepts explicit maxCount', () => {
    const result = searchStops.input.parse({ query: '75403', maxCount: 5 });
    expect(result.maxCount).toBe(5);
  });

  it('rejects non-numeric maxCount', () => {
    expect(() => searchStops.input.parse({ query: 'test', maxCount: 'all' })).toThrow();
  });
});

// ---- getStop ----

describe('getStop input validation', () => {
  it('rejects empty stopId', () => {
    expect(() => getStop.input.parse({ stopId: '' })).toThrow();
  });

  it('rejects missing stopId', () => {
    expect(() => getStop.input.parse({})).toThrow();
  });

  it('accepts valid agency-prefixed stop ID', () => {
    const result = getStop.input.parse({ stopId: '1_75403' });
    expect(result.stopId).toBe('1_75403');
  });
});

// ---- findRoutes ----

describe('findRoutes input validation', () => {
  it('rejects missing lat', () => {
    expect(() => findRoutes.input.parse({ lon: -122.3 })).toThrow();
  });

  it('rejects missing lon', () => {
    expect(() => findRoutes.input.parse({ lat: 47.6 })).toThrow();
  });

  it('accepts valid input with defaults', () => {
    const result = findRoutes.input.parse({ lat: 47.6, lon: -122.3 });
    expect(result.radius).toBe(500);
  });

  it('rejects string lat', () => {
    expect(() => findRoutes.input.parse({ lat: 'forty-seven', lon: -122.3 })).toThrow();
  });
});

// ---- searchRoutes ----

describe('searchRoutes input validation', () => {
  it('rejects empty query', () => {
    expect(() => searchRoutes.input.parse({ query: '' })).toThrow();
  });

  it('rejects missing query', () => {
    expect(() => searchRoutes.input.parse({})).toThrow();
  });

  it('accepts valid query with default maxCount', () => {
    const result = searchRoutes.input.parse({ query: '44' });
    expect(result.maxCount).toBe(10);
  });
});

// ---- getRoute ----

describe('getRoute input validation', () => {
  it('rejects empty routeId', () => {
    expect(() => getRoute.input.parse({ routeId: '' })).toThrow();
  });

  it('rejects missing routeId', () => {
    expect(() => getRoute.input.parse({})).toThrow();
  });

  it('accepts valid route ID', () => {
    const result = getRoute.input.parse({ routeId: '1_100259' });
    expect(result.routeId).toBe('1_100259');
  });
});

// ---- listRoutesForAgency ----

describe('listRoutesForAgency input validation', () => {
  it('rejects empty agencyId', () => {
    expect(() => listRoutesForAgency.input.parse({ agencyId: '' })).toThrow();
  });

  it('rejects missing agencyId', () => {
    expect(() => listRoutesForAgency.input.parse({})).toThrow();
  });

  it('accepts valid agency ID', () => {
    const result = listRoutesForAgency.input.parse({ agencyId: '1' });
    expect(result.agencyId).toBe('1');
  });
});

// ---- listAgencies ----

describe('listAgencies input validation', () => {
  it('accepts empty input object', () => {
    expect(() => listAgencies.input.parse({})).not.toThrow();
  });
});

// ---- getArrivals ----

describe('getArrivals input validation', () => {
  it('rejects empty stopId', () => {
    expect(() => getArrivals.input.parse({ stopId: '' })).toThrow();
  });

  it('rejects missing stopId', () => {
    expect(() => getArrivals.input.parse({})).toThrow();
  });

  it('accepts valid input with defaults', () => {
    const result = getArrivals.input.parse({ stopId: '1_75403' });
    expect(result.minutesBefore).toBe(5);
    expect(result.minutesAfter).toBe(35);
  });

  it('accepts explicit window minutes', () => {
    const result = getArrivals.input.parse({
      stopId: '1_75403',
      minutesBefore: 2,
      minutesAfter: 60,
    });
    expect(result.minutesBefore).toBe(2);
    expect(result.minutesAfter).toBe(60);
  });

  it('rejects non-numeric minutesBefore', () => {
    expect(() => getArrivals.input.parse({ stopId: '1_75403', minutesBefore: 'five' })).toThrow();
  });
});

// ---- getTrip ----

describe('getTrip input validation', () => {
  it('rejects empty tripId', () => {
    expect(() => getTrip.input.parse({ tripId: '' })).toThrow();
  });

  it('rejects missing tripId', () => {
    expect(() => getTrip.input.parse({})).toThrow();
  });

  it('accepts valid tripId with defaults', () => {
    const result = getTrip.input.parse({ tripId: 'trip_abc' });
    expect(result.includeSchedule).toBe(true);
    expect(result.serviceDateMs).toBeUndefined();
  });

  it('accepts optional serviceDateMs', () => {
    const result = getTrip.input.parse({ tripId: 'trip_abc', serviceDateMs: 1748000000000 });
    expect(result.serviceDateMs).toBe(1748000000000);
  });
});

// ---- getVehicles ----

describe('getVehicles input validation', () => {
  it('rejects empty agencyId', () => {
    expect(() => getVehicles.input.parse({ agencyId: '' })).toThrow();
  });

  it('rejects missing agencyId', () => {
    expect(() => getVehicles.input.parse({})).toThrow();
  });

  it('accepts valid input without optional routeId', () => {
    const result = getVehicles.input.parse({ agencyId: '1' });
    expect(result.routeId).toBeUndefined();
  });

  it('accepts valid input with optional routeId', () => {
    const result = getVehicles.input.parse({ agencyId: '1', routeId: '1_100259' });
    expect(result.routeId).toBe('1_100259');
  });
});

// ---- getAlert ----

describe('getAlert input validation', () => {
  it('rejects empty situationId', () => {
    expect(() => getAlert.input.parse({ situationId: '' })).toThrow();
  });

  it('rejects missing situationId', () => {
    expect(() => getAlert.input.parse({})).toThrow();
  });

  it('accepts valid situation ID', () => {
    const result = getAlert.input.parse({ situationId: '1_sit_001' });
    expect(result.situationId).toBe('1_sit_001');
  });
});

// ---- getBlock ----

describe('getBlock input validation', () => {
  it('rejects empty blockId', () => {
    expect(() => getBlock.input.parse({ blockId: '' })).toThrow();
  });

  it('rejects missing blockId', () => {
    expect(() => getBlock.input.parse({})).toThrow();
  });

  it('accepts valid block ID', () => {
    const result = getBlock.input.parse({ blockId: '1_block_101' });
    expect(result.blockId).toBe('1_block_101');
  });
});

// ---- getScheduleForStop ----

describe('getScheduleForStop input validation', () => {
  it('rejects empty stopId', () => {
    expect(() => getScheduleForStop.input.parse({ stopId: '' })).toThrow();
  });

  it('rejects missing stopId', () => {
    expect(() => getScheduleForStop.input.parse({})).toThrow();
  });

  it('accepts optional date', () => {
    const result = getScheduleForStop.input.parse({ stopId: '1_75403', date: '2026-05-23' });
    expect(result.date).toBe('2026-05-23');
  });

  it('accepts empty date string (treated as omitted by handler)', () => {
    const result = getScheduleForStop.input.parse({ stopId: '1_75403', date: '' });
    expect(result.date).toBe('');
  });
});

// ---- getScheduleForRoute ----

describe('getScheduleForRoute input validation', () => {
  it('rejects empty routeId', () => {
    expect(() => getScheduleForRoute.input.parse({ routeId: '' })).toThrow();
  });

  it('rejects missing routeId', () => {
    expect(() => getScheduleForRoute.input.parse({})).toThrow();
  });

  it('accepts optional date', () => {
    const result = getScheduleForRoute.input.parse({ routeId: '1_100259', date: '2026-05-23' });
    expect(result.date).toBe('2026-05-23');
  });
});
