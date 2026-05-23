/**
 * @fileoverview Tests for stop and route resources.
 * @module tests/resources/onebusaway.resource.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routeResource } from '@/mcp-server/resources/definitions/route.resource.js';
import { stopResource } from '@/mcp-server/resources/definitions/stop.resource.js';

vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = {
  getStop: vi.fn(),
  getRoute: vi.fn(),
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
  routeIds: ['1_100259'],
  wheelchairBoarding: 'ACCESSIBLE' as const,
};

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

// ---- stopResource ----

describe('stopResource', () => {
  it('returns stop data for valid stop ID', async () => {
    const ctx = createMockContext();
    mockService.getStop.mockResolvedValue(STOP_FIXTURE);
    const params = stopResource.params.parse({ stopId: '1_75403' });
    const result = await stopResource.handler(params, ctx);
    expect(result).toMatchObject({ id: '1_75403', name: 'University Way NE & NE 42nd St' });
  });

  it('propagates not-found errors from service', async () => {
    const ctx = createMockContext();
    mockService.getStop.mockRejectedValue(new Error('stop "bad_id" not found.'));
    const params = stopResource.params.parse({ stopId: 'bad_id' });
    await expect(stopResource.handler(params, ctx)).rejects.toThrow();
  });

  it('lists example resources', async () => {
    const listing = await stopResource.list!();
    expect(listing.resources).toBeInstanceOf(Array);
    expect(listing.resources.length).toBeGreaterThan(0);
    for (const r of listing.resources) {
      expect(r).toHaveProperty('uri');
      expect(r).toHaveProperty('name');
    }
  });

  it('list URIs use the onebusaway:// scheme', async () => {
    const listing = await stopResource.list!();
    for (const r of listing.resources) {
      expect(r.uri).toMatch(/^onebusaway:\/\/stop\//);
    }
  });
});

// ---- routeResource ----

describe('routeResource', () => {
  it('returns route data for valid route ID', async () => {
    const ctx = createMockContext();
    mockService.getRoute.mockResolvedValue(ROUTE_FIXTURE);
    const params = routeResource.params.parse({ routeId: '1_100259' });
    const result = await routeResource.handler(params, ctx);
    expect(result).toMatchObject({ id: '1_100259', shortName: '44' });
  });

  it('propagates not-found errors from service', async () => {
    const ctx = createMockContext();
    mockService.getRoute.mockRejectedValue(new Error('route "bad_id" not found.'));
    const params = routeResource.params.parse({ routeId: 'bad_id' });
    await expect(routeResource.handler(params, ctx)).rejects.toThrow();
  });

  it('lists example resources', async () => {
    const listing = await routeResource.list!();
    expect(listing.resources).toBeInstanceOf(Array);
    expect(listing.resources.length).toBeGreaterThan(0);
    for (const r of listing.resources) {
      expect(r).toHaveProperty('uri');
      expect(r).toHaveProperty('name');
    }
  });

  it('list URIs use the onebusaway:// scheme', async () => {
    const listing = await routeResource.list!();
    for (const r of listing.resources) {
      expect(r.uri).toMatch(/^onebusaway:\/\/route\//);
    }
  });
});
