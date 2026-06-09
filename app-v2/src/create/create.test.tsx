import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateScreen } from './CreateScreen';

describe('WP-7 Create Pipeline Transition', () => {
  it('adds an idea to the ideas pipeline', () => {
    const data = { create: { ideas: [], posts: [] }, scheduledBlocks: [] } as any;
    const onPersist = vi.fn();
    render(<CreateScreen data={data} onPersist={onPersist} />);
    
    // Add idea
    const addButton = screen.getByText('+');
    fireEvent.click(addButton);
    
    expect(onPersist).toHaveBeenCalled();
    const newData = onPersist.mock.calls[0][0];
    expect(newData.create.ideas).toHaveLength(1);
    expect(newData.create.ideas[0].hook).toBe('New Hook');
  });

  it('drafting with claude copies text and moves idea to drafting post', async () => {
    const idea = { id: 'idea-1', hook: 'My Hook', angle: 'My Angle', createdAt: '', updatedAt: '' };
    const data = { create: { ideas: [idea], posts: [] }, scheduledBlocks: [] } as any;
    const onPersist = vi.fn();
    
    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    window.alert = vi.fn();

    render(<CreateScreen data={data} onPersist={onPersist} />);
    
    const draftButton = screen.getByText('Draft with Claude (Copy)');
    fireEvent.click(draftButton);

    await waitFor(() => {
      expect(onPersist).toHaveBeenCalled();
      const newData = onPersist.mock.calls[0][0];
      expect(newData.create.ideas).toHaveLength(0); // idea consumed
      expect(newData.create.posts).toHaveLength(1);
      expect(newData.create.posts[0].status).toBe('drafting');
      expect(newData.create.posts[0].title).toBe('My Hook');
    });
  });
});
