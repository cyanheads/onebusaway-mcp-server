/**
 * @fileoverview Shared content[] rendering helpers for tool `format()` functions,
 *   enforcing content/structuredContent parity: exact numeric rendering (never lossy
 *   `toFixed`/`Math.round`) and explicit null/empty state so a client reading only
 *   `content[]` sees every value a `structuredContent` client sees — including the
 *   difference between an absent field and a zero/empty one.
 * @module mcp-server/tools/format-helpers
 */

/**
 * Placeholder rendered for a null, undefined, or empty value. Matches the
 * codebase's existing `join(', ') || 'none'` convention (e.g. get-block's
 * `activeServiceIds`).
 */
export const EMPTY = 'none';

/**
 * Render a nullable scalar, or {@link EMPTY} when it is null, undefined, or an
 * empty string. Numeric `0` is a real value and renders as `"0"` — only null,
 * undefined, and `""` collapse to `none`. Pass `render` to wrap a present value
 * (e.g. a `#` colour prefix or a `°` unit suffix) so the affix never attaches to
 * the placeholder.
 */
export function orNone(
  value: string | number | null | undefined,
  render: (value: string | number) => string = String,
): string {
  return value == null || value === '' ? EMPTY : render(value);
}

/** Render a lat/lon pair at exact precision — never rounded through `toFixed`. */
export function coords(lat: number, lon: number): string {
  return `${lat}, ${lon}`;
}

/**
 * Render a position at exact precision, or {@link EMPTY} when it is null/undefined —
 * so an absent position is explicit rather than a missing line.
 */
export function coordsOrNone(position: { lat: number; lon: number } | null | undefined): string {
  return position == null ? EMPTY : coords(position.lat, position.lon);
}

/**
 * Join a list, or render {@link EMPTY} when it is empty. Mirrors the existing
 * `arr.join(', ') || 'none'` idiom so an empty collection is explicit.
 */
export function listOrNone(items: readonly string[], separator = ', '): string {
  return items.length > 0 ? items.join(separator) : EMPTY;
}
