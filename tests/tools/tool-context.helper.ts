/**
 * @fileoverview Typed mock-context factory for tool handler tests.
 * @module tests/tools/tool-context.helper
 */

import type { ErrorContract } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';

/** Creates a mock context carrying the definition's typed error contract. */
export function createToolContext<
  const TErrors extends readonly ErrorContract[] | undefined,
>(definition: { errors?: TErrors }) {
  return createMockContext({ errors: definition.errors });
}
