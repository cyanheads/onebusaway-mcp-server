/**
 * @fileoverview Tests for stop-related tools: find-stops, get-stop, search-stops.
 * @module tests/tools/stops.tool.test
 */

import { McpError } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, getEnrichment } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findStops } from '@/mcp-server/tools/definitions/find-stops.tool.js';
import { getStop } from '@/mcp-server/tools/definitions/get-stop.tool.js';
import { searchStops } from '@/mcp-server/tools/definitions/search-stops.tool.js';

vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = {
  findStops: vi.fn(),
  getStop: vi.fn(),
  searchStops: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
  vi.clearAllMocks();
});

const STOP_FIXTURE = {
  id: '1_75403',
  code: '75403',
  name: 'University Way NE & NE 42nd St',
  lat: 47.6586,
  lon: -122.3146,
  direction: 'N',
  routeIds: ['1_100259', '1_100262'],
  wheelchairBoarding: 'ACCESSIBLE' as const,
};

// ---- findStops ----

describe('findStops', () => {
  it('returns nearby stops with limitExceeded', async () => {
    const ctx = createMockContext();
    mockService.findStops.mockResolvedValue({ stops: [STOP_FIXTURE], limitExceeded: false });
    const input = findStops.input.parse({ lat: 47.6586, lon: -122.3146 });
    const result = await findStops.handler(input, ctx);
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0]!.id).toBe('1_75403');
    expect(result.limitExceeded).toBe(false);
  });

  it('enriches with count and no notice for successful results', async () => {
    const ctx = createMockContext();
    mockService.findStops.mockResolvedValue({ stops: [STOP_FIXTURE], limitExceeded: false });
    const input = findStops.input.parse({ lat: 47.6586, lon: -122.3146 });
    await findStops.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.count).toBe(1);
    expect(enrichment.notice).toBeUndefined();
  });

  it('enriches with notice when no stops found', async () => {
    const ctx = createMockContext();
    mockService.findStops.mockResolvedValue({ stops: [], limitExceeded: false });
    const input = findStops.input.parse({ lat: 47.6, lon: -122.3 });
    await findStops.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.count).toBe(0);
    expect(enrichment.notice).toMatch(/no stops/i);
  });

  it('enriches with notice when limitExceeded', async () => {
    const ctx = createMockContext();
    mockService.findStops.mockResolvedValue({ stops: [STOP_FIXTURE], limitExceeded: true });
    const input = findStops.input.parse({ lat: 47.6, lon: -122.3 });
    await findStops.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.notice).toMatch(/truncated/i);
  });

  it('echoes query in enrichment when filter provided', async () => {
    const ctx = createMockContext();
    mockService.findStops.mockResolvedValue({ stops: [], limitExceeded: false });
    const input = findStops.input.parse({ lat: 47.6, lon: -122.3, query: '75403' });
    await findStops.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.query).toBe('75403');
  });

  it('passes query filter to service when provided', async () => {
    const ctx = createMockContext();
    mockService.findStops.mockResolvedValue({ stops: [], limitExceeded: false });
    const input = findStops.input.parse({ lat: 47.6, lon: -122.3, query: '75403' });
    await findStops.handler(input, ctx);
    expect(mockService.findStops).toHaveBeenCalledWith(
      expect.objectContaining({ query: '75403' }),
      ctx,
    );
  });

  it('omits empty query string from service call', async () => {
    const ctx = createMockContext();
    mockService.findStops.mockResolvedValue({ stops: [], limitExceeded: false });
    const input = findStops.input.parse({ lat: 47.6, lon: -122.3, query: '' });
    await findStops.handler(input, ctx);
    expect(mockService.findStops).toHaveBeenCalledWith(
      expect.not.objectContaining({ query: expect.anything() }),
      ctx,
    );
  });

  it('formats stops with ID and wheelchair status', () => {
    const output = { stops: [STOP_FIXTURE], limitExceeded: false };
    const blocks = findStops.format!(output);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('1_75403');
    expect(text).toContain('75403');
    expect(text).toContain('ACCESSIBLE');
    expect(text).toContain('1_100259');
  });

  it('shows truncation notice when limitExceeded', () => {
    const output = { stops: [STOP_FIXTURE], limitExceeded: true };
    const text = (findStops.format!(output)[0] as { text: string }).text;
    expect(text).toMatch(/truncated|narrow/i);
  });
});

// ---- getStop ----

describe('getStop', () => {
  it('returns stop details', async () => {
    const ctx = createMockContext();
    mockService.getStop.mockResolvedValue(STOP_FIXTURE);
    const input = getStop.input.parse({ stopId: '1_75403' });
    const result = await getStop.handler(input, ctx);
    expect(result).toMatchObject({ id: '1_75403', name: 'University Way NE & NE 42nd St' });
  });

  it('propagates not-found errors', async () => {
    const ctx = createMockContext();
    mockService.getStop.mockRejectedValue(
      new McpError(-32001, 'stop "bad_id" not found.', { id: 'bad_id' }),
    );
    const input = getStop.input.parse({ stopId: 'bad_id' });
    await expect(getStop.handler(input, ctx)).rejects.toThrow();
  });

  it('formats stop with ID, code, and routes', () => {
    const blocks = getStop.format!(STOP_FIXTURE);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('1_75403');
    expect(text).toContain('75403');
    expect(text).toContain('1_100259');
    expect(text).toContain('ACCESSIBLE');
  });

  it('formats sparse stop — missing direction and routes', () => {
    const sparse = {
      ...STOP_FIXTURE,
      direction: '',
      routeIds: [],
      wheelchairBoarding: 'UNKNOWN' as const,
    };
    const text = (getStop.format!(sparse)[0] as { text: string }).text;
    expect(text).toContain('1_75403');
    expect(text).toContain('UNKNOWN');
  });
});

// ---- searchStops ----

describe('searchStops', () => {
  it('returns matching stops', async () => {
    const ctx = createMockContext();
    mockService.searchStops.mockResolvedValue([STOP_FIXTURE]);
    const input = searchStops.input.parse({ query: '75403' });
    const result = await searchStops.handler(input, ctx);
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0]!.id).toBe('1_75403');
  });

  it('enriches with query and count', async () => {
    const ctx = createMockContext();
    mockService.searchStops.mockResolvedValue([STOP_FIXTURE]);
    const input = searchStops.input.parse({ query: '75403' });
    await searchStops.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.query).toBe('75403');
    expect(enrichment.count).toBe(1);
    expect(enrichment.notice).toBeUndefined();
  });

  it('enriches with notice when no matches', async () => {
    const ctx = createMockContext();
    mockService.searchStops.mockResolvedValue([]);
    const input = searchStops.input.parse({ query: 'nowhere' });
    await searchStops.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(enrichment.count).toBe(0);
    expect(enrichment.notice).toMatch(/no stops|no match/i);
  });

  it('returns empty list when no matches', async () => {
    const ctx = createMockContext();
    mockService.searchStops.mockResolvedValue([]);
    const input = searchStops.input.parse({ query: 'nowhere' });
    const result = await searchStops.handler(input, ctx);
    expect(result.stops).toHaveLength(0);
  });

  it('formats empty results', () => {
    const text = (searchStops.format!({ stops: [] })[0] as { text: string }).text;
    expect(text).toMatch(/no stops/i);
  });

  it('formats stop results with ID', () => {
    const text = (searchStops.format!({ stops: [STOP_FIXTURE] })[0] as { text: string }).text;
    expect(text).toContain('1_75403');
  });
});
