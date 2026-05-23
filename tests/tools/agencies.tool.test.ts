/**
 * @fileoverview Tests for list-agencies tool.
 * @module tests/tools/agencies.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAgencies } from '@/mcp-server/tools/definitions/list-agencies.tool.js';

vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = {
  listAgencies: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
  vi.clearAllMocks();
});

describe('listAgencies', () => {
  it('returns agencies from service', async () => {
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
    ]);
    const input = listAgencies.input.parse({});
    const result = await listAgencies.handler(input, ctx);
    expect(result.agencies).toHaveLength(1);
    expect(result.agencies[0]).toMatchObject({ id: '1', name: 'Metro Transit' });
  });

  it('returns empty agencies when none found', async () => {
    const ctx = createMockContext();
    mockService.listAgencies.mockResolvedValue([]);
    const input = listAgencies.input.parse({});
    const result = await listAgencies.handler(input, ctx);
    expect(result.agencies).toHaveLength(0);
  });

  it('propagates service errors', async () => {
    const ctx = createMockContext();
    mockService.listAgencies.mockRejectedValue(new Error('Service unavailable'));
    const input = listAgencies.input.parse({});
    await expect(listAgencies.handler(input, ctx)).rejects.toThrow();
  });

  it('formats agencies with ID and timezone', () => {
    const output = {
      agencies: [
        {
          id: '1',
          name: 'Metro Transit',
          url: 'https://kingcounty.gov/metro',
          phone: '206-553-3000',
          timezone: 'America/Los_Angeles',
          coverageCenter: { lat: 47.6062, lon: -122.3321 },
          coverageSpan: { latSpan: 0.5, lonSpan: 0.8 },
        },
      ],
    };
    const blocks = listAgencies.format!(output);
    expect(blocks[0]!.type).toBe('text');
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('Metro Transit');
    expect(text).toContain('1');
    expect(text).toContain('America/Los_Angeles');
  });

  it('formats empty agencies list', () => {
    const blocks = listAgencies.format!({ agencies: [] });
    expect((blocks[0] as { text: string }).text).toContain('No agencies');
  });
});
