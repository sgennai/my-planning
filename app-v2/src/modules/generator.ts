import type { AppDataV24, Module, TimeBlock } from '../storage/types';

export function scheduleModuleBlocks(
  data: AppDataV24,
  moduleId: string,
  weekStartIso: string
): AppDataV24 {
  const module = data.modules?.find((m) => m.id === moduleId);
  if (!module || module.type !== 'generator' || module.status !== 'active' || !module.cadence) {
    return data;
  }

  // Create deterministic ID using weekStart string to ensure idempotency across devices
  const deterministicId = `gen_${moduleId}_${weekStartIso}`;

  // Check if block already exists
  const existingBlock = data.scheduledBlocks?.find((b) => b.id === deterministicId);
  if (existingBlock) {
    return data;
  }

  // Generate the new block
  // If preferredDay is specified we could compute exact offset from weekStart, 
  // but for simplicity we'll just schedule it on the weekStart date 
  // (the user can drag/drop it to the preferred day in the UI).
  const newBlock: TimeBlock = {
    id: deterministicId,
    title: module.name,
    start: weekStartIso, // Start of week, can be dragged
    durationMin: module.cadence.durationMin || 60,
    category: module.family, // using family as category
    origin: 'generator',
    refId: moduleId,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...data,
    scheduledBlocks: [...(data.scheduledBlocks || []), newBlock],
  };
}
