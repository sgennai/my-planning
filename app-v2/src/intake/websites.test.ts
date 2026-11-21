// Intake › Websites: addresses, duplicates, search, topics, the pinned order and the merge between devices.
import { describe, it, expect } from 'vitest';
import {
  normalizeUrl, urlKey, findDuplicate, matchesQuery, categoriesOf, tagsFrom, pinnedOf, moveTo, lastRank, newWebsite, updateWebsite,
  withWebsite, withoutWebsite, websitesOf, mergeWebsite, initialsOf, artOf, pinPatch, safeLogoImage, safePalette, LOGO_LIMITS,
  DEFAULT_CATEGORIES, type Website,
} from './websites';
import { mergeContentRecord, removalWins } from '../storage/merge';

const at = (s: number) => new Date(Date.UTC(2026, 10, 21, 9, 0, s));
const site = (name: string, url: string, extra: Partial<Website> = {}, sites: Website[] = [], s = 0): Website => ({
  ...newWebsite({ url, name, description: '', category: 'Enterprise AI', tags: [], note: '', pinned: !!extra.pinned }, sites, at(s)),
  ...extra,
});

describe('addresses', () => {
  it('keeps what was typed as a web address, https added, nothing else', () => {
    expect(normalizeUrl('hbr.org')).toBe('https://hbr.org/');
    expect(normalizeUrl('  http://Example.com/Path?a=1#x ')).toBe('http://example.com/Path?a=1#x');
    for (const bad of ['', 'javascript:alert(1)', 'ftp://x.com', 'localhost', 'https://user:pw@x.com', 'two words.com', 'mailto:a@b.com']) expect(normalizeUrl(bad), bad).toBeNull();
  });

  it('one website: with or without www, http or https, a closing slash, tracking tags or a fragment', () => {
    const k = urlKey('https://www.anthropic.com/news/');
    for (const same of ['http://anthropic.com/news', 'https://anthropic.com/news?utm_source=x&utm_medium=y', 'https://ANTHROPIC.com/news#top', 'https://anthropic.com/news?fbclid=1']) expect(urlKey(same), same).toBe(k);
  });

  it('two websites: another page of the same site, another query, or a path differing by case', () => {
    const k = urlKey('https://www.anthropic.com/news');
    for (const other of ['https://www.anthropic.com/', 'https://www.anthropic.com/research', 'https://www.anthropic.com/news?page=2', 'https://www.anthropic.com/News', 'https://news.anthropic.com/']) expect(urlKey(other), other).not.toBe(k);
  });

  it('finds a duplicate, never the website being edited', () => {
    const a = site('Anthropic News', 'https://www.anthropic.com/news');
    const b = site('Anthropic', 'https://www.anthropic.com/');
    expect(findDuplicate([a, b], 'anthropic.com/news/')?.id).toBe(a.id);
    expect(findDuplicate([a, b], 'https://www.anthropic.com/news', a.id)).toBeUndefined();
    expect(findDuplicate([a, b], 'https://www.anthropic.com/careers')).toBeUndefined();
  });
});

describe('search and topics', () => {
  const w = site('Équipe Stratégie', 'https://www.mckinsey.com/featured-insights', { description: 'Research on growth', tags: ['AI adoption'], note: 'Read the quarterly', category: 'Strategy & Research' });

  it('every word, in any field, accents and case ignored', () => {
    for (const q of ['equipe', 'STRATEGIE research', 'mckinsey', 'ai adoption', 'quarterly', 'strategy &', 'featured-insights']) expect(matchesQuery(w, q), q).toBe(true);
    expect(matchesQuery(w, 'equipe salesforce')).toBe(false);
    expect(matchesQuery(w, '   ')).toBe(true);
  });

  it('the six topics first, then your own alphabetically, with counts', () => {
    const own = site('X', 'https://x.com', { category: 'Wine' });
    const own2 = site('Y', 'https://y.com', { category: 'Économie' });
    const cats = categoriesOf([w, own, own2]);
    expect(cats.map(c => c.name)).toEqual([...DEFAULT_CATEGORIES, 'Économie', 'Wine']);
    expect(cats.find(c => c.name === 'Strategy & Research')!.count).toBe(1);
    expect(cats.find(c => c.name === 'Sales & GTM')!.count).toBe(0);
  });

  it('tags from one field: trimmed, once each whatever their case, 20 at most', () => {
    expect(tagsFrom(' AI,  research , ai, , Strategy ')).toEqual(['AI', 'research', 'Strategy']);
    expect(tagsFrom(Array.from({ length: 30 }, (_, i) => `t${i}`).join(','))).toHaveLength(20);
  });
});

describe('pinned & ready', () => {
  const a = site('A', 'https://a.com', { pinned: true, pinRank: 1 });
  const b = site('B', 'https://b.com', { pinned: true, pinRank: 2 });
  const c = site('C', 'https://c.com', { pinned: true, pinRank: 3 });
  const d = site('D', 'https://d.com');

  it('in their order; a website pinned now goes last', () => {
    expect(pinnedOf([c, d, a, b]).map(s => s.name)).toEqual(['A', 'B', 'C']);
    expect(lastRank([a, b, c, d])).toBe(4);
    expect(pinPatch([a, b, c, d], d, true)).toEqual({ pinned: true, pinRank: 4 });
    expect(pinPatch([a, b, c, d], b, false)).toEqual({ pinned: false });
  });

  it('a move changes one website alone, between its new neighbours', () => {
    expect(moveTo([a, b, c], c.id, 0)).toEqual([{ id: c.id, pinRank: 0 }]);
    expect(moveTo([a, b, c], a.id, 1)).toEqual([{ id: a.id, pinRank: 2.5 }]);
    expect(moveTo([a, b, c], b.id, 1)).toEqual([]);
  });

  it('ranks worn too fine are numbered again, in the new order', () => {
    const x = site('X', 'https://x.com', { pinned: true, pinRank: 1 });
    const y = site('Y', 'https://y.com', { pinned: true, pinRank: 1 + Number.EPSILON });
    const z = site('Z', 'https://z.com', { pinned: true, pinRank: 3 });
    const moves = moveTo([x, y, z], z.id, 1);
    const after = [x, y, z].map(s => ({ ...s, pinRank: moves.find(m => m.id === s.id)?.pinRank ?? s.pinRank }));
    expect(pinnedOf(after).map(s => s.name)).toEqual(['X', 'Z', 'Y']);
  });
});

describe('records', () => {
  it('a change writes and stamps only the fields that differ', () => {
    const w = site('HBR', 'https://hbr.org/');
    const content = withWebsite([{ id: 'is:1', type: 'intel-saved' }], w);
    expect(updateWebsite(content, w.id, { name: 'HBR' }, at(9))).toBe(content);
    const [got] = websitesOf(updateWebsite(content, w.id, { name: '  Harvard Business Review ', note: 'Ideas' }, at(9)));
    expect(got).toMatchObject({ name: 'Harvard Business Review', note: 'Ideas', editedAt: at(9).toISOString() });
    expect(got.stamps.name).toBe(at(9).toISOString());
    expect(got.stamps.url).toBe(at(0).toISOString());
  });

  it('removing one leaves every other record, takeaways and highlights included', () => {
    const w = site('HBR', 'https://hbr.org/');
    const content = withWebsite([{ id: 'is:1' }, { id: 'ih:2' }], w);
    expect(withoutWebsite(content, w.id)).toEqual([{ id: 'is:1' }, { id: 'ih:2' }]);
  });

  it('reads only websites, and fills what a later or damaged record lacks', () => {
    const got = websitesOf([{ id: 'ws:1', type: 'intake-website', url: 'https://a.com', name: 'A', createdAt: 'x' }, { id: 'ws:2', type: 'other', url: 'u', name: 'n' }, { id: 'ws:3', _deleted: true }]);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ tags: [], note: '', description: '', pinned: false, category: 'Enterprise AI', logo: null });
  });
});

describe('merge between devices', () => {
  const base = site('Braze', 'https://braze.com/', {}, [], 0);

  it('each field from the copy that changed it last', () => {
    const ipad = websitesOf(updateWebsite([base], base.id, { pinned: true, pinRank: 1 }, at(5)))[0];
    const iphone = websitesOf(updateWebsite([base], base.id, { note: 'n', category: 'Sales & GTM' }, at(6)))[0];
    const m = mergeWebsite(ipad, iphone)!;
    expect(m).toMatchObject({ pinned: true, pinRank: 1, note: 'n', category: 'Sales & GTM', editedAt: at(6).toISOString() });
    expect(mergeWebsite(iphone, ipad)).toEqual(m);
  });

  it('a tie gives the same answer on both devices', () => {
    const one = websitesOf(updateWebsite([base], base.id, { note: 'one' }, at(5)))[0];
    const two = websitesOf(updateWebsite([base], base.id, { note: 'two' }, at(5)))[0];
    expect(mergeWebsite(one, two)!.note).toBe(mergeWebsite(two, one)!.note);
  });

  it('leaves anything else to last-write-wins', () => {
    expect(mergeWebsite({ id: 'is:1', type: 'intel-saved' }, base)).toBeNull();
    expect(mergeWebsite(base, { ...base, id: 'ws:other' })).toBeNull();
  });
});

describe('a logo is checked before it is shown', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/ACUiDAAAAABJRU5ErkJggg==';
  const ok = { data: PNG, w: 64, h: 64, kind: 'touch', src: 'https://x.com/t.png', bleed: false, plate: 'light' };

  it('a PNG data address of the sizes the device makes is shown', () => {
    expect(safeLogoImage(ok, 'square')).toEqual(ok);
    expect(safeLogoImage({ ...ok, w: 384, h: 96 }, 'wide')).not.toBeNull();
  });

  it.each([
    ['an SVG', { ...ok, data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }],
    ['SVG markup', { ...ok, data: '<svg onload="alert(1)"></svg>' }],
    ['a script address', { ...ok, data: 'javascript:alert(1)' }],
    ['another address', { ...ok, data: 'https://tracker.example/pixel.png' }],
    ['a JPEG', { ...ok, data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }],
    ['a "PNG" whose bytes are not one', { ...ok, data: 'data:image/png;base64,PGh0bWw+PC9odG1sPg==' }],
    ['characters outside base64', { ...ok, data: `${PNG}"><script>` }],
    ['too heavy', { ...ok, data: PNG + 'A'.repeat(LOGO_LIMITS.chars) }],
    ['too large a square', { ...ok, w: 129 }],
    ['no size', { ...ok, w: undefined }],
    ['a fractional size', { ...ok, h: 10.5 }],
    ['nothing', null], ['a string', 'data:image/png;base64,iVBORw0KGgo'],
  ])('refused: %s', (_, value) => {
    expect(safeLogoImage(value, 'square')).toBeNull();
  });

  it('a wordmark taller than the device makes is refused', () => {
    expect(safeLogoImage({ ...ok, w: 300, h: 97 }, 'wide')).toBeNull();
  });

  it('unknown values in the rest are made safe, not passed on', () => {
    expect(safeLogoImage({ ...ok, kind: '<b>', plate: 'url(x)', bleed: 'yes', src: 7 }, 'square')).toMatchObject({ kind: 'favicon', plate: 'light', bleed: false, src: '' });
  });

  it('card colours: two #rrggbb values, else the colours chosen by domain', () => {
    expect(safePalette(['#112233', '#AABBCC'])).toEqual(['#112233', '#AABBCC']);
    for (const bad of [['red', '#112233'], ['#112233'], ['url(x)', '#112233'], ['#112233;background:url(x)', '#112233'], 'x', null]) expect(safePalette(bad)).toBeNull();
    const w = site('HBR', 'https://hbr.org/');
    expect(artOf({ ...w, logo: { square: null, wide: null, palette: ['url(https://evil.example/x)', '#000000'] as never, checkedAt: '' } })).toEqual(artOf({ ...w, logo: null }));
  });
});

describe('the sync rules for websites leave every other record as it was', () => {
  const takeaway = { id: 'is:1', type: 'intel-saved', text: 'words', note: 'a', savedAt: 'x' };
  const highlight = { id: 'ih:1', type: 'intake-annotation', bookmarkId: 1, kind: 'article', anchor: null, note: 'n' };
  const kit = { id: 'kit:main', kitId: 'main', label: 'Meeting' };

  it('no field-by-field merge for a takeaway, a highlight or the meeting kit: last-write-wins, as before', () => {
    expect(mergeContentRecord(takeaway, { ...takeaway, note: 'b' })).toBeNull();
    expect(mergeContentRecord(highlight, { ...highlight, note: 'm' })).toBeNull();
    expect(mergeContentRecord(kit, { ...kit, label: 'Other' })).toBeNull();
  });

  it('removal-wins as before: highlights and notes, now websites; never takeaways or anything else', () => {
    expect(removalWins('content', 'ih:1')).toBe(true);
    expect(removalWins('content', 'in:1')).toBe(true);
    expect(removalWins('content', 'ws:1')).toBe(true);
    expect(removalWins('content', 'is:1')).toBe(false);
    expect(removalWins('content', 'kit:main')).toBe(false);
    expect(removalWins('learning', 'ws:1')).toBe(false);
    expect(removalWins('progressLog', 'ar:1')).toBe(false);
  });
});

describe('look', () => {
  it('two letters for a site without a logo', () => {
    expect(initialsOf('Harvard Business Review')).toBe('HB');
    expect(initialsOf('a16z')).toBe('A1');
    expect(initialsOf('Café — Économie')).toBe('CÉ');
    expect(initialsOf('***')).toBe('W');
  });

  it('a card keeps its colours on every device: the logo’s, else chosen by its domain', () => {
    const w = site('HBR', 'https://www.hbr.org/');
    expect(artOf(w)).toEqual(artOf({ url: 'http://hbr.org/x', logo: null }));
    expect(artOf({ ...w, logo: { square: null, wide: null, palette: ['#111111', '#222222'], checkedAt: '' } })).toMatchObject({ c1: '#111111', c2: '#222222' });
  });
});
