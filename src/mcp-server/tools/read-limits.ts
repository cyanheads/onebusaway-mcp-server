/**
 * @fileoverview Read limit schemas, applied values, and clamp reporting.
 * @module mcp-server/tools/read-limits
 */

import type { Context, z } from '@cyanheads/mcp-ts-core';
import { createCounter } from '@cyanheads/mcp-ts-core/utils';

export const readCaps = {
  stops: 3500,
  routes: 6000,
  radius: 1600,
  minutesBefore: 60,
  minutesAfter: 240,
} as const;

const clamps = createCounter(
  'onebusaway.input.clamped',
  'Read inputs reduced to their caps',
  '{inputs}',
);
const strictFields = new WeakMap<z.ZodType, z.ZodType>();

/** Advertise a hard maximum in strict mode and the applied limit in either mode. */
export function readLimit(
  schema: z.ZodNumber,
  cap: number,
  fallback: number,
  description: string,
  integer = false,
) {
  function describe(number: z.ZodNumber) {
    const field = integer ? number.refine(Number.isInteger, 'Expected an integer') : number;
    const described = field.default(fallback).describe(description);
    return integer ? described.meta({ type: 'integer' }) : described;
  }
  const field = describe(schema);
  strictFields.set(field, describe(schema.max(cap)));
  return field;
}

/** Select the strict input before registration, after the framework loads the environment. */
export function enforceReadLimits(definition: { input: z.ZodObject }): void {
  const input = definition.input;
  const overrides: z.ZodRawShape = Object.fromEntries(
    Object.entries(input.shape).flatMap(([key, field]) => {
      const strict = strictFields.get(field);
      return strict ? [[key, strict]] : [];
    }),
  );
  definition.input = input.extend(overrides);
}

/** Tell callers to raise the effective count only when there is room to do so. */
export function truncatedSearchAdvice(applied: number, ceiling: number): string {
  return applied < ceiling
    ? `Results truncated. Raise maxCount up to ${ceiling} or refine the query.`
    : 'Results truncated at the search cap. Refine the query to see more matches.';
}

/** Return an applied value and collect a caller-visible notice for each reduction. */
export function applyReadLimit(
  field: 'maxCount' | 'radius' | 'minutesBefore' | 'minutesAfter',
  requested: number,
  cap: number,
  ctx: Pick<Context, 'log'>,
  notices: string[],
): number {
  if (requested <= cap) return requested;

  ctx.log.warning('Read input clamped', { field, requested, applied: cap });
  clamps.add(1, { 'onebusaway.input.field': field });
  notices.push(`${field} was reduced from ${requested} to ${cap}.`);
  return cap;
}
