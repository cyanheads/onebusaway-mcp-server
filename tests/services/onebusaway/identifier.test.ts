/**
 * @fileoverview Upstream request-path coverage for raw OneBusAway IDs.
 * @module tests/services/onebusaway/identifier.test
 */

import { threadCpuUsage } from 'node:process';
import { z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import type OnebusawaySDK from 'onebusaway-sdk';
import { describe, expect, it, vi } from 'vitest';
import { oneBusAwayIdSchema } from '@/services/onebusaway/identifier.js';
import { OneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

type SdkFetch = NonNullable<NonNullable<ConstructorParameters<typeof OnebusawaySDK>[0]>['fetch']>;

const fetch = vi.hoisted(() =>
  vi.fn<SdkFetch>(async () => {
    throw new Error('Request captured at SDK fetch boundary.');
  }),
);

vi.mock('onebusaway-sdk', async (importOriginal) => {
  const { default: SDK } = await importOriginal<typeof import('onebusaway-sdk')>();
  return {
    default: class extends SDK {
      constructor(options: ConstructorParameters<typeof OnebusawaySDK>[0]) {
        super({ ...options, fetch });
      }
    },
  };
});

const pathCalls = [
  ['stop', (service, id, ctx) => service.getStop(id, ctx)],
  ['route', (service, id, ctx) => service.getRoute(id, ctx)],
  ['trip-details', (service, id, ctx) => service.getTrip({ tripId: id }, ctx)],
  ['block', (service, id, ctx) => service.getBlock(id, ctx)],
  ['situation', (service, id, ctx) => service.getAlert(id, ctx)],
  ['routes-for-agency', (service, id, ctx) => service.listRoutesForAgency(id, ctx)],
  ['vehicles-for-agency', (service, id, ctx) => service.getVehicles({ agencyId: id }, ctx)],
  ['schedule-for-stop', (service, id, ctx) => service.getScheduleForStop({ stopId: id }, ctx)],
  ['schedule-for-route', (service, id, ctx) => service.getScheduleForRoute({ routeId: id }, ctx)],
  [
    'arrivals-and-departures-for-stop',
    (service, id, ctx) => service.getArrivals({ stopId: id }, ctx),
  ],
] satisfies [
  string,
  (
    service: OneBusAwayService,
    id: string,
    ctx: ReturnType<typeof createMockContext>,
  ) => Promise<unknown>,
][];

describe('OneBusAway SDK path IDs', () => {
  it.each([
    ['digits', (size: number) => '1'.repeat(size)],
    ['terminal line break', (size: number) => `${'1'.repeat(size - 2)}\nx`],
    ['repeated line breaks', (size: number) => ' \r\n'.repeat(Math.ceil(size / 3)).slice(0, size)],
  ])(
    'bounds ID validation CPU as %s input grows',
    (_shape, makeInput) => {
      function cpuMicrosPerParse(input: string) {
        const calls = Math.max(3, Math.ceil(1_000_000 / input.length));
        const start = threadCpuUsage();
        for (let call = 0; call < calls; call++) oneBusAwayIdSchema.safeParse(input);
        const { user, system } = threadCpuUsage(start);
        return (user + system) / calls;
      }

      const baseline = makeInput(5_000);
      cpuMicrosPerParse(baseline);
      for (let size = 10_000; size <= 320_000; size *= 2) {
        const input = makeInput(size);
        const pairs = Array.from({ length: 5 }, () => {
          const small = cpuMicrosPerParse(baseline);
          const large = cpuMicrosPerParse(input);
          return { large, ratio: large / small };
        });
        expect(Math.min(...pairs.map(({ large }) => large))).toBeLessThan(10_000);
        expect(Math.min(...pairs.map(({ ratio }) => ratio))).toBeLessThan(4 * (size / 5_000));
      }
    },
    0,
  );

  it('advertises the flagless path grammar', () => {
    const { pattern } = z.toJSONSchema(oneBusAwayIdSchema);
    if (typeof pattern !== 'string') throw new Error('Expected an advertised ID pattern.');
    const advertised = new RegExp(pattern);
    expect(advertised.test('unitrans_..x é🚌:+')).toBe(true);
    expect(advertised.test('.\u2028')).toBe(true);
    expect(advertised.test('1_100225\n')).toBe(false);
    expect(advertised.test('1_%31%30')).toBe(false);
    expect(advertised.test('..')).toBe(false);
  });

  function requestPath() {
    const request = fetch.mock.calls[0]?.[0];
    if (typeof request !== 'string') throw new Error('Expected an SDK URL string.');
    return new URL(request).pathname;
  }

  function stubRequest() {
    fetch.mockClear();
    const service = new OneBusAwayService({
      apiKey: 'TEST',
      baseUrl: 'https://upstream.invalid',
      rateLimitRequests: 100,
      rateLimitWindowMs: 1_000,
      rateLimitMaxWaitMs: 1_000,
    });
    return { fetch, service };
  }

  it.each(pathCalls)('keeps the canonical ID on %s', async (endpoint, call) => {
    const { fetch, service } = stubRequest();
    try {
      await expect(call(service, 'unitrans_L', createMockContext())).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(requestPath()).toBe(`/api/where/${endpoint}/unitrans_L.json`);
    } finally {
      service.dispose();
    }
  });

  it.each(pathCalls)('encodes the raw ID once on %s', async (endpoint, call) => {
    const { fetch, service } = stubRequest();
    try {
      await expect(call(service, 'unitrans_..x é🚌:+', createMockContext())).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(requestPath()).toBe(
        `/api/where/${endpoint}/unitrans_..x%20%C3%A9%F0%9F%9A%8C%3A%2B.json`,
      );
    } finally {
      service.dispose();
    }
  });

  it.each(pathCalls)('rejects separators before dispatch on %s', async (_endpoint, call) => {
    const { fetch, service } = stubRequest();
    try {
      await expect(async () =>
        call(service, '../stop/1_9133', createMockContext()),
      ).rejects.toMatchObject({ code: JsonRpcErrorCode.ValidationError });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      service.dispose();
    }
  });

  it.each([
    '',
    '.',
    '..',
    '1_%31%30',
    'x\\y',
    'x?y',
    'x#y',
    'x\n',
    'x\u007f',
    'x\u009f',
    '\ud800',
    '\udfff',
  ])('rejects invalid raw ID %j in the schema and service', async (id) => {
    const { fetch, service } = stubRequest();
    try {
      expect(oneBusAwayIdSchema.safeParse(id).success).toBe(false);
      await expect(service.getRoute(id, createMockContext())).rejects.toMatchObject({
        code: JsonRpcErrorCode.ValidationError,
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      service.dispose();
    }
  });
});
