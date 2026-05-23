/**
 * @fileoverview Tests for route-related tools: find-routes, get-route, list-routes-for-agency, search-routes.
 * @module tests/tools/routes.tool.test
 */

import { McpError } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findRoutes } from '@/mcp-server/tools/definitions/find-routes.tool.js';
import { getRoute } from '@/mcp-server/tools/definitions/get-route.tool.js';
import { listRoutesForAgency } from '@/mcp-server/tools/definitions/list-routes-for-agency.tool.js';
import { searchRoutes } from '@/mcp-server/tools/definitions/search-routes.tool.js';

vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = {
  findRoutes: vi.fn(),
  getRoute: vi.fn(),
  listRoutesForAgency: vi.fn(),
  searchRoutes: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
  vi.clearAllMocks();
});

const ROUTE_FIXTURE = {
  id: '1_100259',
  shortName: '44',
  longName: 'Ballard - University District',
  description: 'Wallingford - Eastlake - U-District',
  agencyId: '1',
  agencyName: 'Metro Transit',
  type: 3,
  color: null,
  url: null,
};

// ---- findRoutes ----

describe('findRoutes', () => {
  it('returns nearby routes', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue([ROUTE_FIXTURE]);
    const input = findRoutes.input.parse({ lat: 47.6586, lon: -122.3146 });
    const result = await findRoutes.handler(input, ctx);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]!.id).toBe('1_100259');
  });

  it('passes query filter to service', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue([]);
    const input = findRoutes.input.parse({ lat: 47.6, lon: -122.3, query: '44' });
    await findRoutes.handler(input, ctx);
    expect(mockService.findRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ query: '44' }),
      ctx,
    );
  });

  it('omits empty query from service call', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue([]);
    const input = findRoutes.input.parse({ lat: 47.6, lon: -122.3, query: '' });
    await findRoutes.handler(input, ctx);
    expect(mockService.findRoutes).toHaveBeenCalledWith(
      expect.not.objectContaining({ query: expect.anything() }),
      ctx,
    );
  });

  it('formats routes with ID and agency', () => {
    const text = (findRoutes.format!({ routes: [ROUTE_FIXTURE] })[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('44');
    expect(text).toContain('Metro Transit');
  });

  it('formats empty result', () => {
    const text = (findRoutes.format!({ routes: [] })[0] as { text: string }).text;
    expect(text).toMatch(/no routes/i);
  });
});

// ---- getRoute ----

describe('getRoute', () => {
  it('returns route details', async () => {
    const ctx = createMockContext();
    mockService.getRoute.mockResolvedValue(ROUTE_FIXTURE);
    const input = getRoute.input.parse({ routeId: '1_100259' });
    const result = await getRoute.handler(input, ctx);
    expect(result).toMatchObject({ id: '1_100259', shortName: '44' });
  });

  it('propagates not-found errors', async () => {
    const ctx = createMockContext();
    mockService.getRoute.mockRejectedValue(
      new McpError(-32001, 'route "bad_id" not found.', { id: 'bad_id' }),
    );
    const input = getRoute.input.parse({ routeId: 'bad_id' });
    await expect(getRoute.handler(input, ctx)).rejects.toThrow();
  });

  it('formats route with ID and agency', () => {
    const text = (getRoute.format!(ROUTE_FIXTURE)[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('44');
    expect(text).toContain('Metro Transit');
  });

  it('formats route with color and URL when present', () => {
    const withExtras = { ...ROUTE_FIXTURE, color: 'FF0000', url: 'https://example.com/44' };
    const text = (getRoute.format!(withExtras)[0] as { text: string }).text;
    expect(text).toContain('#FF0000');
    expect(text).toContain('https://example.com/44');
  });
});

// ---- listRoutesForAgency ----

describe('listRoutesForAgency', () => {
  it('returns routes for agency', async () => {
    const ctx = createMockContext();
    mockService.listRoutesForAgency.mockResolvedValue([ROUTE_FIXTURE]);
    const input = listRoutesForAgency.input.parse({ agencyId: '1' });
    const result = await listRoutesForAgency.handler(input, ctx);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]!.id).toBe('1_100259');
  });

  it('propagates not-found for invalid agency', async () => {
    const ctx = createMockContext();
    mockService.listRoutesForAgency.mockRejectedValue(
      new McpError(-32001, 'agency "bad" not found.', { id: 'bad' }),
    );
    const input = listRoutesForAgency.input.parse({ agencyId: 'bad' });
    await expect(listRoutesForAgency.handler(input, ctx)).rejects.toThrow();
  });

  it('formats route list with ID', () => {
    // listRoutesForAgency output drops agencyId/agencyName in the schema
    const routeRow = {
      id: '1_100259',
      shortName: '44',
      longName: 'Ballard - U-District',
      description: '',
      type: 3,
      color: null,
      url: null,
    };
    const text = (listRoutesForAgency.format!({ routes: [routeRow] })[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('44');
  });

  it('formats empty list', () => {
    const text = (listRoutesForAgency.format!({ routes: [] })[0] as { text: string }).text;
    expect(text).toMatch(/no routes/i);
  });
});

// ---- searchRoutes ----

describe('searchRoutes', () => {
  it('returns matching routes', async () => {
    const ctx = createMockContext();
    mockService.searchRoutes.mockResolvedValue([ROUTE_FIXTURE]);
    const input = searchRoutes.input.parse({ query: '44' });
    const result = await searchRoutes.handler(input, ctx);
    expect(result.routes).toHaveLength(1);
  });

  it('returns empty list when no match', async () => {
    const ctx = createMockContext();
    mockService.searchRoutes.mockResolvedValue([]);
    const input = searchRoutes.input.parse({ query: 'zzz_no_route' });
    const result = await searchRoutes.handler(input, ctx);
    expect(result.routes).toHaveLength(0);
  });

  it('formats empty result', () => {
    const text = (searchRoutes.format!({ routes: [] })[0] as { text: string }).text;
    expect(text).toMatch(/no routes/i);
  });

  it('formats route results with ID', () => {
    const routeRow = {
      id: '1_100259',
      shortName: '44',
      longName: '',
      description: '',
      agencyId: '1',
      agencyName: 'Metro Transit',
      type: 3,
    };
    const text = (searchRoutes.format!({ routes: [routeRow] })[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('44');
  });
});
