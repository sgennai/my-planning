// @vitest-environment jsdom
// The section against a stand-in /api/intel and the app's data: an edition
// from Drive on the screen, Today, reading state and Takeaways kept in the
// synced data, and the failures (Drive not connected, a document that
// breaks the rules) that must not take the section down.
import 'fake-indexeddb/auto';
import { useEffect, useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { IntelligenceScreen } from './IntelligenceScreen';
import { _closeLibrary } from './library';
import { savedOf } from './saved';
import { readingIndex } from './reading';
import { CHALLENGE_DOC, CHALLENGE_FILE } from './test-fixtures';

let docText: string;
let files: (typeof CHALLENGE_FILE)[];
let texts: Record<string, string>;
let mode: 'ok' | 'not-configured';
let phone = false;
let confirmAnswer = true;

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: query.includes('max-width: 600px') ? phone : false,
  addEventListener() {}, removeEventListener() {},
}));
vi.stubGlobal('confirm', vi.fn(() => confirmAnswer));
Element.prototype.scrollTo = function scrollTo() {};
vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (mode === 'not-configured') {
    return Response.json({ error: { code: 'not-configured', message: 'Google Drive is not connected yet.' } }, { status: 503 });
  }
  if (url === '/api/intel/feeds/enterprise-ai-challenge') return Response.json({ files });
  if (url.startsWith('/api/intel/feeds/')) return Response.json({ files: [] });
  const id = url.split('/').pop()!;
  return Response.json({ file: files.find(f => f.id === id), text: texts[id] ?? docText });
}));

type Data = { progressLog: unknown[]; content: unknown[] };
let latest: Data;

/** The app's part: holds the data and applies each edit, as persist does. */
function App({ initial = { progressLog: [], content: [] } as Data }) {
  const [data, setData] = useState<Data>(initial);
  useEffect(() => { latest = data; }, [data]);
  return <IntelligenceScreen data={data} onPersist={m => setData(d => m(d as never) as unknown as Data)} />;
}

const openChallenge = async () => {
  fireEvent.click(await screen.findByRole('tab', { name: /AI Challenge/ }));
  return screen.findByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' });
};

beforeEach(async () => {
  _closeLibrary();
  await new Promise<void>(res => { const r = indexedDB.deleteDatabase('my-planning-intel'); r.onsuccess = r.onerror = () => res(); });
  localStorage.clear();
  docText = CHALLENGE_DOC;
  // Created well before now, so no grace period is running.
  files = [{ ...CHALLENGE_FILE, createdTime: '2026-01-02T07:20:30.000Z', modifiedTime: '2026-01-02T07:20:32.000Z' }];
  texts = {};
  mode = 'ok';
  phone = false;
  confirmAnswer = true;
});
afterEach(cleanup);

describe('the Intelligence section', () => {
  it('opens on Today: the newest edition of each feed, with a few of its own words', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Teams are deploying AI agents faster than anyone can list them.')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(await screen.findByText('No edition yet: Enterprise AI, Customer Engagement.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /AI Challenge/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('lists the edition, unread, in its feed', async () => {
    render(<App />);
    await openChallenge();
    const listed = screen.getByRole('button', { name: /Mon 2 Nov · 08:20/ });
    expect(listed).toHaveAttribute('aria-current', 'true');
    expect(within(listed).getByLabelText('Unread')).toBeInTheDocument();
  });

  it('Mark as read is kept in the synced data, and undone the same way', async () => {
    render(<App />);
    await openChallenge();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    expect(readingIndex(latest.progressLog).get(CHALLENGE_FILE.id)?.readAt).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Mon 2 Nov/ })).queryByLabelText('Unread')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Read. Mark as unread' }));
    expect(readingIndex(latest.progressLog).get(CHALLENGE_FILE.id)?.readAt).toBeNull();
  });

  it('saves a question to Takeaways with where it came from, and finds it again', async () => {
    render(<App />);
    await openChallenge();
    fireEvent.click(screen.getByRole('button', { name: 'Save Opening question to Takeaways' }));
    expect(screen.getByRole('button', { name: 'Opening question: saved to Takeaways. Remove' })).toBeInTheDocument();
    const [item] = savedOf(latest.content);
    expect(item).toMatchObject({ kind: 'labelled', label: 'Opening question', editionTitle: 'Agent Sprawl: Who Owns the Bots?' });

    fireEvent.click(screen.getByRole('tab', { name: /Takeaways/ }));
    expect(screen.getByText('"How many AI agents are running in your organisation today?"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Note and tags for Opening question' }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Ask the CIO' } });
    fireEvent.change(screen.getByLabelText('Tags, separated by commas'), { target: { value: 'banking, agents' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(savedOf(latest.content)[0]).toMatchObject({ note: 'Ask the CIO', tags: ['banking', 'agents'] });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Takeaways' }), { target: { value: 'cio' } });
    expect(screen.getByText('Ask the CIO')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Takeaways' }), { target: { value: 'nothing like it' } });
    expect(screen.getByText(/Nothing in Takeaways matches/)).toBeInTheDocument();
  });

  it('removing from Takeaways asks first', async () => {
    render(<App />);
    await openChallenge();
    fireEvent.click(screen.getByRole('button', { name: 'Save edition to Takeaways' }));
    fireEvent.click(screen.getByRole('tab', { name: /Takeaways/ }));
    confirmAnswer = false;
    fireEvent.click(screen.getByRole('button', { name: 'Remove Agent Sprawl: Who Owns the Bots? from Takeaways' }));
    expect(window.confirm).toHaveBeenLastCalledWith('Remove “Agent Sprawl: Who Owns the Bots?” from Takeaways?');
    expect(savedOf(latest.content)).toHaveLength(1);
    confirmAnswer = true;
    fireEvent.click(screen.getByRole('button', { name: 'Remove Agent Sprawl: Who Owns the Bots? from Takeaways' }));
    expect(savedOf(latest.content)).toHaveLength(0);
    expect(screen.getByText('Nothing kept yet')).toBeInTheDocument();
  });

  it('a saved item leads back to its edition', async () => {
    render(<App />);
    await openChallenge();
    fireEvent.click(screen.getByRole('button', { name: 'Save the section Business impact to Takeaways' }));
    fireEvent.click(screen.getByRole('tab', { name: /Takeaways/ }));
    fireEvent.click(screen.getByRole('button', { name: /AI Challenge · Mon 2 Nov · Agent Sprawl/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
  });

  it('text selected in an edition can be saved as a passage', async () => {
    render(<App />);
    await openChallenge();
    const words = screen.getByText('Duplicated agents multiply licence costs.');
    const range = document.createRange();
    range.selectNodeContents(words);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    fireEvent(document, new Event('selectionchange'));
    fireEvent.click(await screen.findByRole('button', { name: 'Save to Takeaways' }));
    expect(savedOf(latest.content)[0]).toMatchObject({ kind: 'passage', text: 'Duplicated agents multiply licence costs.', sectionTitle: 'Business impact' });
  });

  it('a feed with no editions yet says so', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 2, name: 'Agent Sprawl: Who Owns the Bots?' });
    fireEvent.click(screen.getByRole('tab', { name: 'Enterprise AI' }));
    expect(await screen.findByText('No editions yet')).toBeInTheDocument();
  });

  it('says when Google Drive is not connected', async () => {
    mode = 'not-configured';
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /AI Challenge/ }));
    expect(await screen.findByText("Google Drive isn't connected")).toBeInTheDocument();
  });

  it('keeps the copy it has when Drive goes away, and says so', async () => {
    const first = render(<App />);
    await openChallenge();
    first.unmount();
    mode = 'not-configured';
    render(<App />);
    expect(await screen.findByText("Google Drive isn't connected. Showing the copy on this device.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
  });

  it('a document without its header still reads, under the feed name and the date in its filename', async () => {
    docText = '## Challenge\n\nThe header went missing.';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /AI Challenge/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Enterprise AI Challenge' })).toBeInTheDocument();
    expect(screen.getByText('The header went missing.')).toBeInTheDocument();
    expect(screen.getByText(/Monday 2 November · 08:20/)).toBeInTheDocument();
  });

  it('on a phone, the list first, then the edition with its actions in the top bar, and back', async () => {
    phone = true;
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /AI Challenge/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Mon 2 Nov · 08:20/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark as read' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back to editions' }));
    expect(screen.getByRole('button', { name: /Mon 2 Nov · 08:20/ })).toBeInTheDocument();
  });
});

describe('what the app says about the documents (conformance)', () => {
  const openFeed = async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /AI Challenge/ }));
    return screen.findByRole('heading', { level: 1 });
  };

  it('a header problem: a notice on the edition, a label in the list, and the details a tap away', async () => {
    docText = CHALLENGE_DOC.replace(/generated_at: .*\n/, '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await openFeed();
    expect(screen.getByRole('note')).toHaveTextContent("doesn't follow the publication format (no generated_at)");
    expect(within(screen.getByRole('button', { name: /Mon 2 Nov/ })).getByText('Format issue')).toBeInTheDocument();
    expect(screen.getByText('1 document in this feed needs a look.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const sheet = screen.getByRole('dialog', { name: 'Feed status' });
    expect(within(sheet).getByText(/no generated_at/)).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: /Agent Sprawl/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('two documents with the same name: both kept, both labelled, a warning', async () => {
    files = [files[0], { ...files[0], id: '1SecondCopy00000000000000' }];
    await openFeed();
    expect(screen.getAllByText('Duplicate')).toHaveLength(2);
    expect(screen.getByText('2 documents in this feed need a look.')).toBeInTheDocument();
    expect(screen.getAllByRole('note')[0]).toHaveTextContent('2 documents in this feed have the same name. All of them are kept.');
  });

  it('an imported edition says so, quietly, and is no problem', async () => {
    docText = CHALLENGE_DOC.replace('schema_version: 1', 'schema_version: 1\norigin: "backfill"');
    render(<App />);
    const card = (await screen.findByRole('heading', { level: 2, name: 'Agent Sprawl: Who Owns the Bots?' })).closest('article')!;
    expect(within(card).getByText('Imported')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /AI Challenge/ }));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByText(/needs a look/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Feed status' }));
    expect(within(screen.getByRole('dialog')).getByText('Mon 2 Nov · 08:20, imported')).toBeInTheDocument();
  });

  it('a document still being written is given time, not called incomplete', async () => {
    files = [{ ...files[0], createdTime: new Date(Date.now() - 60_000).toISOString() }];
    docText = '';
    await openFeed();
    expect(screen.getByText('An edition is still being written. It is checked again on each refresh.')).toBeInTheDocument();
    expect(screen.getAllByText('Being written').length).toBeGreaterThan(0);
    expect(screen.queryByText('Incomplete')).toBeNull();
  });

  it('once the grace period has passed, an empty document is incomplete', async () => {
    docText = '';
    await openFeed();
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.getAllByRole('note').map(n => n.textContent).join(' ')).toContain('has no briefing text');
  });

  it('Today leads to the status of every feed', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Feed status' }));
    const sheet = screen.getByRole('dialog', { name: 'Feed status' });
    expect(within(sheet).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual([
      'Enterprise AI Challenge', 'Enterprise AI Executive Sales Brief', 'Customer Engagement Brief',
    ]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
