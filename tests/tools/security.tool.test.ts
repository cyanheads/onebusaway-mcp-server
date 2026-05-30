/**
 * @fileoverview Security tests — injection attempts, oversized inputs, secret isolation.
 * @module tests/tools/security.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findRoutes } from '@/mcp-server/tools/definitions/find-routes.tool.js';
import { findStops } from '@/mcp-server/tools/definitions/find-stops.tool.js';
import { getAlert } from '@/mcp-server/tools/definitions/get-alert.tool.js';
import { getArrivals } from '@/mcp-server/tools/definitions/get-arrivals.tool.js';
import { getBlock } from '@/mcp-server/tools/definitions/get-block.tool.js';
import { getRoute } from '@/mcp-server/tools/definitions/get-route.tool.js';
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
};

beforeEach(() => {
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
  vi.clearAllMocks();
  // Simulate env vars that should never appear in output
  process.env.ONEBUSAWAY_API_KEY = 'secret-api-key-12345';
});

/** Known injection patterns to attempt in string fields. */
const INJECTION_PAYLOADS = [
  "'; DROP TABLE stops; --",
  '<script>alert("xss")</script>',
  '../../etc/passwd',
  '$' + '{7*7}',
  '{{constructor.constructor("return process")()}}',
  '\x00\x01\x02',
  'A'.repeat(5000),
];

// Helper that echoes the query back in the service response (worst-case scenario)
function makeStopResult(id: string) {
  return {
    id,
    code: '75403',
    name: `Stop ${id}`,
    lat: 47.6586,
    lon: -122.3146,
    direction: 'N',
    routeIds: [],
    wheelchairBoarding: 'UNKNOWN' as const,
  };
}

// ---- findStops security ----

describe('findStops security', () => {
  it.each(
    INJECTION_PAYLOADS.slice(0, 3),
  )('query param injection "%s" is handled safely', async (payload) => {
    const ctx = createMockContext();
    mockService.findStops.mockResolvedValue({ stops: [], limitExceeded: false });
    // Should not throw even with adversarial query
    const input = findStops.input.parse({ lat: 47.6, lon: -122.3, query: payload });
    await expect(findStops.handler(input, ctx)).resolves.toBeDefined();
    // Service receives the payload as-is (no injection into the URL)
    expect(mockService.findStops).toHaveBeenCalledTimes(1);
  });

  it('oversized query string does not crash', async () => {
    const ctx = createMockContext();
    const bigQuery = 'A'.repeat(5000);
    mockService.findStops.mockResolvedValue({ stops: [], limitExceeded: false });
    const input = findStops.input.parse({ lat: 47.6, lon: -122.3, query: bigQuery });
    await expect(findStops.handler(input, ctx)).resolves.toBeDefined();
  });

  it('format output does not contain API key', async () => {
    const ctx = createMockContext();
    mockService.findStops.mockResolvedValue({
      stops: [makeStopResult('1_75403')],
      limitExceeded: false,
    });
    const input = findStops.input.parse({ lat: 47.6, lon: -122.3 });
    const result = await findStops.handler(input, ctx);
    const text = (findStops.format!(result)[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });
});

// ---- searchStops security ----

describe('searchStops security', () => {
  it.each(
    INJECTION_PAYLOADS.slice(0, 3),
  )('injection payload "%s" does not crash handler', async (payload) => {
    // Payloads that pass Zod min(1) only
    if (payload.length === 0) return;
    const ctx = createMockContext();
    mockService.searchStops.mockResolvedValue([]);
    const input = searchStops.input.parse({ query: payload });
    await expect(searchStops.handler(input, ctx)).resolves.toBeDefined();
  });

  it('format output does not contain API key', async () => {
    const ctx = createMockContext();
    mockService.searchStops.mockResolvedValue([makeStopResult('1_75403')]);
    const input = searchStops.input.parse({ query: '75403' });
    const result = await searchStops.handler(input, ctx);
    const text = (searchStops.format!(result)[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });
});

// ---- getStop security ----

describe('getStop security', () => {
  it.each([
    "'; DROP TABLE --",
    '../../etc/passwd',
    '\x00null\x00',
  ])('stopId with injection chars "%s" passes schema and does not crash', async (payload) => {
    const ctx = createMockContext();
    mockService.getStop.mockRejectedValue(new Error(`stop "${payload}" not found.`));
    const input = getStop.input.parse({ stopId: payload });
    await expect(getStop.handler(input, ctx)).rejects.toThrow();
  });

  it('format output does not contain API key', async () => {
    const stop = makeStopResult('1_75403');
    const text = (getStop.format!(stop)[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });
});

// ---- getArrivals security ----

describe('getArrivals security', () => {
  it('format output does not contain API key', async () => {
    const ctx = createMockContext();
    const now = Date.now();
    mockService.getArrivals.mockResolvedValue({
      stopId: '1_75403',
      stopName: 'Test Stop',
      currentTime: now,
      arrivals: [],
      situations: [],
    });
    const input = getArrivals.input.parse({ stopId: '1_75403' });
    const result = await getArrivals.handler(input, ctx);
    const text = (getArrivals.format!(result)[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });

  it('error message does not expose internal env config', async () => {
    const ctx = createMockContext();
    mockService.getArrivals.mockRejectedValue(new Error('Request failed'));
    const input = getArrivals.input.parse({ stopId: '1_75403' });
    await expect(getArrivals.handler(input, ctx)).rejects.toThrow();
    // The thrown error message does not reference the API key
    try {
      await getArrivals.handler(input, ctx);
    } catch (err: unknown) {
      if (err instanceof Error) {
        expect(err.message).not.toContain('secret-api-key-12345');
      }
    }
  });
});

// ---- searchRoutes security ----

describe('searchRoutes security', () => {
  it.each([
    "'; DROP TABLE --",
    '<script>alert(1)</script>',
  ])('injection payload "%s" does not crash handler', async (payload) => {
    const ctx = createMockContext();
    mockService.searchRoutes.mockResolvedValue([]);
    const input = searchRoutes.input.parse({ query: payload });
    await expect(searchRoutes.handler(input, ctx)).resolves.toBeDefined();
  });

  it('format output does not contain API key', async () => {
    mockService.searchRoutes.mockResolvedValue([]);
    const text = (searchRoutes.format!({ routes: [] })[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });
});

// ---- findRoutes security ----

describe('findRoutes security', () => {
  it('format output does not contain API key', async () => {
    const text = (findRoutes.format!({ routes: [] })[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });

  it('oversized query string does not crash', async () => {
    const ctx = createMockContext();
    const bigQuery = 'R'.repeat(5000);
    mockService.findRoutes.mockResolvedValue([]);
    const input = findRoutes.input.parse({ lat: 47.6, lon: -122.3, query: bigQuery });
    await expect(findRoutes.handler(input, ctx)).resolves.toBeDefined();
  });
});

// ---- getRoute security ----

describe('getRoute security', () => {
  it('format output does not contain API key', async () => {
    const route = {
      id: '1_100259',
      shortName: '44',
      longName: 'Test Route',
      description: '',
      agencyId: '1',
      agencyName: 'Metro Transit',
      type: 3,
      color: null,
      url: null,
    };
    const text = (getRoute.format!(route)[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });
});

// ---- listRoutesForAgency security ----

describe('listRoutesForAgency security', () => {
  it('format output does not contain API key', async () => {
    const text = (listRoutesForAgency.format!({ routes: [] })[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });
});

// ---- listAgencies security ----

describe('listAgencies security', () => {
  it('format output does not contain API key', async () => {
    const text = (listAgencies.format!({ agencies: [] })[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });
});

// ---- getVehicles security ----

describe('getVehicles security', () => {
  it('format output does not contain API key', async () => {
    const text = (getVehicles.format!({ vehicles: [] })[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });
});

// ---- getTrip security ----

describe('getTrip security', () => {
  it('format output does not contain API key', () => {
    const result = {
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
      schedule: null,
      situations: [],
    };
    const text = (getTrip.format!(result)[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });
});

// ---- getAlert security ----

describe('getAlert security', () => {
  it('injection content in alert fields is not executed', async () => {
    const ctx = createMockContext();
    const injectedAlert = {
      id: '1_sit_001',
      summary: '<script>alert("xss")</script>',
      description: "'; DROP TABLE alerts; --",
      reason: null,
      severity: null,
      consequenceMessage: null,
      affects: [],
      consequences: [],
      activeWindows: [],
      url: null,
    };
    mockService.getAlert.mockResolvedValue(injectedAlert);
    const input = getAlert.input.parse({ situationId: '1_sit_001' });
    const result = await getAlert.handler(input, ctx);
    // Result contains the raw text — it's up to clients to escape it for display
    expect(result.summary).toBe('<script>alert("xss")</script>');
    // format() renders it as a text block, which is safe for MCP consumers
    const text = (getAlert.format!(result)[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
    expect(typeof text).toBe('string');
  });
});

// ---- getBlock security ----

describe('getBlock security', () => {
  it('format output does not contain API key', () => {
    const block = {
      blockId: '1_block_101',
      activeServiceIds: [],
      inactiveServiceIds: [],
      trips: [],
    };
    const text = (getBlock.format!(block)[0] as { text: string }).text;
    expect(text).not.toContain('secret-api-key-12345');
  });
});
