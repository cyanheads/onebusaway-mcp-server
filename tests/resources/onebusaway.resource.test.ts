/**
 * @fileoverview Tests for stop and route resources.
 * @module tests/resources/onebusaway.resource.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { createWorkerHandler } from '@cyanheads/mcp-ts-core/worker';
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

/** Resource list callbacks receive the SDK's request-scoped context shape. */
function createResourceListContext(): Parameters<NonNullable<typeof stopResource.list>>[0] {
  return createMockContext() as unknown as Parameters<NonNullable<typeof stopResource.list>>[0];
}

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
  routes: [{ id: '1_100259', shortName: '44', agencyId: '1' }],
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

it.each([
  [stopResource, 'stopId'],
  [routeResource, 'routeId'],
] as const)('$0.name accepts raw opaque IDs and rejects escaped aliases', (definition, field) => {
  expect(definition.params?.safeParse({ [field]: 'agency_山 1.2' }).success).toBe(true);
  expect(definition.params?.safeParse({ [field]: '1_%31' }).success).toBe(false);
});

describe('resource reads through the SDK', () => {
  async function read(uri: string) {
    const server = createWorkerHandler({
      resources: [stopResource, routeResource],
      sessionMode: 'stateless',
      decodeResourceParams: true,
    });
    const request = new Request('https://example.test/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-11-25',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri } }),
    });
    const response = await server.fetch(request, { MCP_AUTH_MODE: 'none' }, {} as never);
    expect(response.status).toBe(200);
    const data = (await response.text()).split('\n').find((line) => line.startsWith('data: '));
    expect(data).toBeDefined();
    return JSON.parse(data!.slice('data: '.length)) as unknown;
  }

  it.each(['Metro_Å. 3', 'Metro_%C3%85.%203'])(
    'preserves the route resource URI segment %s',
    async (segment) => {
      mockService.getRoute.mockResolvedValue({ ...ROUTE_FIXTURE, id: 'Metro_Å. 3' });
      const body = await read(`onebusaway://route/${segment}`);
      expect(mockService.getRoute).toHaveBeenCalledWith('Metro_Å. 3', expect.anything());
      expect(body).toMatchObject({
        result: {
          contents: [expect.objectContaining({ text: expect.stringContaining('Metro_Å. 3') })],
        },
      });
    },
  );

  it('returns route summaries in the stop resource JSON', async () => {
    mockService.getStop.mockResolvedValue(STOP_FIXTURE);
    const body = await read('onebusaway://stop/1_7540%33');
    expect(mockService.getStop).toHaveBeenCalledWith('1_75403', expect.anything());
    expect(body).toMatchObject({
      result: {
        contents: [expect.objectContaining({ text: JSON.stringify(STOP_FIXTURE, null, 2) })],
      },
    });
  });

  it.each(['1_%2F', '1_%2531'])('rejects %s before dispatch', async (segment) => {
    const body = await read(`onebusaway://stop/${segment}`);
    expect(body).toMatchObject({ error: { code: JsonRpcErrorCode.ValidationError } });
    expect(getOneBusAwayService).not.toHaveBeenCalled();
  });
});

it('preserves the display titles of the concrete resource listings', async () => {
  const server = createWorkerHandler({
    resources: [stopResource, routeResource],
    sessionMode: 'stateless',
  });
  const request = new Request('https://example.test/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'resources/list' }),
  });
  const response = await server.fetch(request, { MCP_AUTH_MODE: 'none' }, {} as never);
  expect(response.status).toBe(200);
  const data = (await response.text()).split('\n').find((line) => line.startsWith('data: '));
  expect(data).toBeDefined();
  const body: unknown = JSON.parse(data!.slice('data: '.length));
  expect(body).toMatchObject({
    result: {
      resources: expect.arrayContaining([
        expect.objectContaining({ uri: 'onebusaway://stop/1_75403', title: 'OneBusAway Stop' }),
        expect.objectContaining({ uri: 'onebusaway://route/1_100259', title: 'OneBusAway Route' }),
      ]),
    },
  });
});

// ---- stopResource ----

describe('stopResource', () => {
  it('returns stop data for valid stop ID', async () => {
    const ctx = createMockContext();
    mockService.getStop.mockResolvedValue(STOP_FIXTURE);
    const params = stopResource.params!.parse({ stopId: '1_75403' });
    const result = await stopResource.handler(params, ctx);
    expect(result).toMatchObject({ id: '1_75403', name: 'University Way NE & NE 42nd St' });
  });

  it('propagates not-found errors from service', async () => {
    const ctx = createMockContext();
    mockService.getStop.mockRejectedValue(new Error('stop "bad_id" not found.'));
    const params = stopResource.params!.parse({ stopId: 'bad_id' });
    await expect(stopResource.handler(params, ctx)).rejects.toThrow();
  });

  it('lists example resources', async () => {
    const listing = await stopResource.list!(createResourceListContext());
    expect(listing.resources).toBeInstanceOf(Array);
    expect(listing.resources.length).toBeGreaterThan(0);
    for (const r of listing.resources) {
      expect(r).toHaveProperty('uri');
      expect(r).toHaveProperty('name');
    }
  });

  it('list URIs use the onebusaway:// scheme', async () => {
    const listing = await stopResource.list!(createResourceListContext());
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
    const params = routeResource.params!.parse({ routeId: '1_100259' });
    const result = await routeResource.handler(params, ctx);
    expect(result).toMatchObject({ id: '1_100259', shortName: '44' });
  });

  it('propagates not-found errors from service', async () => {
    const ctx = createMockContext();
    mockService.getRoute.mockRejectedValue(new Error('route "bad_id" not found.'));
    const params = routeResource.params!.parse({ routeId: 'bad_id' });
    await expect(routeResource.handler(params, ctx)).rejects.toThrow();
  });

  it('lists example resources', async () => {
    const listing = await routeResource.list!(createResourceListContext());
    expect(listing.resources).toBeInstanceOf(Array);
    expect(listing.resources.length).toBeGreaterThan(0);
    for (const r of listing.resources) {
      expect(r).toHaveProperty('uri');
      expect(r).toHaveProperty('name');
    }
  });

  it('list URIs use the onebusaway:// scheme', async () => {
    const listing = await routeResource.list!(createResourceListContext());
    for (const r of listing.resources) {
      expect(r.uri).toMatch(/^onebusaway:\/\/route\//);
    }
  });
});
