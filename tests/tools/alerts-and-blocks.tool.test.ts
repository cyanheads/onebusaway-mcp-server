/**
 * @fileoverview Tests for getAlert and getBlock tools, plus data.reason contract coverage.
 * @module tests/tools/alerts-and-blocks.tool.test
 */

import { McpError } from '@cyanheads/mcp-ts-core/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAlert } from '@/mcp-server/tools/definitions/get-alert.tool.js';
import { getBlock } from '@/mcp-server/tools/definitions/get-block.tool.js';
import { expectContentParity } from './format-parity.helper.js';
import { createToolContext } from './tool-context.helper.js';

vi.mock('@/services/onebusaway/onebusaway-service.js', () => ({
  getOneBusAwayService: vi.fn(),
}));

import { getOneBusAwayService } from '@/services/onebusaway/onebusaway-service.js';

const mockService = {
  getAlert: vi.fn(),
  getBlock: vi.fn(),
};

beforeEach(() => {
  vi.mocked(getOneBusAwayService).mockReturnValue(mockService as never);
  vi.clearAllMocks();
});

// ---- Fixtures ----

const ALERT_FIXTURE = {
  id: '1_sit_001',
  summary: 'Route 44 detour due to construction',
  description: 'Buses are detouring around NE 45th St.',
  reason: 'constructionActivity',
  severity: 'normalServiceLevel',
  consequenceMessage: 'Detour in effect',
  affects: [{ routeId: '1_100259' }, { stopId: '1_75403' }],
  consequences: [{ condition: 'detour', diversionStopIds: ['1_75404', '1_75405'] }],
  activeWindows: [{ from: 1700000000000, to: 1700086400000 }],
  url: 'https://kingcounty.gov/alerts/44',
};

const ALERT_SPARSE = {
  id: '1_sit_002',
  summary: 'Minor delay',
  description: null,
  reason: null,
  severity: null,
  consequenceMessage: null,
  affects: [],
  consequences: [],
  activeWindows: [],
  url: null,
};

const BLOCK_FIXTURE = {
  blockId: '1_block_101',
  activeServiceIds: ['1_svc_weekday'],
  inactiveServiceIds: [],
  trips: [
    {
      tripId: '1_trip_A',
      distanceAlongBlock: 0,
      accumulatedSlackTime: 0,
      blockStopTimes: [
        { stopId: '1_75400', arrivalTime: 32400, departureTime: 32400 },
        {
          stopId: '1_75403',
          arrivalTime: 32700,
          departureTime: 32760,
          pickupType: 0,
          dropOffType: 0,
        },
      ],
    },
    {
      tripId: '1_trip_B',
      distanceAlongBlock: 12000,
      accumulatedSlackTime: 300,
      blockStopTimes: [{ stopId: '1_75500', arrivalTime: 36000, departureTime: 36060 }],
    },
  ],
};

const BLOCK_SPARSE = {
  blockId: '1_block_sparse',
  activeServiceIds: [],
  inactiveServiceIds: ['1_svc_weekend'],
  trips: [
    {
      tripId: '1_trip_C',
      distanceAlongBlock: 0,
      accumulatedSlackTime: 0,
      blockStopTimes: [],
    },
  ],
};

// ---- getAlert ----

describe('getAlert', () => {
  it('returns alert detail for a valid situation ID', async () => {
    const ctx = createToolContext(getAlert);
    mockService.getAlert.mockResolvedValue(ALERT_FIXTURE);
    const input = getAlert.input.parse({ situationId: '1_sit_001' });
    const result = await getAlert.handler(input, ctx);
    expect(result).toMatchObject({
      id: '1_sit_001',
      summary: 'Route 44 detour due to construction',
      reason: 'constructionActivity',
    });
    expect(result.affects).toHaveLength(2);
    expect(result.consequences[0]).toMatchObject({ condition: 'detour' });
    expect(result.activeWindows).toHaveLength(1);
  });

  it('throws ctx.fail("situation_not_found") for unknown situation ID', async () => {
    const ctx = createToolContext(getAlert);
    mockService.getAlert.mockRejectedValue(
      new McpError(-32001, 'situation "bad_id" not found.', {
        id: 'bad_id',
        reason: 'situation_not_found',
      }),
    );
    const input = getAlert.input.parse({ situationId: 'bad_id' });
    await expect(getAlert.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'situation_not_found' },
    });
  });

  it('formats alert with summary, reason, affects, and windows', () => {
    const blocks = getAlert.format!(ALERT_FIXTURE);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('1_sit_001');
    expect(text).toContain('Route 44 detour');
    expect(text).toContain('constructionActivity');
    expect(text).toContain('route:1_100259');
    expect(text).toContain('stop:1_75403');
    expect(text).toContain('detour');
    expect(text).toContain('1_75404');
    // Every affects[] sub-field renders, with explicit "none" for absent scopes.
    expect(text).toContain('agency:none route:1_100259 stop:none trip:none');
    expectContentParity(blocks, ALERT_FIXTURE);
  });

  it('renders null optional fields as explicit "none", never omitted or "null"', () => {
    const blocks = getAlert.format!(ALERT_SPARSE);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('1_sit_002');
    expect(text).toContain('Minor delay');
    // Each null field is present with an explicit "none" so a content-only client
    // can tell an absent field from one that simply wasn't rendered.
    expect(text).toContain('**Description:** none');
    expect(text).toContain('**Reason:** none');
    expect(text).toContain('**Severity:** none');
    expect(text).toContain('**Consequence:** none');
    expect(text).toContain('**More info:** none');
    expect(text).not.toContain('null');
  });

  it('renders a consequence with absent condition/diversionStopIds as explicit "none"', () => {
    const sparseConsequence = { ...ALERT_FIXTURE, consequences: [{}] };
    const text = (getAlert.format!(sparseConsequence)[0] as { text: string }).text;
    expect(text).toContain('- none');
    expect(text).toContain('Diversion stops: none');
    expect(text).not.toContain('null');
  });
});

// ---- getBlock ----

describe('getBlock', () => {
  it('returns block schedule with trips and stop times', async () => {
    const ctx = createToolContext(getBlock);
    mockService.getBlock.mockResolvedValue(BLOCK_FIXTURE);
    const input = getBlock.input.parse({ blockId: '1_block_101' });
    const result = await getBlock.handler(input, ctx);
    expect(result.blockId).toBe('1_block_101');
    expect(result.trips).toHaveLength(2);
    expect(result.trips[0]!.tripId).toBe('1_trip_A');
    expect(result.trips[0]!.blockStopTimes).toHaveLength(2);
    expect(result.activeServiceIds).toContain('1_svc_weekday');
  });

  it('throws ctx.fail("block_not_found") for unknown block ID', async () => {
    const ctx = createToolContext(getBlock);
    mockService.getBlock.mockRejectedValue(
      new McpError(-32001, 'block "bad_block" not found.', {
        id: 'bad_block',
        reason: 'block_not_found',
      }),
    );
    const input = getBlock.input.parse({ blockId: 'bad_block' });
    await expect(getBlock.handler(input, ctx)).rejects.toMatchObject({
      data: { reason: 'block_not_found' },
    });
  });

  it('formats block with trip IDs and stop times', () => {
    const blocks = getBlock.format!(BLOCK_FIXTURE);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('1_block_101');
    expect(text).toContain('1_trip_A');
    expect(text).toContain('1_trip_B');
    expect(text).toContain('1_svc_weekday');
    expect(text).toContain('1_75403');
    // GTFS seconds-from-midnight: 32400 = 09:00
    expect(text).toContain('09:00');
    // Empty inactiveServiceIds renders explicitly, matching the activeServiceIds sibling.
    expect(text).toContain('**Inactive service IDs:** none');
    expectContentParity(blocks, BLOCK_FIXTURE);
  });

  it('formats sparse block — explicit-empty active service IDs, empty stop times', () => {
    const blocks = getBlock.format!(BLOCK_SPARSE);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('1_block_sparse');
    expect(text).toContain('1_trip_C');
    expect(text).toContain('1_svc_weekend');
    // Empty activeServiceIds renders explicitly rather than dropping the line.
    expect(text).toContain('**Active service IDs:** none');
    // No stop times to render — should not crash
    expect(text).not.toContain('undefined');
  });
});
