/**
 * @fileoverview Shared flat schedule selector schemas and exact selection rendering.
 * @module mcp-server/tools/schedule-selection
 */

import { z } from '@cyanheads/mcp-ts-core';

/** GTFS selectors shared by route schedules and blocks. Blank trip IDs are omitted. */
export const tripSelectorFields = {
  tripId: z
    .string()
    .optional()
    .describe(
      'Exact trip ID; omit or leave blank for no trip selector. Mutually exclusive with departure bounds.',
    ),
  departureFromSec: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      'Inclusive departure lower bound in GTFS seconds from midnight; values beyond 86400 are valid.',
    ),
  departureBeforeSec: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      'Exclusive departure upper bound in GTFS seconds from midnight; must exceed departureFromSec when both are supplied.',
    ),
};

/** Stop selectors operate on individual departure rows in epoch milliseconds. */
export const stopSelectorFields = {
  routeId: z
    .string()
    .optional()
    .describe(
      'Exact route ID, combined with departure bounds; omit or leave blank for all routes.',
    ),
  departureFromMs: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Inclusive departure lower bound in Unix milliseconds.'),
  departureBeforeMs: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      'Exclusive departure upper bound in Unix milliseconds; must exceed departureFromMs when both are supplied.',
    ),
};

/** Counts are measured over one upstream response, before and after local selection. */
export const selectionCountFields = {
  total: z.number().int().nonnegative().describe('Count before local selection.'),
  returned: z.number().int().nonnegative().describe('Count after local selection.'),
};

/** Applied trip selectors and trip occurrence counts, present only when selection is used. */
export const tripSelectionSchema = z.object({ ...tripSelectorFields, ...selectionCountFields });

/** Applied stop selectors and departure-row counts, present only when selection is used. */
export const stopSelectionSchema = z.object({ ...stopSelectorFields, ...selectionCountFields });

/** Enforce exclusive exact-trip selection and increasing bounds without changing the flat schema. */
export function checkTripSelectors(
  input: {
    tripId?: string | undefined;
    departureFromSec?: number | undefined;
    departureBeforeSec?: number | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    input.tripId?.trim() &&
    (input.departureFromSec !== undefined || input.departureBeforeSec !== undefined)
  )
    ctx.addIssue({
      code: 'custom',
      path: ['tripId'],
      message: 'Use either tripId or departure bounds, not both.',
    });
  if (
    input.departureFromSec !== undefined &&
    input.departureBeforeSec !== undefined &&
    input.departureFromSec >= input.departureBeforeSec
  )
    ctx.addIssue({
      code: 'custom',
      path: ['departureBeforeSec'],
      message: 'departureBeforeSec must exceed departureFromSec.',
    });
}

/** Enforce increasing stop departure bounds. */
export function checkStopSelectors(
  input: { departureFromMs?: number | undefined; departureBeforeMs?: number | undefined },
  ctx: z.RefinementCtx,
): void {
  if (
    input.departureFromMs !== undefined &&
    input.departureBeforeMs !== undefined &&
    input.departureFromMs >= input.departureBeforeMs
  )
    ctx.addIssue({
      code: 'custom',
      path: ['departureBeforeMs'],
      message: 'departureBeforeMs must exceed departureFromMs.',
    });
}

/** Render every applied selector and count, including zero values. */
export function renderSelection(selection: Record<string, unknown>): string {
  return `**Selection:** ${Object.entries(selection)
    .filter(([key]) => key !== 'configurationCounts')
    .map(([key, value]) => `${key}: ${value}`)
    .join(' | ')}`;
}
