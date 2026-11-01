// @vitest-environment jsdom
// The section against a stand-in /api/intel: an edition from Drive on the
// screen, the feeds with nothing yet, and Drive not connected or a document
// that breaks the rules, none of which may take the section down.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { IntelligenceScreen } from './IntelligenceScreen';
import { _closeLibrary } from './library';
import { CHALLENGE_DOC, CHALLENGE_FILE } from './test-fixtures';

let docText: string;
let mode: 'ok' | 'not-configured';
let phone = false;

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: query.includes('max-width: 600px') ? phone : false,
  addEventListener() {}, removeEventListener() {},
}));
Element.prototype.scrollTo = function scrollTo() {};
vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (mode === 'not-configured') {
    return Response.json({ error: { code: 'not-configured', message: 'Google Drive is not connected yet.' } }, { status: 503 });
  }
  if (url === '/api/intel/feeds/enterprise-ai-challenge') return Response.json({ files: [CHALLENGE_FILE] });
  if (url.startsWith('/api/intel/feeds/')) return Response.json({ files: [] });
  return Response.json({ file: CHALLENGE_FILE, text: docText });
}));

beforeEach(async () => {
  _closeLibrary();
  await new Promise<void>(res => { const r = indexedDB.deleteDatabase('my-planning-intel'); r.onsuccess = r.onerror = () => res(); });
  localStorage.clear();
  docText = CHALLENGE_DOC;
  mode = 'ok';
  phone = false;
});
afterEach(cleanup);

describe('the Intelligence section', () => {
  it('opens on the AI Challenge with its newest edition, listed and read', async () => {
    render(<IntelligenceScreen />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'AI Challenge' })).toHaveAttribute('aria-selected', 'true');
    const listed = screen.getByRole('button', { name: /Mon 2 Nov · 08:20/ });
    expect(listed).toHaveAttribute('aria-current', 'true');
  });

  it('a feed with no editions yet says so', async () => {
    render(<IntelligenceScreen />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('tab', { name: 'Enterprise AI' }));
    expect(await screen.findByText('No editions yet')).toBeInTheDocument();
  });

  it('says when Google Drive is not connected', async () => {
    mode = 'not-configured';
    render(<IntelligenceScreen />);
    expect(await screen.findByText("Google Drive isn't connected")).toBeInTheDocument();
  });

  it('keeps the copy it has when Drive goes away, and says so', async () => {
    const first = render(<IntelligenceScreen />);
    await screen.findByRole('heading', { level: 1 });
    first.unmount();
    mode = 'not-configured';
    render(<IntelligenceScreen />);
    expect(await screen.findByText("Google Drive isn't connected. Showing the copy on this device.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
  });

  it('a document without its header still reads, under the feed name and the date in its filename', async () => {
    docText = '## Challenge\n\nThe header went missing.';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<IntelligenceScreen />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Enterprise AI Challenge' })).toBeInTheDocument();
    expect(screen.getByText('The header went missing.')).toBeInTheDocument();
    expect(screen.getByText(/Monday 2 November · 08:20/)).toBeInTheDocument();
  });

  it('on a phone, the list first, then the edition, and back', async () => {
    phone = true;
    render(<IntelligenceScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Mon 2 Nov · 08:20/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Agent Sprawl: Who Owns the Bots?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to editions' }));
    expect(screen.getByRole('button', { name: /Mon 2 Nov · 08:20/ })).toBeInTheDocument();
  });
});
