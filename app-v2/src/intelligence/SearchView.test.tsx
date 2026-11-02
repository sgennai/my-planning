// @vitest-environment jsdom
// Search over a large archive: it is read for searching a slice at a time,
// saying so meanwhile, and only once; the count says what is still to come.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SearchView } from './SearchView';
import { parseEdition } from './parse';
import { NO_FILTERS } from './search';
import type { FeedState } from './library';
import { CHALLENGE_DOC, CHALLENGE_FILE } from './test-fixtures';

const editions = Array.from({ length: 400 }, (_, i) => parseEdition('enterprise-ai-challenge',
  { ...CHALLENGE_FILE, id: `1Archive${String(i).padStart(4, '0')}000000000000` }, CHALLENGE_DOC));
const states = (pending = 0): Partial<Record<FeedState['feedId'], FeedState>> => ({
  'enterprise-ai-challenge': { feedId: 'enterprise-ai-challenge', editions, missing: [], status: 'ready', message: null, refreshedAt: null, pending },
});
const view = (pending?: number) => render(
  <SearchView states={states(pending)} query="" filters={NO_FILTERS} onQuery={vi.fn()} onFilters={vi.fn()} onOpen={vi.fn()} today="2026-11-02" loading={false} />,
);

describe('searching a large archive', () => {
  it('reads it a slice at a time, then searches all of it, at once the next time', async () => {
    view();
    expect(screen.getByRole('status')).toHaveTextContent(/^Preparing the search: \d+ of 400 editions read…$/);
    expect(await screen.findByText(/All 400 editions · every edition on this device searched/)).toBeInTheDocument();
    cleanup();
    view(25);
    expect(screen.getByRole('status')).toHaveTextContent('All 400 editions · searched 400 of 425; 25 not downloaded yet');
  });
});
