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
import { CHALLENGE_DOC, CHALLENGE_FILE, ENGAGEMENT_DOC, ENGAGEMENT_FILE, SALES_DOC, SALES_FILE } from './test-fixtures';

let docText: string;
let files: (typeof CHALLENGE_FILE)[];
let texts: Record<string, string | null>;
/** The other feeds' folders, empty unless a test fills them. */
let otherFeeds: Record<string, (typeof CHALLENGE_FILE)[]>;
let mode: 'ok' | 'not-configured';
let phone = false;
let portrait = false;
let confirmAnswer = true;

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: query.includes('max-width: 600px') ? phone : query === '(orientation: portrait)' ? portrait : false,
  addEventListener() {}, removeEventListener() {},
}));
vi.stubGlobal('confirm', vi.fn(() => confirmAnswer));
Element.prototype.scrollTo = function scrollTo() {};
vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (mode === 'not-configured') {
    return Response.json({ error: { code: 'not-configured', message: 'Google Drive is not connected yet.' } }, { status: 503 });
  }
  if (url === '/api/intel/feeds/enterprise-ai-challenge') return Response.json({ files });
  if (url.startsWith('/api/intel/feeds/')) return Response.json({ files: otherFeeds[url.split('/').pop()!] ?? [] });
  const id = url.split('/').pop()!;
  // A text of null is a document Drive lists but cannot hand over.
  if (texts[id] === null) return Response.json({ error: { code: 'google', message: 'Google Drive: internal error' } }, { status: 502 });
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
/** The memo's edition index, beside it (INT-53), shown unless hidden on this device. */
const editionIndex = () => screen.getByRole('complementary', { name: 'Edition history' });
/** The edition being read, as the index marks it. */
const marked = () => editionIndex().querySelector('[aria-current="page"]');
/** A Sales Brief edition, read as its memo (INT-51). */
const withSales = () => {
  otherFeeds['enterprise-ai-sales-brief'] = [{ ...SALES_FILE, createdTime: '2026-01-02T08:05:30.000Z', modifiedTime: '2026-01-02T08:05:32.000Z' }];
  texts[SALES_FILE.id] = SALES_DOC;
};
/** A Customer Engagement edition, read as its memo (INT-52). */
const withEngagement = () => {
  otherFeeds['customer-engagement-brief'] = [{ ...ENGAGEMENT_FILE, createdTime: '2026-01-02T07:00:00.000Z', modifiedTime: '2026-01-02T07:00:05.000Z' }];
  texts[ENGAGEMENT_FILE.id] = ENGAGEMENT_DOC;
};

beforeEach(async () => {
  // Monday 2 November, 07:00 in Paris: before any scheduled run is due, so
  // feed health has nothing to say unless a test moves the clock.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T06:00:00Z'));
  _closeLibrary();
  await new Promise<void>(res => { const r = indexedDB.deleteDatabase('my-planning-intel'); r.onsuccess = r.onerror = () => res(); });
  localStorage.clear();
  sessionStorage.clear();
  docText = CHALLENGE_DOC;
  // Created well before now, so no grace period is running.
  files = [{ ...CHALLENGE_FILE, createdTime: '2026-01-02T07:20:30.000Z', modifiedTime: '2026-01-02T07:20:32.000Z' }];
  texts = {};
  otherFeeds = {};
  mode = 'ok';
  phone = false;
  portrait = false;
  confirmAnswer = true;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

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

  it('the AI Challenge opens as its memo, its editions in the paper index beside it, the one read marked', async () => {
    render(<App />);
    await openChallenge();
    expect(screen.queryByRole('complementary', { name: 'Editions' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    const index = editionIndex();
    expect(index).not.toHaveAttribute('inert');
    expect(index.querySelector('.memo-editions-head')).toHaveTextContent('AI ChallengeEdition history1 edition in your archive');
    expect(within(index).getByRole('button', { name: /^November 2026/ })).toHaveAttribute('aria-expanded', 'true');
    const listed = within(index).getByRole('button', { name: /Mon 2 Nov/ });
    expect(listed).toHaveAttribute('aria-current', 'page');
    expect(listed).toHaveAccessibleName(/^Mon 2 Nov,\s*New\s*Agent Sprawl/);
    // The feed is named by its tab, not again in the bar.
    expect(document.querySelector('.memo-readbar')).toHaveTextContent(/^Hide editions‹Mon 2 Nov 2026 · 08:20›$/);
  });

  it('the three feeds share one workspace: the same bar, the same index, their own editions and name', async () => {
    withSales();
    withEngagement();
    render(<App />);
    const looks: string[][] = [];
    for (const [tab, title] of [[/AI Challenge/, 'Agent Sprawl: Who Owns the Bots?'], [/Enterprise AI/, 'Outcome Pricing and Sovereign Capacity'], [/Customer Engagement/, 'Connected Agents and Headless CDPs']] as const) {
      fireEvent.click(await screen.findByRole('tab', { name: tab }));
      await screen.findByRole('heading', { level: 1, name: title });
      const index = editionIndex();
      expect(marked()).toHaveTextContent(title);
      looks.push([index.className, index.id, document.querySelector('.memo-workspace')!.className, index.querySelector('.memo-editions-kicker')!.textContent!]);
    }
    expect(looks.map(l => l.slice(0, 3))).toEqual(Array(3).fill(['memo-editions', 'memo-editions', 'memo-workspace']));
    expect(looks.map(l => l[3])).toEqual(['AI Challenge', 'Enterprise AI Sales Brief', 'Customer Engagement Brief']);
  });

  it('Hide editions gives the memo the width, for every feed, and Show brings the index back as it was', async () => {
    withSales();
    render(<App />);
    await openChallenge();
    const workspace = document.querySelector('.memo-workspace')!;
    fireEvent.change(within(editionIndex()).getByRole('searchbox', { name: 'Search edition history' }), { target: { value: 'sprawl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide editions' }));
    expect(workspace).toHaveClass('is-hidden');
    expect(document.querySelector('.memo-editions')).toHaveAttribute('inert');
    expect(screen.getByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
    // The same for the other feeds, and on this device the next time.
    fireEvent.click(screen.getByRole('tab', { name: /Enterprise AI/ }));
    await screen.findByRole('heading', { level: 1, name: 'Outcome Pricing and Sovereign Capacity' });
    expect(document.querySelector('.memo-workspace')).toHaveClass('is-hidden');
    expect(localStorage.getItem('my-planning-intel-index')).toBe('hidden');
    fireEvent.click(screen.getByRole('tab', { name: /AI Challenge/ }));
    await screen.findByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' });
    fireEvent.click(screen.getByRole('button', { name: 'Show editions' }));
    expect(document.querySelector('.memo-workspace')).not.toHaveClass('is-hidden');
    expect(within(editionIndex()).getByRole('searchbox', { name: 'Search edition history' })).toHaveValue('sprawl');
    expect(marked()).toHaveTextContent('Agent Sprawl');
  });

  it('the Sales memo keeps its best question once in Takeaways, whichever of its two Saves is used', async () => {
    withSales();
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: /Enterprise AI/ }));
    await screen.findByRole('heading', { level: 1, name: 'Outcome Pricing and Sovereign Capacity' });
    fireEvent.click(screen.getByRole('button', { name: 'Save the best executive question' }));
    expect(savedOf(latest.content).map(s => [s.sectionTitle, s.label])).toEqual([['Agent pricing moves to outcomes', 'Executive question']]);
    expect(screen.getByRole('button', { name: /the executive question of development 1/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved the executive question of development 1' }));
    expect(savedOf(latest.content)).toEqual([]);
    expect(screen.getByRole('button', { name: 'Save the best executive question' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('the Customer Engagement Brief opens as its memo, its editions in the same index beside it', async () => {
    withEngagement();
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: /Customer Engagement/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Connected Agents and Headless CDPs' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Editions' })).toBeNull();
    const index = editionIndex();
    expect(index).toHaveTextContent('Customer Engagement Brief');
    expect(within(index).getByRole('searchbox', { name: 'Search edition history' })).toBeInTheDocument();
    const listed = within(index).getByRole('button', { name: /Mon 2 Nov/ });
    expect(listed).toHaveAttribute('aria-current', 'page');
    expect(listed).toHaveAccessibleName(/^Mon 2 Nov,\s*New\s*Connected Agents/);
  });

  it('the Engagement memo saves each of its questions to Takeaways, as the brief did', async () => {
    withEngagement();
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: /Customer Engagement/ }));
    await screen.findByRole('heading', { level: 1, name: 'Connected Agents and Headless CDPs' });
    fireEvent.click(screen.getByRole('button', { name: 'Save the executive discovery question of development 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save customer question 2' }));
    expect(savedOf(latest.content).map(s => [s.feedId, s.editionDate, s.sectionId, s.label, s.text])).toEqual([
      ['customer-engagement-brief', '2026-11-02', '1-vendor-a-connects-agents-end-to-end', 'Executive discovery question', '“Where does your campaign process lose the most time?”'],
      ['customer-engagement-brief', '2026-11-02', 'three-customer-questions-worth-asking', 'Three customer questions worth asking', '“Which system keeps the approval record?”'],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved customer question 2' }));
    expect(savedOf(latest.content).map(s => s.label)).toEqual(['Executive discovery question']);
  });

  it('Mark as read is kept in the synced data, and undone the same way', async () => {
    render(<App />);
    await openChallenge();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    expect(readingIndex(latest.progressLog).get(CHALLENGE_FILE.id)?.readAt).toBeTruthy();
    expect(within(editionIndex()).getByRole('button', { name: /Mon 2 Nov/ })).not.toHaveTextContent('New');
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Read · Mark as unread' }));
    expect(readingIndex(latest.progressLog).get(CHALLENGE_FILE.id)?.readAt).toBeNull();
  });

  it('saves a question to Takeaways with where it came from, and finds it again', async () => {
    render(<App />);
    await openChallenge();
    fireEvent.click(screen.getByRole('button', { name: 'Save opening question' }));
    expect(screen.getByRole('button', { name: 'Remove saved opening question' })).toHaveAttribute('aria-pressed', 'true');
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
    fireEvent.click(screen.getByRole('button', { name: 'Save this edition' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Save the term Agent sprawl' }));
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
    expect(screen.getByText('Mon 2 Nov 2026 · 08:20')).toBeInTheDocument();
  });

  it('on a phone, the memo first; the index takes the whole width when asked for, and choosing goes back to the memo', async () => {
    phone = true;
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /AI Challenge/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark as read' })).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Today' })).toBeInTheDocument();
    const workspace = document.querySelector('.memo-workspace')!;
    expect(workspace).toHaveClass('memo-workspace--phone', 'is-hidden');
    const toggle = screen.getByRole('button', { name: 'Show editions' });
    fireEvent.click(toggle);
    expect(workspace).not.toHaveClass('is-hidden');
    expect(document.querySelector('.intel-reader--memo')).toHaveAttribute('inert');
    expect(document.activeElement).toBe(marked());
    fireEvent.click(within(editionIndex()).getByRole('button', { name: /Mon 2 Nov/ }));
    expect(workspace).toHaveClass('is-hidden');
    expect(document.querySelector('.intel-reader--memo')).not.toHaveAttribute('inert');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show editions' }));
  });

  it('on a phone, the Engagement memo opens at once, its history behind the menu, its actions at its end', async () => {
    phone = true;
    withEngagement();
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /Customer Engagement/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Connected Agents and Headless CDPs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to editions' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Mark as read' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show editions' }));
    expect(document.querySelector('.memo-workspace')).not.toHaveClass('is-hidden');
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
    expect(within(within(editionIndex()).getByRole('button', { name: /Mon 2 Nov/ })).getByText('Format issue')).toBeInTheDocument();
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
    expect(within(editionIndex()).getAllByText('Duplicate')).toHaveLength(2);
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
    expect(screen.getByText(/The executive memo/)).toHaveTextContent('Imported');
    fireEvent.click(within(editionIndex()).getByRole('button', { name: 'Feed status' }));
    expect(within(screen.getByRole('dialog')).getByText('Mon 2 Nov · 08:20, imported')).toBeInTheDocument();
  });

  it('a document still being written is given time, not called incomplete', async () => {
    files = [{ ...files[0], createdTime: new Date(Date.now() - 60_000).toISOString() }];
    docText = '';
    await openFeed();
    expect(screen.getByText('An edition is still being written. It is checked again on each refresh.')).toBeInTheDocument();
    expect(within(editionIndex()).getAllByText('Being written').length).toBeGreaterThan(0);
    expect(screen.queryByText('Incomplete')).toBeNull();
  });

  it('once the grace period has passed, an empty document is incomplete', async () => {
    docText = '';
    await openFeed();
    expect(within(editionIndex()).getByText('Incomplete')).toBeInTheDocument();
    expect(screen.getAllByRole('note').map(n => n.textContent).join(' ')).toContain('has no briefing text');
  });

  it('Today leads to the status of every feed', async () => {
    render(<App />);
    const publishing = await screen.findByRole('region', { name: 'Publishing' });
    fireEvent.click(within(publishing).getByRole('button', { name: /Feed status/ }));
    const sheet = screen.getByRole('dialog', { name: 'Feed status' });
    expect(within(sheet).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual([
      'Enterprise AI Challenge', 'Enterprise AI Executive Sales Brief', 'Customer Engagement Brief',
    ]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Today when editions pile up over several days', () => {
  const day = (d: string) => ({
    id: `1Day${d.replace(/-/g, '')}000000000000`,
    name: `${d}_0812__enterprise-ai-challenge`,
    createdTime: `${d}T07:13:00.000Z`,
    modifiedTime: `${d}T07:13:05.000Z`,
    webViewLink: `https://docs.google.com/document/d/1Day${d}/edit`,
  });
  const doc = (d: string) => `---\nschema_version: 1\ncontent_type: "enterprise-ai-challenge"\norigin: "scheduled"\nedition_date: "${d}"\ngenerated_at: "${d}T08:12:00+01:00"\ntitle: "Challenge of ${d}"\ntopics: ["Risk"]\n---\n\n## Challenge\n\nText of ${d}.`;
  const DAYS = ['2026-11-04', '2026-11-03', '2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29', '2026-10-28'];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T10:00:00Z'));
    files = DAYS.map(day);
    texts = Object.fromEntries(DAYS.map(d => [day(d).id, doc(d)]));
  });
  afterEach(() => vi.useRealTimers());

  it('says how old each edition is, how many are unread, and lists the older ones newest first', async () => {
    render(<App />);
    // The newest show first; the rest follow as they download.
    const card = (await screen.findByRole('heading', { level: 2, name: 'Challenge of 2026-11-04' })).closest('article')!;
    const list = await screen.findByRole('region', { name: 'Still unread · 7' });
    expect(card).toHaveTextContent('AI Challenge · Today · 08:12');
    expect(screen.getByText(/Wednesday 4 November/)).toHaveTextContent('Wednesday 4 November · 8 unread');
    expect(within(card).getByRole('button', { name: '7 older unread' })).toBeInTheDocument();

    const rows = () => within(list).getAllByRole('button', { name: /Challenge of/ }).map(b => b.textContent);
    expect(rows()).toHaveLength(5);
    expect(rows()[0]).toContain('AI Challenge · Yesterday · 08:12');
    expect(rows()[1]).toContain('Mon 2 Nov · 08:12 · 2 days ago');
    fireEvent.click(within(list).getByRole('button', { name: 'Show all 7' }));
    expect(rows()).toHaveLength(7);
    expect(rows()[6]).toContain('Wed 28 Oct · 08:12 · 7 days ago');
  });

  it('an older edition opens from the list, and once read it leaves it', async () => {
    render(<App />);
    const list = await screen.findByRole('region', { name: 'Still unread · 7' });
    fireEvent.click(within(list).getByRole('button', { name: /Challenge of 2026-11-02/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Challenge of 2026-11-02' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Today' }));
    expect(screen.getByRole('region', { name: 'Still unread · 6' })).toBeInTheDocument();
    expect(screen.getByText(/Wednesday 4 November/)).toHaveTextContent('7 unread');
  });

  it('"older unread" goes to the feed', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '7 older unread' }));
    expect(screen.getByRole('tab', { name: /AI Challenge/ })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('whether the tasks published (feed health)', () => {
  it('Today shows each run, and says when one did not publish as scheduled', async () => {
    // 13:00 in Paris: the AI Challenge is in, the Sales Brief is late, Customer Engagement is missing.
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
    render(<App />);
    const publishing = await screen.findByRole('region', { name: 'Publishing' });
    await vi.waitFor(() => expect(within(publishing).getByText('Published at 08:20')).toBeInTheDocument());
    const rows = within(publishing).getAllByRole('listitem').map(li => li.textContent);
    expect(rows).toEqual([
      'AI ChallengeDaily, around 08:12Published at 08:20',
      'Enterprise AIDaily, around 09:00Late · expected around 09:00',
      'Customer EngagementMon, Wed and Fri at 08:00Missing',
    ]);
    expect(screen.getByText("2 briefings didn't publish as scheduled.")).toBeInTheDocument();

    fireEvent.click(within(publishing).getByRole('button', { name: /Feed status/ }));
    const sheet = screen.getByRole('dialog', { name: 'Feed status' });
    expect(within(sheet).getByText('Mon, Wed and Fri at 08:00, since Mon 2 Nov')).toBeInTheDocument();
    expect(within(sheet).getAllByText('Recent runs')).toHaveLength(3);
    expect(within(sheet).getByText(/To recover a missed edition/)).toBeInTheDocument();
  });

  it("a feed whose run is late says so in its status line", async () => {
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: /AI Challenge/ }));
    await screen.findByRole('heading', { level: 1 });
    expect(await screen.findByText("Today's edition hasn't arrived (daily, around 08:12).")).toBeInTheDocument();
  });

  it('a day with no run says when the next one is', async () => {
    vi.setSystemTime(new Date('2026-11-03T06:00:00Z'));
    render(<App />);
    const publishing = await screen.findByRole('region', { name: 'Publishing' });
    expect(within(publishing).getByText('No run today · next Wed 4 Nov')).toBeInTheDocument();
  });
});

describe('searching every edition', () => {
  const openSearch = async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 2, name: 'Agent Sprawl: Who Owns the Bots?' });
    fireEvent.click(screen.getByRole('button', { name: 'Search every edition' }));
    return screen.getByRole('searchbox', { name: 'Search every edition' });
  };

  it('finds the words, says where, and opens the edition there', async () => {
    const box = await openSearch();
    expect(screen.getByText(/All 1 edition · every edition on this device searched/)).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'licence COSTS' } });
    const result = await screen.findByRole('button', { name: /Agent Sprawl/ });
    expect(result).toHaveTextContent('AI Challenge · Mon 2 Nov · 08:20 · Business impact');
    expect([...result.querySelectorAll('mark')].map(m => m.textContent)).toEqual(['licence', 'costs']);
    fireEvent.click(result);
    expect(screen.getByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
    // The search is still there on coming back.
    fireEvent.click(screen.getByRole('button', { name: 'Search every edition' }));
    expect(screen.getByRole('searchbox', { name: 'Search every edition' })).toHaveValue('licence COSTS');
  });

  it('filters by feed, and says when nothing matches', async () => {
    await openSearch();
    fireEvent.click(within(screen.getByRole('group', { name: 'Feed' })).getByRole('button', { name: 'Enterprise AI' }));
    expect(screen.getByText('No edition matches these filters.')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Topic' })).getByRole('button', { name: 'Agentic AI' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Feed' })).getByRole('button', { name: 'All feeds' }));
    expect(screen.getByRole('button', { name: /Agent Sprawl/ })).toBeInTheDocument();
  });

  it('says how much of the archive it could search', async () => {
    files = [files[0], { ...files[0], id: '1NotDownloaded00000000000', name: '2026-11-01_0812__enterprise-ai-challenge' }];
    texts = { '1NotDownloaded00000000000': null };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await openSearch();
    expect(await screen.findByText(/searched 1 of 2; 1 not downloaded yet/)).toBeInTheDocument();
  });
});

describe('with a keyboard and a screen reader (INT-33)', () => {
  it('each view is named by its one level-one heading', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Takeaways/ }));
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Takeaways']);
    fireEvent.click(screen.getByRole('button', { name: 'Search every edition' }));
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Search']);
    await openChallenge();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('the top navigation: the three feeds, then Today and Takeaways apart, then the tools; words only', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    const tablist = screen.getByRole('tablist', { name: 'Intelligence' });
    expect([...tablist.children].map(group => [...group.children].map(t => t.textContent))).toEqual([
      ['Enterprise AI', 'AI Challenge', 'Customer Engagement'], ['Today', 'Takeaways'],
    ]);
    expect([...tablist.children].map(group => group.className)).toEqual(['intel-nav-feeds', 'intel-nav-more']);
    // The AI Challenge has a new edition: its tab still says only its name.
    expect(screen.getByRole('tab', { name: 'AI Challenge' })).toBeInTheDocument();
    expect(tablist.querySelectorAll('i, svg')).toHaveLength(0);
    const nav = tablist.parentElement!;
    expect(within(nav.querySelector('.intel-nav-tools') as HTMLElement).getAllByRole('button').map(b => b.getAttribute('aria-label')))
      .toEqual(['Search every edition', expect.stringMatching(/^Refresh(ing)? from Google Drive$/)]);
    // Takeaways counts what is kept.
    await openChallenge();
    fireEvent.click(screen.getByRole('button', { name: 'Save opening question' }));
    expect(screen.getByRole('tab', { name: /^Takeaways,\s*1$/ })).toHaveTextContent(/^Takeaways,\s*1$/);
  });

  it('the tabs: one stop for Tab, arrows between them, Enter to open; the panel is named by its tab', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['Enterprise AI', 'AI Challenge', 'Customer Engagement', 'Today', 'Takeaways']);
    expect(tabs.map(t => t.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
    tabs[3].focus();
    fireEvent.keyDown(tabs[3], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[4]);
    fireEvent.keyDown(tabs[4], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(document.activeElement).toBe(tabs[4]);
    fireEvent.keyDown(tabs[4], { key: 'Home' });
    expect(document.activeElement).toBe(tabs[0]);
    expect(screen.getByRole('tabpanel', { name: 'Today' })).toBeInTheDocument();
    fireEvent.click(tabs[4]);
    expect(screen.getByRole('tabpanel', { name: /Takeaways/ })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(t => t.tabIndex)).toEqual([-1, -1, -1, -1, 0]);
    // Searching, no tab is open: the first is the stop.
    fireEvent.click(screen.getByRole('button', { name: 'Search every edition' }));
    expect(screen.getAllByRole('tab').map(t => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false', 'false', 'false']);
    expect(screen.getAllByRole('tab').map(t => t.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it('Feed status takes focus, keeps it, and gives it back', async () => {
    render(<App />);
    const opener = within(await screen.findByRole('region', { name: 'Publishing' })).getByRole('button', { name: 'Feed status' });
    opener.focus();
    fireEvent.click(opener);
    const sheet = screen.getByRole('dialog', { name: 'Feed status' });
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    const close = within(sheet).getByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('on an iPad in portrait too, the index sits beside the memo, not over it; its toggle says what it does', async () => {
    portrait = true;
    withEngagement();
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: /Customer Engagement/ }));
    await screen.findByRole('heading', { level: 1, name: 'Connected Agents and Headless CDPs' });
    expect(screen.queryByRole('button', { name: 'Editions' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('.memo-workspace')).not.toHaveClass('memo-workspace--phone');
    const toggle = screen.getByRole('button', { name: 'Hide editions' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', editionIndex().id);
    expect(document.querySelector('.intel-reader--memo')).not.toHaveAttribute('inert');
  });

  it('Today says which edition each button is for', async () => {
    render(<App />);
    const read = await screen.findByRole('button', { name: 'Read' });
    expect(read).toHaveAccessibleDescription('Agent Sprawl: Who Owns the Bots?');
  });
});

describe('Takeaways back for review (INT-40)', () => {
  const kept = (id: string, kind: 'labelled' | 'term' | 'section', label: string | null, text: string, savedAt = '2026-11-01T10:00:00Z') => ({
    id, type: 'intel-saved', kind, feedId: 'enterprise-ai-sales-brief', driveFileId: '1Kept000000000000000000000',
    editionTitle: 'Model Pricing After the Funding Reset', editionDate: '2026-11-01', editionTime: '09:30',
    sourceUrl: 'https://docs.google.com/document/d/1Kept/edit', sectionId: 'capital', sectionTitle: 'Capital availability',
    label, text, note: '', tags: [], savedAt,
  });
  const question = kept('is:q', 'labelled', 'Executive question', 'Which processes would be hard to move?', '2026-11-01T09:00:00Z');
  const term = kept('is:t', 'term', 'Shadow AI', 'AI used without approval.');
  const section = kept('is:s', 'section', null, '- One point.\n- Another.');
  const reviewOf = (id: string) => (latest.progressLog as { id: string; value: unknown }[]).find(r => r.id === `rv:${id}`)?.value;

  it('Today offers what is due, and a review goes card by card, keeping each rating as it is given', async () => {
    render(<App initial={{ progressLog: [], content: [question, term, section] }} />);
    const card = (await screen.findByRole('heading', { level: 2, name: '2 takeaways to review' })).closest('section')!;
    expect(within(card).getAllByRole('listitem').map(li => li.textContent)).toEqual(['1 question', '1 term']);
    fireEvent.click(within(card).getByRole('button', { name: 'Start review' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    const cue = screen.getByRole('heading', { level: 2, name: 'What would you ask a customer about this?' });
    expect(document.activeElement).toBe(cue);
    expect(screen.queryByText('Which processes would be hard to move?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show what you kept' }));
    expect(screen.getByText('Which processes would be hard to move?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Fairly well/ }));
    expect(reviewOf('is:q')).toMatchObject({ on: true, confidence: 3, due: '2026-11-09', count: 1 });

    expect(screen.getByRole('heading', { level: 2, name: 'Shadow AI' })).toBeInTheDocument();
    expect(screen.getByText('What does it mean?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show the meaning' }));
    fireEvent.click(screen.getByRole('button', { name: /Knew it/ }));
    expect(reviewOf('is:t')).toMatchObject({ confidence: 5, due: '2026-12-02' });

    expect(screen.getByRole('heading', { level: 2, name: 'Review done' })).toBeInTheDocument();
    const back = screen.getByRole('region', { name: 'Coming back' });
    expect(within(back).getAllByRole('listitem').map(li => li.textContent)).toEqual(['1Mon 9 Nov', '1Wed 2 Dec']);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Today' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /to review/ })).toBeNull();
  });

  it('Takeaways says where each one stands; a section can be added, and a card taken out', async () => {
    render(<App initial={{ progressLog: [], content: [question, section] }} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Takeaways/ }));
    const bar = screen.getByRole('region', { name: 'Review' });
    expect(bar).toHaveTextContent('1 to review today');
    expect(bar).toHaveTextContent('1 of 2 takeaways in review');
    expect(screen.getByText('Due for review today')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to review' }));
    expect(reviewOf('is:s')).toMatchObject({ on: true, due: '2026-11-03' });
    expect(screen.getByText('In review · next tomorrow')).toBeInTheDocument();

    fireEvent.click(within(bar).getByRole('button', { name: 'Start review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop reviewing this one' }));
    expect(reviewOf('is:q')).toMatchObject({ on: false });
    expect(screen.getByText(/1 takeaway taken out of review/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Takeaways' }));
    expect(screen.getAllByText('Not in review')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Review' })).toHaveTextContent('Nothing to review today');
  });

  it('a takeaway removed takes its review with it', async () => {
    render(<App initial={{ progressLog: [{ id: 'rv:is:q', type: 'intel-review', refId: 'is:q', at: '2026-11-01T12:00:00Z', value: { on: true, due: '2026-11-05', confidence: 2, count: 1, lastAt: '2026-11-01T12:00:00Z' } }], content: [question] }} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Takeaways/ }));
    expect(screen.getByText('In review · next Thu 5 Nov · last time: a little')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Remove .* from Takeaways$/ }));
    expect(reviewOf('is:q')).toBeUndefined();
  });
});

describe('Takeaways exported as a file (INT-43)', () => {
  const kept = (id: string, label: string, text: string, note = '') => ({
    id, type: 'intel-saved', kind: 'labelled', feedId: 'enterprise-ai-sales-brief', driveFileId: '1Kept000000000000000000000',
    editionTitle: 'Model Pricing After the Funding Reset', editionDate: '2026-11-01', editionTime: '09:30',
    sourceUrl: 'https://docs.google.com/document/d/1Kept/edit', sectionId: 'capital', sectionTitle: 'Capital availability',
    label, text, note, tags: [], savedAt: '2026-11-01T10:00:00Z',
  });

  it('exports what the list shows, and says so', async () => {
    let file: File | null = null;
    Object.assign(URL, { createObjectURL: (f: File) => { file = f; return 'blob:x'; }, revokeObjectURL: () => {} });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<App initial={{ progressLog: [], content: [
      kept('is:a', 'Executive question', 'Which processes would be hard to move?', 'Ask the CIO'),
      kept('is:b', 'LinkedIn angle', 'The next failure may not be technical.'),
    ] }} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Takeaways/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Exported 2 takeaways')).toBeInTheDocument();
    expect(file!.name).toBe('takeaways-2026-11-02.md');
    const all = await file!.text();
    expect(all).toContain('2 takeaways, newest first.');
    expect(all).toContain('> Which processes would be hard to move?');
    expect(all).toContain('**Note:** Ask the CIO');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Takeaways' }), { target: { value: 'cio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Exported 1 takeaway')).toBeInTheDocument();
    const narrowed = await file!.text();
    expect(narrowed).toContain('1 takeaway, newest first, only those matching “cio”.');
    expect(narrowed).not.toContain('LinkedIn angle');
  });
});

describe('Your reading (INT-44)', () => {
  it('counts unread by feed, editions read lately and takeaways reviewed this week, saying since when', async () => {
    render(<App />);
    const panel = await screen.findByRole('region', { name: 'Your reading' });
    expect(within(panel).getByText('Unread').nextElementSibling).toHaveTextContent('AI Challenge 1 · Enterprise AI 0 · Customer Engagement 0');
    expect(within(panel).getByText('Read').nextElementSibling).toHaveTextContent('0 in the last 7 days · 0 in the last 30 days (since 1 Nov)');
    expect(within(panel).getByText('Reviewed').nextElementSibling).toHaveTextContent('0 takeaways this week, since Mon 2 Nov');
    await openChallenge();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Today' }));
    const after = await screen.findByRole('region', { name: 'Your reading' });
    expect(within(after).getByText('Unread').nextElementSibling).toHaveTextContent('AI Challenge 0');
    expect(within(after).getByText('Read').nextElementSibling).toHaveTextContent('1 in the last 7 days · 1 in the last 30 days');
  });
});

describe('Related by topic (INT-42)', () => {
  it('lists another feed\u2019s edition sharing a topic, says which, and opens it', async () => {
    otherFeeds['customer-engagement-brief'] = [{ ...ENGAGEMENT_FILE, createdTime: '2026-01-02T07:00:00.000Z', modifiedTime: '2026-01-02T07:00:05.000Z' }];
    texts[ENGAGEMENT_FILE.id] = ENGAGEMENT_DOC;
    render(<App />);
    await screen.findByRole('heading', { level: 2, name: 'Connected Agents and Headless CDPs' });
    await openChallenge();
    // In the memo: a folded row under the topic map.
    const fold = screen.getByText('Related by topic').closest('details')!;
    expect(fold).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Related by topic'));
    const row = within(fold).getByRole('button', { name: /Connected Agents and Headless CDPs/ });
    expect(row).toHaveTextContent('Mon 2 Nov 2026 · 08:00 · Customer Engagement Brief');
    expect(row).toHaveTextContent('Shared: Agentic AI');
    fireEvent.click(row);
    expect(screen.getByRole('heading', { level: 1, name: 'Connected Agents and Headless CDPs' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Customer Engagement/ })).toHaveAttribute('aria-selected', 'true');
    // Its memo has the same fold, leading back.
    const back = within(screen.getByText('Related by topic').closest('details')!).getByRole('button', { name: /Agent Sprawl/ });
    expect(back).toHaveTextContent('Mon 2 Nov 2026 · 08:20 · Enterprise AI Challenge');
    expect(back).toHaveTextContent('Shared: Agentic AI');
  });

  it('shows nothing when no other edition shares a topic', async () => {
    render(<App />);
    await openChallenge();
    expect(screen.queryByText('Related by topic')).toBeNull();
  });
});

describe('imported editions are the archive, never unread (INT-34)', () => {
  const OLD = { ...CHALLENGE_FILE, id: '1ImportedChallenge00000000', name: '2026-10-01_0841__enterprise-ai-challenge', createdTime: '2026-11-04T08:00:00.000Z', modifiedTime: '2026-11-04T08:00:00.000Z' };
  beforeEach(() => {
    files = [files[0], OLD];
    texts = {
      [OLD.id]: CHALLENGE_DOC.replace('edition_date: "2026-11-02"', 'edition_date: "2026-10-01"')
        .replace('2026-11-02T08:20:00+01:00', '2026-10-01T08:41:00+02:00')
        .replace('title: "Agent Sprawl: Who Owns the Bots?"', 'origin: "backfill"\ntitle: "An Archived Challenge"'),
    };
  });

  it('the memo\u2019s chevrons step to the older edition and back to the newer', async () => {
    render(<App />);
    await openChallenge();
    expect(screen.getByRole('button', { name: 'Next edition: none' })).toBeDisabled();
    const month = (name: RegExp) => within(editionIndex()).getByRole('button', { name });
    expect(month(/^October 2026/)).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Previous edition: Thu 1 Oct, An Archived Challenge' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'An Archived Challenge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous edition: none' })).toBeDisabled();
    // Its month opens in the index, the other stays as it was, the edition marked.
    expect(month(/^October 2026/)).toHaveAttribute('aria-expanded', 'true');
    expect(month(/^November 2026/)).toHaveAttribute('aria-expanded', 'true');
    expect(marked()).toHaveTextContent('An Archived Challenge');
    fireEvent.click(screen.getByRole('button', { name: 'Next edition: Mon 2 Nov, Agent Sprawl: Who Owns the Bots?' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
  });

  it('each feed keeps its own months and search; a search finds without changing the memo', async () => {
    withSales();
    render(<App />);
    await openChallenge();
    const index = () => editionIndex();
    fireEvent.click(within(index()).getByRole('button', { name: /^October 2026/ }));
    fireEvent.click(within(index()).getByRole('button', { name: /^November 2026/ }));
    fireEvent.change(within(index()).getByRole('searchbox', { name: 'Search edition history' }), { target: { value: 'archived' } });
    // While searching: only the match, its month open; the memo is the one being read.
    expect([...index().querySelectorAll('.memo-month-head')].map(b => [b.textContent, b.getAttribute('aria-expanded')])).toEqual([['October 2026, 1 edition', 'true']]);
    expect(screen.getByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
    // Another feed: its own search and months.
    fireEvent.click(screen.getByRole('tab', { name: /Enterprise AI/ }));
    await screen.findByRole('heading', { level: 1, name: 'Outcome Pricing and Sovereign Capacity' });
    expect(within(index()).getByRole('searchbox', { name: 'Search edition history' })).toHaveValue('');
    expect(within(index()).getByRole('button', { name: /^November 2026/ })).toHaveAttribute('aria-expanded', 'true');
    // Back: the search as it was; cleared, the months as they were.
    fireEvent.click(screen.getByRole('tab', { name: /AI Challenge/ }));
    await screen.findByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' });
    const search = within(index()).getByRole('searchbox', { name: 'Search edition history' });
    expect(search).toHaveValue('archived');
    fireEvent.change(search, { target: { value: '' } });
    expect([...index().querySelectorAll('.memo-month-head')].map(b => b.getAttribute('aria-expanded'))).toEqual(['true', 'true']);
    expect(JSON.parse(localStorage.getItem('my-planning-intel-months:enterprise-ai-challenge')!)).toEqual(expect.arrayContaining(['2026-10', '2026-11']));
  });

  it('is listed and labelled, but counted in no unread list or count', async () => {
    render(<App />);
    await screen.findByRole('heading', { level: 2, name: 'Agent Sprawl: Who Owns the Bots?' });
    expect(screen.queryByRole('region', { name: /Still unread/ })).toBeNull();
    expect(screen.getByText(/Monday 2 November/)).toHaveTextContent('Monday 2 November · 1 unread');
    const panel = screen.getByRole('region', { name: 'Your reading' });
    expect(within(panel).getByText('Unread').nextElementSibling).toHaveTextContent('AI Challenge 1');

    await openChallenge();
    const history = editionIndex();
    expect(within(history).getByRole('button', { name: /Mon 2 Nov/ })).toHaveTextContent('New');
    // October is shut until opened; November, the month being read, is open.
    expect(within(history).queryByRole('button', { name: /Thu 1 Oct/ })).toBeNull();
    fireEvent.click(within(history).getByRole('button', { name: /^October 2026/ }));
    const archived = within(history).getByRole('button', { name: /Thu 1 Oct/ });
    expect(archived).not.toHaveTextContent(/New|Imported/);
    fireEvent.click(archived);
    expect(screen.getByRole('heading', { level: 1, name: 'An Archived Challenge' })).toBeInTheDocument();
    expect(screen.getByText(/The executive memo/)).toHaveTextContent('1 October 2026 / Imported');
    // The index stayed, the choice marked, both months open.
    expect(marked()).toHaveTextContent('An Archived Challenge');
    expect([...editionIndex().querySelectorAll('.memo-month-head')].map(b => b.getAttribute('aria-expanded'))).toEqual(['true', 'true']);
    // Once the scheduled edition is read, nothing in the feed is new.
    fireEvent.click(within(editionIndex()).getByRole('button', { name: /Mon 2 Nov/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    expect(within(editionIndex()).getByRole('button', { name: /Mon 2 Nov/ })).not.toHaveTextContent('New');
  });
});
