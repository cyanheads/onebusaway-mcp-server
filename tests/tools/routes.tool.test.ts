/**
 * @fileoverview Tests for route-related tools: find-routes, get-route, list-routes-for-agency, search-routes.
 * @module tests/tools/routes.tool.test
 */

import { McpError } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, getEnrichment } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findRoutes } from '@/mcp-server/tools/definitions/find-routes.tool.js';
import { getRoute } from '@/mcp-server/tools/definitions/get-route.tool.js';
import { listRoutesForAgency } from '@/mcp-server/tools/definitions/list-routes-for-agency.tool.js';
import { searchRoutes } from '@/mcp-server/tools/definitions/search-routes.tool.js';
import { expectContentParity } from './format-parity.helper.js';

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
  it('returns nearby routes with limitExceeded flag', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue({ routes: [ROUTE_FIXTURE], limitExceeded: false });
    const input = findRoutes.input.parse({ lat: 47.6586, lon: -122.3146 });
    const result = await findRoutes.handler(input, ctx);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]!.id).toBe('1_100259');
    expect(result.limitExceeded).toBe(false);
  });

  it('enriches with count and no notice for successful results', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue({ routes: [ROUTE_FIXTURE], limitExceeded: false });
    const input = findRoutes.input.parse({ lat: 47.6586, lon: -122.3146 });
    await findRoutes.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.count).toBe(1);
    expect(enrichment.notice).toBeUndefined();
  });

  it('enriches with notice when no routes found', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue({ routes: [], limitExceeded: false });
    const input = findRoutes.input.parse({ lat: 47.6, lon: -122.3 });
    await findRoutes.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.count).toBe(0);
    expect(enrichment.notice).toMatch(/no routes/i);
  });

  it('enriches with truncation notice when limitExceeded', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue({ routes: [ROUTE_FIXTURE], limitExceeded: true });
    const input = findRoutes.input.parse({ lat: 47.6, lon: -122.3 });
    await findRoutes.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.notice).toMatch(/truncated/i);
  });

  it('echoes query in enrichment when filter provided', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue({ routes: [], limitExceeded: false });
    const input = findRoutes.input.parse({ lat: 47.6, lon: -122.3, query: '44' });
    await findRoutes.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.query).toBe('44');
  });

  it('passes query filter to service', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue({ routes: [], limitExceeded: false });
    const input = findRoutes.input.parse({ lat: 47.6, lon: -122.3, query: '44' });
    await findRoutes.handler(input, ctx);
    expect(mockService.findRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ query: '44' }),
      ctx,
    );
  });

  it('omits empty query from service call', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue({ routes: [], limitExceeded: false });
    const input = findRoutes.input.parse({ lat: 47.6, lon: -122.3, query: '' });
    await findRoutes.handler(input, ctx);
    expect(mockService.findRoutes).toHaveBeenCalledWith(
      expect.not.objectContaining({ query: expect.anything() }),
      ctx,
    );
  });

  it('sends latSpan/lonSpan bounding box instead of radius when both provided', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue({ routes: [], limitExceeded: false });
    const input = findRoutes.input.parse({ lat: 47.6, lon: -122.3, latSpan: 0.1, lonSpan: 0.2 });
    await findRoutes.handler(input, ctx);
    expect(mockService.findRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ latSpan: 0.1, lonSpan: 0.2 }),
      ctx,
    );
    expect(mockService.findRoutes).toHaveBeenCalledWith(
      expect.not.objectContaining({ radius: expect.anything() }),
      ctx,
    );
  });

  it('falls back to radius when only one span is provided', async () => {
    const ctx = createMockContext();
    mockService.findRoutes.mockResolvedValue({ routes: [], limitExceeded: false });
    const input = findRoutes.input.parse({ lat: 47.6, lon: -122.3, latSpan: 0.1 });
    await findRoutes.handler(input, ctx);
    expect(mockService.findRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ radius: 500 }),
      ctx,
    );
  });

  it('formats routes with ID, agency, explicit-none color/url, and parity', () => {
    const output = { routes: [ROUTE_FIXTURE], limitExceeded: false };
    const content = findRoutes.format!(output);
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('44');
    expect(text).toContain('Metro Transit');
    // null color/url render explicitly, never omitted or as "null"
    expect(text).toContain('**Color:** none');
    expect(text).toContain('**Schedule URL:** none');
    expect(text).not.toContain('null');
    expectContentParity(content, output);
  });

  it('formats empty result', () => {
    const text = (findRoutes.format!({ routes: [], limitExceeded: false })[0] as { text: string })
      .text;
    expect(text).toMatch(/no routes/i);
  });

  it('shows truncation notice in format when limitExceeded', () => {
    const text = (
      findRoutes.format!({ routes: [ROUTE_FIXTURE], limitExceeded: true })[0] as { text: string }
    ).text;
    expect(text).toMatch(/truncated|narrow/i);
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

  it('formats route with ID, agency, explicit-none color/url, and parity', () => {
    const content = getRoute.format!(ROUTE_FIXTURE);
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('44');
    expect(text).toContain('Metro Transit');
    // null color/url render explicitly, never omitted, as "#null", or "null"
    expect(text).toContain('**Color:** none');
    expect(text).toContain('**Schedule URL:** none');
    expect(text).not.toContain('#none');
    expect(text).not.toContain('null');
    expectContentParity(content, ROUTE_FIXTURE);
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
  it('returns routes for agency with limitExceeded flag', async () => {
    const ctx = createMockContext();
    mockService.listRoutesForAgency.mockResolvedValue({
      routes: [ROUTE_FIXTURE],
      limitExceeded: false,
    });
    const input = listRoutesForAgency.input.parse({ agencyId: '1' });
    const result = await listRoutesForAgency.handler(input, ctx);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]!.id).toBe('1_100259');
    expect(result.limitExceeded).toBe(false);
  });

  it('enriches with agencyId and count', async () => {
    const ctx = createMockContext();
    mockService.listRoutesForAgency.mockResolvedValue({
      routes: [ROUTE_FIXTURE],
      limitExceeded: false,
    });
    const input = listRoutesForAgency.input.parse({ agencyId: '1' });
    await listRoutesForAgency.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.agencyId).toBe('1');
    expect(enrichment.count).toBe(1);
  });

  it('propagates not-found for invalid agency', async () => {
    const ctx = createMockContext();
    mockService.listRoutesForAgency.mockRejectedValue(
      new McpError(-32001, 'agency "bad" not found.', { id: 'bad' }),
    );
    const input = listRoutesForAgency.input.parse({ agencyId: 'bad' });
    await expect(listRoutesForAgency.handler(input, ctx)).rejects.toThrow();
  });

  it('throws with data.reason "agency_not_found" from classifyError', async () => {
    const ctx = createMockContext({ errors: listRoutesForAgency.errors });
    mockService.listRoutesForAgency.mockRejectedValue(
      new McpError(-32001, 'agency "bad" not found.', { id: 'bad', reason: 'agency_not_found' }),
    );
    const input = listRoutesForAgency.input.parse({ agencyId: 'bad' });
    await expect(listRoutesForAgency.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'agency_not_found' },
    });
  });

  it('enriches with notice when route list is empty (#14)', async () => {
    const ctx = createMockContext();
    mockService.listRoutesForAgency.mockResolvedValue({ routes: [], limitExceeded: false });
    const input = listRoutesForAgency.input.parse({ agencyId: 'empty_agency' });
    await listRoutesForAgency.handler(input, ctx);
    const { getEnrichment } = await import('@cyanheads/mcp-ts-core/testing');
    const enrichment = getEnrichment(ctx);
    expect(enrichment.count).toBe(0);
    expect(enrichment.notice).toBeDefined();
    expect(enrichment.notice).toMatch(/no routes|verify/i);
  });

  it('enriches with truncation notice when limitExceeded', async () => {
    const ctx = createMockContext();
    mockService.listRoutesForAgency.mockResolvedValue({
      routes: [ROUTE_FIXTURE],
      limitExceeded: true,
    });
    const input = listRoutesForAgency.input.parse({ agencyId: '1' });
    await listRoutesForAgency.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.notice).toMatch(/truncated/i);
  });

  it('formats route list with ID, explicit-none optional fields, and parity', () => {
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
    const output = { routes: [routeRow], limitExceeded: false };
    const content = listRoutesForAgency.format!(output);
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('44');
    // empty description and null color/url all render explicitly
    expect(text).toContain('**Description:** none');
    expect(text).toContain('**Color:** none');
    expect(text).toContain('**Schedule URL:** none');
    expect(text).not.toContain('null');
    expectContentParity(content, output);
  });

  it('formats empty list', () => {
    const text = (
      listRoutesForAgency.format!({ routes: [], limitExceeded: false })[0] as { text: string }
    ).text;
    expect(text).toMatch(/no routes/i);
  });

  it('shows truncation notice in format when limitExceeded', () => {
    const routeRow = {
      id: '1_100259',
      shortName: '44',
      longName: 'Ballard - U-District',
      description: '',
      type: 3,
      color: null,
      url: null,
    };
    const text = (
      listRoutesForAgency.format!({ routes: [routeRow], limitExceeded: true })[0] as {
        text: string;
      }
    ).text;
    expect(text).toMatch(/truncated/i);
  });
});

// ---- searchRoutes ----

describe('searchRoutes', () => {
  it('returns matching routes with limitExceeded flag', async () => {
    const ctx = createMockContext();
    mockService.searchRoutes.mockResolvedValue({ routes: [ROUTE_FIXTURE], limitExceeded: false });
    const input = searchRoutes.input.parse({ query: '44' });
    const result = await searchRoutes.handler(input, ctx);
    expect(result.routes).toHaveLength(1);
    expect(result.limitExceeded).toBe(false);
  });

  it('enriches with query and count', async () => {
    const ctx = createMockContext();
    mockService.searchRoutes.mockResolvedValue({ routes: [ROUTE_FIXTURE], limitExceeded: false });
    const input = searchRoutes.input.parse({ query: '44' });
    await searchRoutes.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.query).toBe('44');
    expect(enrichment.count).toBe(1);
    expect(enrichment.notice).toBeUndefined();
  });

  it('enriches with notice when no match', async () => {
    const ctx = createMockContext();
    mockService.searchRoutes.mockResolvedValue({ routes: [], limitExceeded: false });
    const input = searchRoutes.input.parse({ query: 'zzz_no_route' });
    await searchRoutes.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.count).toBe(0);
    expect(enrichment.notice).toBeDefined();
  });

  it('enriches with truncation notice when limitExceeded', async () => {
    const ctx = createMockContext();
    mockService.searchRoutes.mockResolvedValue({ routes: [ROUTE_FIXTURE], limitExceeded: true });
    const input = searchRoutes.input.parse({ query: '44' });
    await searchRoutes.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.notice).toMatch(/truncated/i);
  });

  it('returns empty list when no match', async () => {
    const ctx = createMockContext();
    mockService.searchRoutes.mockResolvedValue({ routes: [], limitExceeded: false });
    const input = searchRoutes.input.parse({ query: 'zzz_no_route' });
    const result = await searchRoutes.handler(input, ctx);
    expect(result.routes).toHaveLength(0);
  });

  it('formats empty result', () => {
    const text = (searchRoutes.format!({ routes: [], limitExceeded: false })[0] as { text: string })
      .text;
    expect(text).toMatch(/no routes/i);
  });

  it('formats route results with ID, explicit-none empty description, and parity', () => {
    const routeRow = {
      id: '1_100259',
      shortName: '44',
      longName: '',
      description: '',
      agencyId: '1',
      agencyName: 'Metro Transit',
      type: 3,
    };
    const output = { routes: [routeRow], limitExceeded: false };
    const content = searchRoutes.format!(output);
    const text = (content[0] as { text: string }).text;
    expect(text).toContain('1_100259');
    expect(text).toContain('44');
    // empty description renders explicitly rather than dropping the line
    expect(text).toContain('**Description:** none');
    expect(text).not.toContain('null');
    expectContentParity(content, output);
  });

  it('shows truncation notice in format when limitExceeded', () => {
    const routeRow = {
      id: '1_100259',
      shortName: '44',
      longName: '',
      description: '',
      agencyId: '1',
      agencyName: 'Metro Transit',
      type: 3,
    };
    const text = (
      searchRoutes.format!({ routes: [routeRow], limitExceeded: true })[0] as { text: string }
    ).text;
    expect(text).toMatch(/truncated|maxCount/i);
  });
});
