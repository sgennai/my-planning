import { describe, it, expect } from 'vitest';
import { migrate } from './migrations';

describe('Migrations', () => {
  it('migrates v24 interviewPrep to v25 practiceItems while preserving progress', () => {
    const oldData = {
      schemaVersion: 24,
      interviewPrep: {
        questions: [
          {
            id: 'ipq-med-1',
            categoryId: 'ipc-meddpicc',
            question: 'Walk me through how you use MEDDPICC in a complex deal.',
            status: 'practicing',
            confidence: 4,
            tags: ['ipc-meddpicc'],
            linkedStoryIds: ['story-123'],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            lastPracticedAt: '2026-06-01T00:00:00.000Z',
            nextPracticeAt: '2026-06-10T00:00:00.000Z',
            rehearsalCount: 2,
            answer: { raw: 'I use MEDDPICC all the time.' }
          }
        ],
        stories: [
          { id: 'story-123', title: 'The big deal' }
        ],
        categories: []
      },
      practiceItems: [],
      stories: []
    };

    const { data, migrated } = migrate(oldData);

    expect(migrated).toBe(true);
    expect(data.schemaVersion).toBe(25);
    expect(data.interviewPrep).toBeUndefined();
    
    // Check practice items
    expect(data.practiceItems.length).toBe(1);
    const item = data.practiceItems[0];
    expect(item.id).toBe('ipq-med-1');
    expect(item.track).toBe('interview');
    expect(item.prompt).toBe('Walk me through how you use MEDDPICC in a complex deal.');
    expect(item.status).toBe('practicing');
    expect(item.confidence).toBe(4);
    expect(item.lastPracticedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(item.nextPracticeAt).toBe('2026-06-10T00:00:00.000Z');
    expect(item.rehearsalCount).toBe(2);
    expect(item.answer.raw).toBe('I use MEDDPICC all the time.');
    expect(item.linkedStoryIds).toEqual(['story-123']);
    
    // Check stories
    expect(data.stories.length).toBe(1);
    expect(data.stories[0].id).toBe('story-123');
  });
});
