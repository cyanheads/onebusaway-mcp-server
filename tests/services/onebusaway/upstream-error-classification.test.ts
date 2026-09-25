/**
 * @fileoverview Upstream HTTP error classification through the real onebusaway-sdk
 *   and the real service. A loopback HTTP server stands in for OneBusAway, so the
 *   SDK's own status → error-class mapping and the service's `classifyError` both
 *   run exactly as in production; nothing leaves the machine.
 * @module tests/services/onebusaway/upstream-error-classification.test
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { JsonRpcErrorCode, McpError } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ServerConfig } from '@/config/server-config.js';
import { getArrivals } from '@/mcp-server/tools/definitions/get-arrivals.tool.js';
import {
  disposeOneBusAwayService,
  getOneBusAwayService,
  initOneBusAwayService,
} from '@/services/onebusaway/onebusaway-service.js';
import { contentText } from '../../tools/format-parity.helper.js';

/** Upstream bodies keyed by the status the loopback server answers with. */
const RESPONSES: Record<number, unknown> = {
  400: { fieldErrors: { minutesAfter: ['Invalid field value for field "minutesAfter".'] } },
  404: { code: 404, currentTime: 1790307416461, text: 'resource not found', version: 2 },
  429: { code: 429, text: 'rate limit exceeded' },
  500: { code: 500, text: 'internal error' },
};

/** Every request path carries the status to answer with as its last segment, e.g. `/…/400.json`. */
let upstream: Server;
let baseUrl: string;

beforeAll(async () => {
  upstream = createServer((req, res) => {
    const status = Number(/\/(\d{3})\.json/.exec(req.url ?? '')?.[1]);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(RESPONSES[status]));
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

afterEach(() => {
  disposeOneBusAwayService();
});

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    apiKey: 'TEST',
    baseUrl,
    rateLimitRequests: 100,
    rateLimitWindowMs: 60_000,
    rateLimitMaxWaitMs: 1_000,
    ...overrides,
  };
}

/** Resolves a service promise to the rejected McpError. */
async function caught(promise: Promise<unknown>): Promise<McpError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(McpError);
  return err as McpError;
}

describe('classification of upstream failures (current behavior)', () => {
  it('HTTP 404 → NotFound carrying the contract reason and discovery hint', async () => {
    initOneBusAwayService(config());
    const err = await caught(
      getOneBusAwayService().getArrivals({ stopId: '404' }, createMockContext()),
    );
    expect(err.code).toBe(JsonRpcErrorCode.NotFound);
    expect(err.data).toMatchObject({ reason: 'stop_not_found', id: '404' });
  });

  it('HTTP 429 → RateLimited, retryable', async () => {
    initOneBusAwayService(config());
    const err = await caught(
      getOneBusAwayService().getArrivals({ stopId: '429' }, createMockContext()),
    );
    expect(err.code).toBe(JsonRpcErrorCode.RateLimited);
    expect(err.data).toMatchObject({ reason: 'rate_limited', retryable: true, retryAfter: 5 });
  });

  it('HTTP 500 → ServiceUnavailable', async () => {
    initOneBusAwayService(config());
    const err = await caught(
      getOneBusAwayService().getArrivals({ stopId: '500' }, createMockContext()),
    );
    expect(err.code).toBe(JsonRpcErrorCode.ServiceUnavailable);
    expect(err.message).toContain('OneBusAway API error: 500');
  });

  it('connection refused → ServiceUnavailable naming the connection failure', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    initOneBusAwayService(config({ baseUrl: `http://127.0.0.1:${port}` }));
    const err = await caught(
      getOneBusAwayService().getArrivals({ stopId: '1_570' }, createMockContext()),
    );
    expect(err.code).toBe(JsonRpcErrorCode.ServiceUnavailable);
    expect(err.message).toBe('Cannot connect to OneBusAway API.');
  });
});

describe('HTTP 400 from upstream (#30)', () => {
  it.each([
    [
      'getArrivals',
      () => getOneBusAwayService().getArrivals({ stopId: '400' }, createMockContext()),
    ],
    ['getTrip', () => getOneBusAwayService().getTrip({ tripId: '400' }, createMockContext())],
  ])('%s: 400 → non-retryable ValidationError carrying the field errors', async (_name, call) => {
    initOneBusAwayService(config());
    const err = await caught(call());
    expect(err.code).toBe(JsonRpcErrorCode.ValidationError);
    expect(err.data).toMatchObject({ retryable: false });
    expect(err.message).toContain('Invalid field value for field \\"minutesAfter\\".');
    expect(err.message).not.toMatch(/unavailable/i);
  });

  it('reaches both client surfaces of a tool call as a non-retryable validation error', async () => {
    initOneBusAwayService(config());
    const result = await runToolContract(getArrivals, { stopId: '400' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.ValidationError, data: { retryable: false } },
    });
    const text = contentText(result.content as Array<{ type: string; text?: string }>);
    expect(text).toContain('fieldErrors');
    expect(text).toContain('not retryable');
    expect(text).toMatch(/Recovery: Correct the input/);
  });
});
