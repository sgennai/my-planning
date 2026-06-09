import { describe, it, expect } from 'vitest';
import { scheduleModuleBlocks } from './generator';
import type { AppDataV26 } from '../storage/types';

describe('generator module logic', () => {
  const baseData = {
    modules: [
      {
        id: 'mod-1',
        name: 'Test Generator',
        family: 'Test Family',
        type: 'generator',
        status: 'active',
        cadence: { frequency: 'weekly', durationMin: 60 },
      },
      {
        id: 'mod-2',
        name: 'Paused Generator',
        family: 'Test Family',
        type: 'generator',
        status: 'paused',
        cadence: { frequency: 'weekly', durationMin: 60 },
      },
      {
        id: 'mod-3',
        name: 'Native Module',
        family: 'Test Family',
        type: 'native',
        status: 'active',
      }
    ],
    scheduledBlocks: []
  } as unknown as AppDataV26;

  it('generates a block for an active generator module', () => {
    const nextData = scheduleModuleBlocks(baseData, 'mod-1', '2026-06-01T00:00:00Z');
    expect(nextData.scheduledBlocks.length).toBe(1);
    expect(nextData.scheduledBlocks[0].id).toBe('gen_mod-1_2026-06-01T00:00:00Z');
    expect(nextData.scheduledBlocks[0].title).toBe('Test Generator');
    expect(nextData.scheduledBlocks[0].origin).toBe('generator');
  });

  it('is idempotent when run twice for the same week', () => {
    const nextData = scheduleModuleBlocks(baseData, 'mod-1', '2026-06-01T00:00:00Z');
    const againData = scheduleModuleBlocks(nextData, 'mod-1', '2026-06-01T00:00:00Z');
    expect(againData.scheduledBlocks.length).toBe(1); // Should not duplicate
  });

  it('ignores paused generators', () => {
    const nextData = scheduleModuleBlocks(baseData, 'mod-2', '2026-06-01T00:00:00Z');
    expect(nextData.scheduledBlocks.length).toBe(0);
  });

  it('ignores non-generator modules', () => {
    const nextData = scheduleModuleBlocks(baseData, 'mod-3', '2026-06-01T00:00:00Z');
    expect(nextData.scheduledBlocks.length).toBe(0);
  });
});
