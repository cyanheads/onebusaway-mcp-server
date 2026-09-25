/**
 * @fileoverview Input validation tests — Zod schema rejection for all tools.
 * @module tests/tools/input-validation.tool.test
 */

import { z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { runToolContract } from '@cyanheads/mcp-ts-core/testing';
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
import { getStopContext } from '@/mcp-server/tools/definitions/get-stop-context.tool.js';
import { getTrip } from '@/mcp-server/tools/definitions/get-trip.tool.js';
import { getVehicles } from '@/mcp-server/tools/definitions/get-vehicles.tool.js';
import { listAgencies } from '@/mcp-server/tools/definitions/list-agencies.tool.js';
import { listRoutesForAgency } from '@/mcp-server/tools/definitions/list-routes-for-agency.tool.js';
import { searchRoutes } from '@/mcp-server/tools/definitions/search-routes.tool.js';
import { searchStops } from '@/mcp-server/tools/definitions/search-stops.tool.js';

/** Service stub — a schema rejection must never reach it. */
vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = {
  getArrivals: vi.fn(),
  getStopContext: vi.fn(),
  getTrip: vi.fn(),
  getScheduleForStop: vi.fn(),
  getScheduleForRoute: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
});

/** The advertised JSON Schema for one input property. */
function wireProperty(input: z.ZodType, key: string): Record<string, unknown> {
  const schema = z.toJSONSchema(input) as { properties: Record<string, Record<string, unknown>> };
  return schema.properties[key]!;
}

/** Runs the tool through the framework's argument parse and asserts it rejected before the handler. */
async function expectSchemaRejection(
  definition: Parameters<typeof runToolContract>[0],
  args: Record<string, unknown>,
): Promise<void> {
  const result = await runToolContract(definition, args as never);
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({
    error: { code: JsonRpcErrorCode.InvalidParams },
  });
  expect(getOneBusAwayService).not.toHaveBeenCalled();
  expect(mockService.getArrivals).not.toHaveBeenCalled();
  expect(mockService.getStopContext).not.toHaveBeenCalled();
  expect(mockService.getTrip).not.toHaveBeenCalled();
  expect(mockService.getScheduleForStop).not.toHaveBeenCalled();
  expect(mockService.getScheduleForRoute).not.toHaveBeenCalled();
}

const strictToolInputs: readonly {
  name: string;
  input: z.ZodType;
  validInput: Record<string, unknown>;
}[] = [
  { name: 'findStops', input: findStops.input, validInput: { lat: 47.6, lon: -122.3 } },
  { name: 'searchStops', input: searchStops.input, validInput: { query: 'University' } },
  { name: 'getStop', input: getStop.input, validInput: { stopId: '1_75403' } },
  { name: 'findRoutes', input: findRoutes.input, validInput: { lat: 47.6, lon: -122.3 } },
  { name: 'searchRoutes', input: searchRoutes.input, validInput: { query: '44' } },
  { name: 'getRoute', input: getRoute.input, validInput: { routeId: '1_100259' } },
  { name: 'listRoutesForAgency', input: listRoutesForAgency.input, validInput: { agencyId: '1' } },
  { name: 'listAgencies', input: listAgencies.input, validInput: {} },
  { name: 'getArrivals', input: getArrivals.input, validInput: { stopId: '1_75403' } },
  { name: 'getStopContext', input: getStopContext.input, validInput: { stopId: '1_75403' } },
  { name: 'getTrip', input: getTrip.input, validInput: { tripId: 'trip_abc' } },
  { name: 'getVehicles', input: getVehicles.input, validInput: { agencyId: '1' } },
  { name: 'getAlert', input: getAlert.input, validInput: { situationId: '1_sit_001' } },
  { name: 'getBlock', input: getBlock.input, validInput: { blockId: '1_block_101' } },
  {
    name: 'getScheduleForStop',
    input: getScheduleForStop.input,
    validInput: { stopId: '1_75403' },
  },
  {
    name: 'getScheduleForRoute',
    input: getScheduleForRoute.input,
    validInput: { routeId: '1_100259' },
  },
];

describe('SDK v2 strict root tool inputs', () => {
  it.each(strictToolInputs)(
    '$name rejects unknown keys and advertises a closed wire schema',
    ({ input, validInput }) => {
      expect(() => input.parse({ ...validInput, unexpected: true })).toThrow();
      expect(z.toJSONSchema(input)).toMatchObject({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        additionalProperties: false,
      });
    },
  );
});

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

  it('rejects latitude above 90', () => {
    expect(() => findStops.input.parse({ lat: 91, lon: -122.3 })).toThrow();
  });

  it('rejects latitude below -90', () => {
    expect(() => findStops.input.parse({ lat: -91, lon: -122.3 })).toThrow();
  });

  it('rejects longitude above 180', () => {
    expect(() => findStops.input.parse({ lat: 47.6, lon: 181 })).toThrow();
  });

  it('rejects longitude below -180', () => {
    expect(() => findStops.input.parse({ lat: 47.6, lon: -181 })).toThrow();
  });

  it('rejects negative radius', () => {
    expect(() => findStops.input.parse({ lat: 47.6, lon: -122.3, radius: -1 })).toThrow();
  });

  it('rejects zero radius', () => {
    expect(() => findStops.input.parse({ lat: 47.6, lon: -122.3, radius: 0 })).toThrow();
  });

  it('rejects radius above the 1600m cap', () => {
    expect(() => findStops.input.parse({ lat: 47.6, lon: -122.3, radius: 1601 })).toThrow();
  });

  it('accepts boundary lat/lon and radius', () => {
    expect(() => findStops.input.parse({ lat: 90, lon: 180, radius: 1600 })).not.toThrow();
    expect(() => findStops.input.parse({ lat: -90, lon: -180, radius: 1 })).not.toThrow();
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

  it('rejects non-positive maxCount', () => {
    expect(() => searchStops.input.parse({ query: 'x', maxCount: 0 })).toThrow();
    expect(() => searchStops.input.parse({ query: 'x', maxCount: -5 })).toThrow();
  });

  it('rejects non-integer maxCount', () => {
    expect(() => searchStops.input.parse({ query: 'x', maxCount: 2.5 })).toThrow();
  });

  it('rejects maxCount above the cap of 100', () => {
    expect(() => searchStops.input.parse({ query: 'x', maxCount: 101 })).toThrow();
  });

  it('accepts boundary maxCount values', () => {
    expect(searchStops.input.parse({ query: 'x', maxCount: 1 }).maxCount).toBe(1);
    expect(searchStops.input.parse({ query: 'x', maxCount: 100 }).maxCount).toBe(100);
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

  it('rejects latitude above 90', () => {
    expect(() => findRoutes.input.parse({ lat: 91, lon: -122.3 })).toThrow();
  });

  it('rejects latitude below -90', () => {
    expect(() => findRoutes.input.parse({ lat: -91, lon: -122.3 })).toThrow();
  });

  it('rejects longitude above 180', () => {
    expect(() => findRoutes.input.parse({ lat: 47.6, lon: 181 })).toThrow();
  });

  it('rejects longitude below -180', () => {
    expect(() => findRoutes.input.parse({ lat: 47.6, lon: -181 })).toThrow();
  });

  it('rejects negative radius', () => {
    expect(() => findRoutes.input.parse({ lat: 47.6, lon: -122.3, radius: -1 })).toThrow();
  });

  it('rejects zero radius', () => {
    expect(() => findRoutes.input.parse({ lat: 47.6, lon: -122.3, radius: 0 })).toThrow();
  });

  it('rejects radius above the 1600m cap', () => {
    expect(() => findRoutes.input.parse({ lat: 47.6, lon: -122.3, radius: 1601 })).toThrow();
  });

  it('rejects non-positive latSpan or lonSpan', () => {
    expect(() => findRoutes.input.parse({ lat: 47.6, lon: -122.3, latSpan: -0.1 })).toThrow();
    expect(() => findRoutes.input.parse({ lat: 47.6, lon: -122.3, lonSpan: 0 })).toThrow();
  });

  it('accepts boundary lat/lon, radius, and positive spans', () => {
    expect(() => findRoutes.input.parse({ lat: 90, lon: 180, radius: 1600 })).not.toThrow();
    expect(() => findRoutes.input.parse({ lat: -90, lon: -180, radius: 1 })).not.toThrow();
    expect(() =>
      findRoutes.input.parse({ lat: 47.6, lon: -122.3, latSpan: 0.1, lonSpan: 0.2 }),
    ).not.toThrow();
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

  it('rejects non-positive maxCount', () => {
    expect(() => searchRoutes.input.parse({ query: 'x', maxCount: 0 })).toThrow();
    expect(() => searchRoutes.input.parse({ query: 'x', maxCount: -5 })).toThrow();
  });

  it('rejects non-integer maxCount', () => {
    expect(() => searchRoutes.input.parse({ query: 'x', maxCount: 2.5 })).toThrow();
  });

  it('rejects maxCount above the cap of 100', () => {
    expect(() => searchRoutes.input.parse({ query: 'x', maxCount: 101 })).toThrow();
  });

  it('accepts boundary maxCount values', () => {
    expect(searchRoutes.input.parse({ query: 'x', maxCount: 1 }).maxCount).toBe(1);
    expect(searchRoutes.input.parse({ query: 'x', maxCount: 100 }).maxCount).toBe(100);
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

// ---- arrivals window bounds (#28) ----

describe.each([
  { name: 'getArrivals', definition: getArrivals },
  { name: 'getStopContext', definition: getStopContext },
])('$name arrivals window bounds (#28)', ({ definition }) => {
  it.each([
    { minutesBefore: -1 },
    { minutesBefore: 2.5 },
    { minutesBefore: 61 },
    { minutesAfter: -1 },
    { minutesAfter: 2.5 },
    { minutesAfter: 241 },
    { minutesAfter: 40000 },
  ])('rejects %o at the schema, before any service call', async (window) => {
    await expectSchemaRejection(definition, { stopId: '1_570', ...window });
  });

  it.each([
    [{}, 5, 35],
    [{ minutesBefore: 0, minutesAfter: 0 }, 0, 0],
    [{ minutesBefore: 60, minutesAfter: 240 }, 60, 240],
  ])('accepts %o as minutesBefore=%i, minutesAfter=%i', (window, before, after) => {
    const parsed = definition.input.parse({ stopId: '1_570', ...window });
    expect(parsed.minutesBefore).toBe(before);
    expect(parsed.minutesAfter).toBe(after);
  });

  it('advertises integer bounds in the JSON Schema and states them in the descriptions', () => {
    const before = wireProperty(definition.input, 'minutesBefore');
    const after = wireProperty(definition.input, 'minutesAfter');
    expect(before).toMatchObject({ type: 'integer', minimum: 0, maximum: 60, default: 5 });
    expect(after).toMatchObject({ type: 'integer', minimum: 0, maximum: 240, default: 35 });
    expect(before.description).toMatch(/0.*60/);
    expect(after.description).toMatch(/0.*240/);
    expect(after.description).toContain('onebusaway_get_schedule_for_stop');
  });
});

it('getStopContext advertises the same input schema as getArrivals (#24)', () => {
  expect(z.toJSONSchema(getStopContext.input)).toEqual(z.toJSONSchema(getArrivals.input));
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

  it.each([-1, 1.5])(
    'rejects serviceDateMs %d at the schema, before any service call (#31)',
    async (serviceDateMs) => {
      await expectSchemaRejection(getTrip, { tripId: '1_809330291', serviceDateMs });
    },
  );

  it('accepts a real midnight-local service date and the 0 boundary (#31)', () => {
    // 2026-09-24 00:00 America/Los_Angeles, as upstream reports serviceDate.
    expect(getTrip.input.parse({ tripId: 't', serviceDateMs: 1790233200000 }).serviceDateMs).toBe(
      1790233200000,
    );
    expect(getTrip.input.parse({ tripId: 't', serviceDateMs: 0 }).serviceDateMs).toBe(0);
  });

  it('advertises serviceDateMs as an integer with minimum 0 (#31)', () => {
    expect(wireProperty(getTrip.input, 'serviceDateMs')).toMatchObject({
      type: 'integer',
      minimum: 0,
    });
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

// ---- schedule date format (#32) ----

describe.each([
  {
    name: 'getScheduleForStop',
    definition: getScheduleForStop,
    idArgs: { stopId: '1_570' },
    service: mockService.getScheduleForStop,
    result: { stopId: '1_570', stopName: '3rd Ave & Union St', serviceDateMs: 0, routes: [] },
  },
  {
    name: 'getScheduleForRoute',
    definition: getScheduleForRoute,
    idArgs: { routeId: '1_100229' },
    service: mockService.getScheduleForRoute,
    result: { routeId: '1_100229', routeShortName: '5', serviceDateMs: 0, trips: [] },
  },
])('$name date must be a real YYYY-MM-DD calendar date (#32)', (tc) => {
  /** Runs the tool through the full contract path and returns the params the service received. */
  async function forwarded(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    tc.service.mockResolvedValue(tc.result);
    const result = await runToolContract(tc.definition, { ...tc.idArgs, ...args } as never);
    expect(result.isError).toBeFalsy();
    expect(tc.service).toHaveBeenCalledTimes(1);
    return tc.service.mock.calls[0]![0] as Record<string, unknown>;
  }

  it.each(['2026-05-23', '2024-02-29', '2000-02-29'])(
    'accepts %s and forwards it unchanged',
    async (date) => {
      expect(await forwarded({ date })).toMatchObject({ date });
    },
  );

  it('treats an omitted date as today — no date forwarded', async () => {
    expect(await forwarded({})).not.toHaveProperty('date');
  });

  it('treats a blank date (form clients send "") as today — no date forwarded', async () => {
    expect(await forwarded({ date: '' })).not.toHaveProperty('date');
  });

  it.each([
    '2026-99-99', // impossible month/day — upstream rolled it over to 2034-06-07
    '2026-02-30', // impossible day
    '2026-02-29', // not a leap year
    '2100-02-29', // century non-leap year
    'not-a-date',
    '2026-9-3', // unpadded — upstream accepted it
    '2026-09-24T12:00:00', // datetime — upstream accepted it, truncated to the date
    '1790319600000', // epoch milliseconds — upstream read all-digit values as a timestamp
    '20260924', // compact — upstream read it as epoch ms (1970-01-01)
    '09/24/2026',
    ' 2026-05-23',
  ])('rejects %j at the schema, before any service call', async (date) => {
    await expectSchemaRejection(tc.definition, { ...tc.idArgs, date });
  });

  it('names the expected YYYY-MM-DD format on both error surfaces', async () => {
    const result = await runToolContract(tc.definition, {
      ...tc.idArgs,
      date: '2026-02-30',
    } as never);
    const error = (result.structuredContent as { error: { message: string } }).error;
    expect(error.message).toMatch(/date: Expected a real calendar date as YYYY-MM-DD/);
    const text = (result.content as Array<{ text: string }>).map((b) => b.text).join('\n');
    expect(text).toContain('YYYY-MM-DD');
  });

  it('advertises the YYYY-MM-DD format in the JSON Schema, with "" allowed', () => {
    const date = wireProperty(tc.definition.input, 'date') as {
      anyOf: Array<Record<string, unknown>>;
      description: string;
    };
    expect(date.anyOf).toContainEqual({ type: 'string', const: '' });
    expect(date.anyOf).toContainEqual(
      expect.objectContaining({ type: 'string', format: 'date', pattern: expect.any(String) }),
    );
    expect(date.description).toContain('YYYY-MM-DD');
  });
});
