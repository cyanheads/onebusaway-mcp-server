/**
 * @fileoverview Tests for onebusaway_get_stop_context. Runs the definition through
 *   `runToolContract` (input parse, handler, output parse, format, enrichment) on the
 *   real service, with only the onebusaway-sdk client mocked. Every SDK method
 *   rejects unless a test supplies a response, so nothing reaches the network.
 * @module tests/tools/stop-context.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStopContext } from '@/mcp-server/tools/definitions/get-stop-context.tool.js';
import { arrivalsFixture, loadFixture } from '../fixtures/load-fixture.helper.js';
import { contentText, expectContentParity } from './format-parity.helper.js';

const h = vi.hoisted(() => {
  class NotFoundError extends Error {}
  class RateLimitError extends Error {}
  class APIConnectionError extends Error {}
  class BadRequestError extends Error {}
  type SdkCall = (...args: unknown[]) => Promise<unknown>;
  const unmocked: SdkCall = () => Promise.reject(new Error('Unmocked OneBusAway SDK call'));
  const methods = {
    arrivalAndDeparture: { list: vi.fn<SdkCall>(unmocked) },
    stop: { retrieve: vi.fn<SdkCall>(unmocked) },
    get: vi.fn<SdkCall>(unmocked),
  };
  return { NotFoundError, RateLimitError, APIConnectionError, BadRequestError, methods };
});

vi.mock('onebusaway-sdk', () => {
  class MockSDK {
    constructor(_config: unknown) {
      Object.assign(this, h.methods);
    }
    static NotFoundError = h.NotFoundError;
    static RateLimitError = h.RateLimitError;
    static APIConnectionError = h.APIConnectionError;
    static BadRequestError = h.BadRequestError;
  }
  return { default: MockSDK };
});

import {
  disposeOneBusAwayService,
  getOneBusAwayService,
  initOneBusAwayService,
} from '@/services/onebusaway/onebusaway-service.js';

type Structured = {
  stop: Record<string, unknown> | null;
  currentTime: number;
  arrivals: Array<{ situationIds: string[] } & Record<string, unknown>>;
  alerts: Array<{ id: string } & Record<string, unknown>>;
  queriedStop: string;
  windowMinutes: { before: number; after: number };
  notice?: string;
};

const STOP_LEVEL = ['1_94118', '1_94915', '1_94111'];

beforeEach(() => {
  h.methods.arrivalAndDeparture.list.mockReset();
  h.methods.stop.retrieve.mockReset();
  h.methods.get.mockReset();
  initOneBusAwayService({
    apiKey: 'TEST',
    baseUrl: 'https://api.pugetsound.onebusaway.org',
    rateLimitRequests: 100,
    rateLimitWindowMs: 60_000,
    rateLimitMaxWaitMs: 1_000,
  });
});

afterEach(() => {
  disposeOneBusAwayService();
});

/** Runs the tool on `payload` as the one upstream response. */
async function run(payload: unknown, input: Record<string, unknown> = { stopId: '1_570' }) {
  h.methods.arrivalAndDeparture.list.mockResolvedValueOnce(payload);
  const result = await runToolContract(getStopContext, input as never);
  return {
    result,
    structured: result.structuredContent as Structured,
    text: contentText(result.content as Array<{ type: string; text?: string }>),
  };
}

describe('onebusaway_get_stop_context', () => {
  it('returns the stop, arrivals, and full alerts from exactly one upstream request', async () => {
    const { result, structured } = await run(arrivalsFixture());
    expect(result.isError).toBeFalsy();

    expect(h.methods.arrivalAndDeparture.list).toHaveBeenCalledTimes(1);
    expect(h.methods.arrivalAndDeparture.list).toHaveBeenCalledWith('1_570', {
      minutesBefore: 5,
      minutesAfter: 35,
    });
    expect(h.methods.get).not.toHaveBeenCalled();
    expect(h.methods.stop.retrieve).not.toHaveBeenCalled();

    // Equal to onebusaway_get_stop for 1_570, minus routeIds.
    expect(structured.stop).toEqual({
      id: '1_570',
      code: '570',
      name: '3rd Ave & Union St',
      lat: 47.608688,
      lon: -122.3367,
      direction: 'NW',
      wheelchairBoarding: 'ACCESSIBLE',
    });
    expect(structured.currentTime).toBe(1790307153437);
    expect(structured.arrivals).toHaveLength(3);
    expect(structured.queriedStop).toBe('1_570');
    expect(structured.windowMinutes).toEqual({ before: 5, after: 35 });
    expect(structured.notice).toBeUndefined();
  });

  it('maps arrivals exactly as onebusaway_get_arrivals does', async () => {
    const { structured } = await run(arrivalsFixture());
    h.methods.arrivalAndDeparture.list.mockResolvedValueOnce(arrivalsFixture());
    const arrivals = await getOneBusAwayService().getArrivals(
      { stopId: '1_570' },
      createMockContext(),
    );
    expect(structured.arrivals).toEqual(arrivals.arrivals);
  });

  it('includes stop-level alerts that no arrival in the window references', async () => {
    const payload = arrivalsFixture();
    expect(payload.data.entry.arrivalsAndDepartures.flatMap((a) => a.situationIds)).toEqual([]);
    const { structured, text } = await run(payload);
    expect(structured.alerts.map((a) => a.id)).toEqual(STOP_LEVEL);
    for (const id of STOP_LEVEL) expect(text).toContain(`(${id})`);
  });

  it('builds each alert with the onebusaway_get_alert mapper', async () => {
    const { structured } = await run(arrivalsFixture());
    h.methods.get.mockResolvedValueOnce(loadFixture('situation-1_94915.json'));
    const alert = await getOneBusAwayService().getAlert('1_94915', createMockContext());
    expect(structured.alerts.find((a) => a.id === '1_94915')).toEqual(alert);
  });

  it('lists an alert on both the stop and an arrival once', async () => {
    const payload = arrivalsFixture();
    payload.data.entry.arrivalsAndDepartures[0]!.situationIds = ['1_94915'];
    payload.data.entry.arrivalsAndDepartures[1]!.situationIds = ['1_94111', '1_94915'];
    const { structured } = await run(payload);
    expect(structured.alerts.map((a) => a.id)).toEqual(STOP_LEVEL);
    expect(structured.arrivals[1]!.situationIds).toEqual(['1_94111', '1_94915']);
  });

  it('includes an arrival-level alert the stop itself does not list', async () => {
    const payload = arrivalsFixture();
    payload.data.entry.situationIds = ['1_94118'];
    payload.data.entry.arrivalsAndDepartures[2]!.situationIds = ['1_94111'];
    const { structured } = await run(payload);
    expect(structured.alerts.map((a) => a.id)).toEqual(['1_94118', '1_94111']);
  });

  it('carries every structured value into content[]', async () => {
    const payload = arrivalsFixture();
    // Positive stopsAway renders verbatim; 0 and negatives render as "At stop" / "Arrived".
    payload.data.entry.arrivalsAndDepartures.forEach((a, i) => {
      a.numberOfStopsAway = i + 1;
    });
    payload.data.entry.arrivalsAndDepartures[0]!.situationIds = ['1_94915'];
    const { result, structured, text } = await run(payload);
    expectContentParity(result.content as Array<{ type: string; text?: string }>, structured);
    expect(text).toContain('## Stop');
    expect(text).toContain('## Arrivals (3)');
    expect(text).toContain('## Service Alerts (3)');
    expect(text).toContain('**Window:** −5 min / +35 min');
  });

  it('echoes a non-default window and forwards it upstream', async () => {
    const { structured } = await run(arrivalsFixture(), {
      stopId: '1_570',
      minutesBefore: 0,
      minutesAfter: 240,
    });
    expect(h.methods.arrivalAndDeparture.list).toHaveBeenCalledWith('1_570', {
      minutesBefore: 0,
      minutesAfter: 240,
    });
    expect(structured.windowMinutes).toEqual({ before: 0, after: 240 });
  });
});

describe('onebusaway_get_stop_context sparse payloads', () => {
  it('stop missing from references → stop: null plus a notice', async () => {
    const payload = arrivalsFixture();
    payload.data.references.stops = [];
    const { result, structured, text } = await run(payload);
    expect(result.isError).toBeFalsy();
    expect(structured.stop).toBeNull();
    expect(structured.arrivals).toHaveLength(3);
    expect(structured.notice).toMatch(/no details for stop 1_570/);
    expect(structured.notice).toContain('onebusaway_get_stop');
    expect(text).toContain('**Stop details:** none');
  });

  it('referenced situation missing from references → omitted plus a notice naming its ID', async () => {
    const payload = arrivalsFixture();
    payload.data.entry.situationIds = ['1_94915', '1_gone'];
    payload.data.entry.arrivalsAndDepartures[0]!.situationIds = ['1_also_gone'];
    const { structured } = await run(payload);
    expect(structured.alerts.map((a) => a.id)).toEqual(['1_94915']);
    expect(structured.notice).toContain('1_gone, 1_also_gone');
    expect(structured.notice).toContain('onebusaway_get_alert');
  });

  it('zero situations → alerts: [] rendered as none, with no notice', async () => {
    const payload = arrivalsFixture();
    payload.data.entry.situationIds = [];
    payload.data.references.situations = [];
    const { structured, text } = await run(payload);
    expect(structured.alerts).toEqual([]);
    expect(structured.notice).toBeUndefined();
    expect(text).toContain('## Service Alerts (0)');
    expect(text).toContain('**Alerts:** none');
  });

  it('no arrivals, no stop, and a missing alert → every notice segment survives in one notice', async () => {
    const payload = arrivalsFixture();
    payload.data.entry.arrivalsAndDepartures = [];
    payload.data.references.stops = [];
    payload.data.entry.situationIds = ['1_gone'];
    const { structured, text } = await run(payload);
    expect(structured.arrivals).toEqual([]);
    expect(structured.notice).toMatch(/no details for stop 1_570/);
    expect(structured.notice).toContain('1_gone');
    expect(structured.notice).toMatch(/No arrivals at 1_570/);
    expect(text).toContain('**Arrivals:** none');
    expect(text).toMatch(/No arrivals at 1_570/);
  });

  it('no arrivals below the 240 cap → the notice suggests increasing minutesAfter and names the cap', async () => {
    const payload = arrivalsFixture();
    payload.data.entry.arrivalsAndDepartures = [];
    const { structured, text } = await run(payload, { stopId: '1_570', minutesAfter: 239 });
    expect(structured.notice).toMatch(/(increas|widen)\w* minutesAfter/i);
    expect(structured.notice).toContain('240');
    expect(structured.notice).toContain('onebusaway_get_schedule_for_stop');
    expect(text).toContain(structured.notice!);
  });

  it('no arrivals at the 240 cap → the notice points only to the schedule tool', async () => {
    const payload = arrivalsFixture();
    payload.data.entry.arrivalsAndDepartures = [];
    const { structured, text } = await run(payload, { stopId: '1_570', minutesAfter: 240 });
    expect(structured.notice).toMatch(/No arrivals at 1_570/);
    expect(structured.notice).not.toMatch(/(increas|widen)\w* minutesAfter/i);
    expect(structured.notice).toContain('onebusaway_get_schedule_for_stop');
    expect(text).toContain(structured.notice!);
  });

  it('upstream omits entry.situationIds entirely → only arrival-level alerts', async () => {
    const payload = arrivalsFixture();
    delete (payload.data.entry as Partial<typeof payload.data.entry>).situationIds;
    payload.data.entry.arrivalsAndDepartures[1]!.situationIds = ['1_94111'];
    const { structured } = await run(payload);
    expect(structured.alerts.map((a) => a.id)).toEqual(['1_94111']);
    expect(structured.notice).toBeUndefined();
  });
});

describe('onebusaway_get_stop_context errors', () => {
  it('unknown stop → stop_not_found with a discovery hint', async () => {
    h.methods.arrivalAndDeparture.list.mockRejectedValueOnce(new h.NotFoundError('404'));
    const result = await runToolContract(getStopContext, { stopId: '1_99999999' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: JsonRpcErrorCode.NotFound,
        data: {
          reason: 'stop_not_found',
          recovery: { hint: expect.stringContaining('onebusaway_search_stops') },
        },
      },
    });
    expect(h.methods.arrivalAndDeparture.list).toHaveBeenCalledTimes(1);
  });

  it('SDK resolves no data → stop_not_found', async () => {
    h.methods.arrivalAndDeparture.list.mockResolvedValueOnce(null);
    const result = await runToolContract(getStopContext, { stopId: '1_99999999' });
    expect(result.structuredContent).toMatchObject({
      error: { code: JsonRpcErrorCode.NotFound, data: { reason: 'stop_not_found' } },
    });
  });

  it('an SDK call no test mocked rejects instead of reaching the network', async () => {
    const result = await runToolContract(getStopContext, { stopId: '1_570' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.structuredContent)).toContain('Unmocked OneBusAway SDK call');
  });

  it('upstream 429 → rate_limited, retryable', async () => {
    h.methods.arrivalAndDeparture.list.mockRejectedValueOnce(new h.RateLimitError('429'));
    const result = await runToolContract(getStopContext, { stopId: '1_570' });
    expect(result.structuredContent).toMatchObject({
      error: {
        code: JsonRpcErrorCode.RateLimited,
        data: { reason: 'rate_limited', retryable: true },
      },
    });
  });
});
