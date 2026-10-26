/**
 * @fileoverview Dependency documentation pruning must preserve runtime skill modules.
 * @module tests/scripts/clean-mcpb
 */
import { describe, expect, it } from 'vitest';
import { filterAgentDocEntries } from '../../scripts/clean-mcpb.js';
import { checkBundleEntries } from '../../scripts/lint-packaging.js';

describe('MCPB dependency documentation pruning', () => {
  it('removes dependency agent docs while retaining the published guide', () => {
    const docs = [
      'node_modules/example/skills/guide/SKILL.md',
      'node_modules/@scope/example/framework-skills/add-tool/SKILL.md',
      'node_modules/example/.claude/settings.json',
      'node_modules/example/.agents/config.json',
      'node_modules/example/docs/SKILL.md',
      'node_modules/outer/node_modules/@scope/inner/skills/guide/reference.md',
    ];
    expect(filterAgentDocEntries([...docs, 'skills/onebusaway-guide/SKILL.md'])).toEqual(docs);
  });

  it('preserves runtime skills directories in scoped and nested dependencies', () => {
    const runtime = [
      'node_modules/@modelcontextprotocol/server/dist/ext/skills/index.mjs',
      'node_modules/@modelcontextprotocol/server/dist/ext/skills/node.mjs',
      'node_modules/outer/node_modules/@modelcontextprotocol/server/dist/ext/skills/index.mjs',
      'node_modules/outer/node_modules/inner/node_modules/@scope/pkg/dist/skills/index.js',
      'node_modules/example/dist/framework-skills/runtime.js',
      'skills/onebusaway-guide/SKILL.md',
    ];
    expect(filterAgentDocEntries(runtime)).toEqual([]);
    expect(checkBundleEntries(runtime, 'fixture.mcpb')).toEqual([]);
  });
});
