/**
 * @fileoverview Shared test helper asserting content[]/structuredContent value parity.
 *   A tool exposes the same data on two surfaces — `structuredContent` (typed by
 *   `output`) and the rendered `content[]` text (from `format()`). This walks every
 *   material value in the structured result and asserts it appears verbatim in the
 *   text, so a client that reads only `content[]` loses nothing — no rounded
 *   coordinate, no dropped field.
 * @module tests/tools/format-parity.helper
 */

import { expect } from 'vitest';

type ContentBlock = { type: string; text?: string };

/** Concatenate the text of every text block returned by a `format()` call. */
export function contentText(content: readonly ContentBlock[]): string {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n');
}

/**
 * Assert every material leaf in `structured` (non-empty string, finite number, or
 * boolean) is represented verbatim in the rendered `content[]` text. This proves
 * exact-value fidelity: a `toFixed`-rounded coordinate or a `Math.round`-ed distance
 * fails because the exact structured value is absent from the text.
 *
 * Null, undefined, empty strings, and empty arrays are skipped by design — explicit
 * null/empty rendering ("none") is asserted by the targeted cases in each test file,
 * not here. Callers therefore choose fixtures whose values all render verbatim; avoid
 * values a formatter fully rewrites (e.g. getArrivals renders `stopsAway` 0 as
 * "At stop", so use a positive value in parity fixtures).
 */
export function expectContentParity(content: readonly ContentBlock[], structured: unknown): void {
  const text = contentText(content);
  for (const { path, value } of materialLeaves(structured)) {
    expect(
      text.includes(String(value)),
      `structuredContent ${path} = ${JSON.stringify(value)} has no representation in content[]:\n\n${text}`,
    ).toBe(true);
  }
}

type Leaf = { path: string; value: string | number | boolean };

/** Yield every primitive leaf worth asserting, with a `$.a.b[0]` path for diagnostics. */
function* materialLeaves(value: unknown, path = '$'): Generator<Leaf> {
  if (value == null) return;
  if (typeof value === 'string') {
    if (value.length > 0) yield { path, value };
    return;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) yield { path, value };
    return;
  }
  if (typeof value === 'boolean') {
    yield { path, value };
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* materialLeaves(value[i], `${path}[${i}]`);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      yield* materialLeaves(child, `${path}.${key}`);
    }
  }
}
