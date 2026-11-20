// Passages found again in an article's text (Phase 3). Made-up words in real article structures.
import { describe, it, expect } from 'vitest';
import { anchorAt, indexText, offsetsOf, rangeAt, resolve, quoteText, type PassageAnchor } from './anchor';

function body(html: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ikr-body';
  el.innerHTML = html;
  document.body.replaceChildren(el);
  // Numbered as sanitize.ts numbers them.
  el.querySelectorAll('p, h2, h3, li, blockquote, figure').forEach((b, i) => b.setAttribute('data-b', String(i)));
  return el;
}

/** The anchor for the words `words` (their `nth` occurrence), as a selection of them would give it. */
function keep(root: HTMLElement, words: string, nth = 0): PassageAnchor {
  const ix = indexText(root);
  let at = -1;
  for (let i = 0; i <= nth; i++) at = ix.text.indexOf(words, at + 1);
  if (at < 0) throw new Error(`not found: ${words}`);
  const range = rangeAt(ix, at, at + words.length)!;
  const o = offsetsOf(ix, range, root)!;
  return anchorAt(ix, o.start, o.end);
}

const where = (root: HTMLElement, a: PassageAnchor) => {
  const ix = indexText(root);
  const f = resolve(ix, a);
  return 'missing' in f ? f.missing : ix.text.slice(f.start, f.end);
};

describe("the article's text", () => {
  it('reads the words in order, white space as one space, a block as a line, without what the reader adds', () => {
    const root = body('<h2>A  heading</h2>\n<p>First <em>words</em>\n  here.</p><p>Second<br>line.</p><figure><img data-src="x"><span class="ikr-img-missing">Picture unavailable</span><figcaption>A caption</figcaption></figure><button class="ikr-whole">View full size</button><p>End.</p>');
    expect(indexText(root).text).toBe('A heading\nFirst words here.\nSecond\nline.\nA caption\nEnd.');
  });

  it('gives the same text, and the same fingerprint, for the same article', () => {
    const html = '<p>One paragraph.</p><p>Another, with a <a href="https://example.com">link</a>.</p>';
    expect(indexText(body(html)).hash).toBe(indexText(body(html)).hash);
  });
});

describe('a selection', () => {
  it('across bold, italic and a link keeps exactly its words', () => {
    const root = body('<p>The <strong>agent</strong> reads <em>every</em> <a href="https://example.com">ledger</a> twice.</p>');
    const a = keep(root, 'agent reads every ledger');
    expect(a.quote).toBe('agent reads every ledger');
    expect(a.prefix).toBe('The ');
    expect(a.suffix).toBe(' twice.');
    expect(a.startBlock?.block).toBe(0);
  });

  it('across two paragraphs keeps the break between them', () => {
    const root = body('<p>The first ends here.</p><p>The second starts there.</p>');
    const a = keep(root, 'ends here.\nThe second');
    expect(a.quote).toBe('ends here.\nThe second');
    expect(a.startBlock?.block).toBe(0);
    expect(a.endBlock?.block).toBe(1);
    expect(quoteText(a.quote)).toBe('ends here.\n\nThe second');
  });

  it('starting before the article (in its title) keeps only the article’s part', () => {
    const root = body('<p>Opening words of the article.</p>');
    const title = document.createElement('h1');
    title.textContent = 'A title';
    root.before(title);
    const ix = indexText(root);
    const r = document.createRange();
    r.setStart(title.firstChild!, 2);
    r.setEnd(root.querySelector('p')!.firstChild!, 7);
    expect(ix.text.slice(...Object.values(offsetsOf(ix, r, root)!) as [number, number])).toBe('Opening');
  });

  it('of white space alone, or a single letter, is not a passage', () => {
    const root = body('<p>A b</p><p>   </p>');
    const ix = indexText(root);
    const r = document.createRange();
    r.setStart(root.querySelector('p')!.firstChild!, 0);
    r.setEnd(root.querySelector('p')!.firstChild!, 1);
    expect(offsetsOf(ix, r, root)).toBeNull();
  });

  it('keeps accents, French punctuation and other characters as they are', () => {
    const root = body('<p>L’équipe a dit : « Ça marche — vraiment ! » 🚀 Puis elle est partie.</p>');
    const a = keep(root, '« Ça marche — vraiment ! » 🚀');
    expect(a.quote).toBe('« Ça marche — vraiment ! » 🚀');
    expect(where(root, a)).toBe('« Ça marche — vraiment ! » 🚀');
    const ix = indexText(root);
    expect(rangeAt(ix, a.start, a.end)!.toString()).toBe('« Ça marche — vraiment ! » 🚀');
  });
});

describe('finding a passage again', () => {
  const article = '<p>Intro words to set the scene before anything.</p><p>The same sentence again.</p><p>Something in between, different.</p><p>The same sentence again.</p><p>A closing paragraph with its own words.</p>';

  it('in the same version: where it was, the second of two identical sentences included', () => {
    const root = body(article);
    const a = keep(root, 'The same sentence again.', 1);
    const ix = indexText(root);
    expect(resolve(ix, a)).toEqual({ start: a.start, end: a.end, how: 'same' });
    expect(a.start).toBe(ix.text.lastIndexOf('The same sentence again.'));
  });

  it('after a revision moved it, by the words around it: still the second, not the first', () => {
    const a = keep(body(article), 'The same sentence again.', 1);
    const root = body(`<p>A new opening paragraph Instapaper added.</p>${article}`);
    const ix = indexText(root);
    const f = resolve(ix, a);
    expect(f).toMatchObject({ how: 'found' });
    expect('start' in f && f.start).toBe(ix.text.lastIndexOf('The same sentence again.'));
  });

  it('with the words before it changed but those after it the same', () => {
    const a = keep(body(article), 'Something in between');
    const root = body(article.replace('The same sentence again.</p><p>Something', 'A reworded sentence.</p><p>Something'));
    expect(where(root, a)).toBe('Something in between');
  });

  it('nowhere, when its words are gone', () => {
    const a = keep(body(article), 'Something in between, different.');
    expect(where(body(article.replace('in between', 'in the middle')), a)).toBe('gone');
  });

  it('nowhere, when it stands in places the words around can’t tell apart', () => {
    const repeated = '<p>Same block.</p><p>Same block.</p><p>Same block.</p>';
    const a = keep(body(repeated), 'Same block.', 1);
    // The revision repeats the run of three: two middles, each with the same words on both sides.
    expect(where(body(`${repeated}<p>Divider.</p>${repeated}`), a)).toBe('ambiguous');
    // While a revision that keeps one middle only finds it.
    expect(where(body(`<p>Changed.</p>${repeated}`), a)).toBe('Same block.');
  });

  it('a long passage that is the only one of its words, even with its context rewritten', () => {
    const a = keep(body(article), 'A closing paragraph with its own words.');
    const root = body('<p>Entirely new opening.</p><p>A closing paragraph with its own words.</p><p>And a new ending.</p>');
    expect(where(root, a)).toBe('A closing paragraph with its own words.');
  });

  it('never a short passage on its words alone, once all its context is gone', () => {
    const a = keep(body(article), 'scene');
    expect(where(body('<p>Nothing alike, a scene elsewhere.</p>'), a)).toBe('gone');
  });

  it('when white space or block breaks changed, still by its words', () => {
    const a = keep(body('<p>One line.</p><p>Next line here.</p>'), 'One line.\nNext line');
    expect(where(body('<p>One line. Next line here.</p>'), a)).toBe('One line. Next line');
  });

  it('a passage at the very start of the article, by the start itself', () => {
    const a = keep(body('<p>Opening words.</p><p>Opening words.</p>'), 'Opening words.');
    expect(where(body('<p>Opening words.</p><p>Inserted.</p><p>Opening words.</p>'), a)).toBe('Opening words.');
  });
});
