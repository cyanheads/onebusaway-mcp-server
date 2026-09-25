/**
 * @fileoverview Loads recorded OneBusAway API responses from `tests/fixtures/`.
 *   Each call parses the file afresh, so a test can mutate its copy freely.
 *   `arrivals-and-departures-1_570.json` is a live Puget Sound response for stop
 *   1_570 (3rd Ave & Union St), trimmed to three arrivals and the queried stop;
 *   `situation-1_94915.json` is the live `/situation/1_94915.json` response.
 * @module tests/fixtures/load-fixture.helper
 */

import { readFileSync } from 'node:fs';

type Keyed = { id: string } & Record<string, unknown>;

/** The parts of a recorded arrivals-and-departures-for-stop response the tests reshape. */
export interface ArrivalsFixture {
  currentTime: number;
  data: {
    entry: {
      arrivalsAndDepartures: Array<
        { routeId: string; situationIds: string[]; tripId: string } & Record<string, unknown>
      >;
      situationIds: string[];
      stopId: string;
    };
    references: { situations: Keyed[]; stops: Keyed[] } & Record<string, unknown>;
  };
}

/** Parses `tests/fixtures/<name>` into a fresh object. */
export function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')) as T;
}

/** A fresh copy of the recorded 1_570 arrivals response. */
export const arrivalsFixture = () =>
  loadFixture<ArrivalsFixture>('arrivals-and-departures-1_570.json');
