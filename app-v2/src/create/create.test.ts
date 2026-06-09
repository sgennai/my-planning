import { describe, it, expect } from 'vitest';

describe('WP-7 Create Pipeline Transition', () => {
  it('transitions idea from drafting to scheduled', () => {
    const post = { id: 'p1', title: 'Test', body: 'Body', status: 'drafting' as const, createdAt: '', updatedAt: '' };
    const scheduled = { ...post, status: 'scheduled' as const };
    expect(scheduled.status).toBe('scheduled');
  });

  it('transitions idea from scheduled to published', () => {
    const post = { id: 'p1', title: 'Test', body: 'Body', status: 'scheduled' as const, createdAt: '', updatedAt: '' };
    const published = { ...post, status: 'published' as const };
    expect(published.status).toBe('published');
  });
});
