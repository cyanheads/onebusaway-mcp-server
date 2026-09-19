/**
 * @fileoverview Tests for the server config schema — env var mapping, defaults,
 * and the framework's empty-string-reads-as-unset normalization.
 * @module tests/config/server-config.test
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Loads a fresh copy of the config module under the given environment.
 * `getServerConfig()` memoizes, so each case needs its own module instance.
 */
async function loadConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const { getServerConfig } = await import('@/config/server-config.js');
  return getServerConfig();
}

const RATE_LIMIT_VARS = {
  ONEBUSAWAY_RATE_LIMIT_REQUESTS: undefined,
  ONEBUSAWAY_RATE_LIMIT_WINDOW_MS: undefined,
  ONEBUSAWAY_RATE_LIMIT_MAX_WAIT_MS: undefined,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('rate-limit pacing config (#25)', () => {
  it('defaults to the shared key budget: 20 requests per 60 s, 45 s queue wait cap', async () => {
    const config = await loadConfig(RATE_LIMIT_VARS);
    expect(config.rateLimitRequests).toBe(20);
    expect(config.rateLimitWindowMs).toBe(60_000);
    // Must stay under the SDK client's 60 s request timeout.
    expect(config.rateLimitMaxWaitMs).toBe(45_000);
    expect(config.rateLimitMaxWaitMs).toBeLessThan(60_000);
  });

  it('reads explicit values from the environment', async () => {
    const config = await loadConfig({
      ONEBUSAWAY_RATE_LIMIT_REQUESTS: '5',
      ONEBUSAWAY_RATE_LIMIT_WINDOW_MS: '30000',
      ONEBUSAWAY_RATE_LIMIT_MAX_WAIT_MS: '10000',
    });
    expect(config.rateLimitRequests).toBe(5);
    expect(config.rateLimitWindowMs).toBe(30_000);
    expect(config.rateLimitMaxWaitMs).toBe(10_000);
  });

  it('treats an empty string as unset and takes the default', async () => {
    const config = await loadConfig({
      ONEBUSAWAY_RATE_LIMIT_REQUESTS: '',
      ONEBUSAWAY_RATE_LIMIT_WINDOW_MS: '',
      ONEBUSAWAY_RATE_LIMIT_MAX_WAIT_MS: '',
    });
    expect(config.rateLimitRequests).toBe(20);
    expect(config.rateLimitWindowMs).toBe(60_000);
    expect(config.rateLimitMaxWaitMs).toBe(45_000);
  });
});
