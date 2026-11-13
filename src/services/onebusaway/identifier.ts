/**
 * @fileoverview Validation and encoding for raw OneBusAway path IDs.
 * @module services/onebusaway/identifier
 */

import { z } from '@cyanheads/mcp-ts-core';
import { validationError } from '@cyanheads/mcp-ts-core/errors';

/** A single raw OneBusAway path identifier. */
export const oneBusAwayIdSchema = z
  .string()
  .regex(/^(?!\.{1,2}(?![\s\S])|[^/\\%?#]*[/\\%?#])[\u0020-\u007e\u00a0-\uffff]+(?![\s\S])/)
  .refine((id) => id.isWellFormed(), 'OneBusAway IDs must contain well-formed Unicode.');

/** Validates a raw ID and returns its URL path segment spelling. */
export function encodeOneBusAwayId(id: string): string {
  const result = oneBusAwayIdSchema.safeParse(id);
  if (!result.success) {
    throw validationError('Use a raw OneBusAway ID as returned by a discovery tool.', {
      retryable: false,
    });
  }
  return encodeURIComponent(result.data);
}
