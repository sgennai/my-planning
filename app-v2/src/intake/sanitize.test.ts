// @vitest-environment jsdom
// The reader's HTML: what is kept, what goes, and what is prepared (made-up articles; real text stays out of
// the repo).
import { describe, it, expect } from 'vitest';
import { cleanArticle } from './sanitize';
import { imageAddressesOf } from '../../server/intake';

const BASE = 'https://news.example.com/2026/story';
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };

describe('what is kept', () => {
  it('keeps the structure: headings, paragraphs, lists, quotations, code, tables, figures and captions', () => {
    const { html } = cleanArticle(`
      <h2>Part one</h2><p>Some <em>stressed</em> and <strong>strong</strong> words.</p>
      <ul><li>One</li><li>Two</li></ul><ol start="3"><li>Three</li></ol>
      <blockquote><p>Quoted.</p></blockquote><pre><code>let x = 1;</code></pre>
      <table><caption>Figures</caption><tr><th scope="col">A</th></tr><tr><td colspan="2">1</td></tr></table>
      <figure><img src="/img/a.jpg" alt="A chart"><figcaption>Source: made up</figcaption></figure>`, BASE);
    const d = dom(html);
    expect([...d.querySelectorAll('h2, p, ul, ol, li, blockquote, pre, code, table, caption, th, td, figure, img, figcaption')].map(e => e.tagName.toLowerCase()))
      .toEqual(['h2', 'p', 'ul', 'li', 'li', 'ol', 'li', 'blockquote', 'p', 'pre', 'code', 'table', 'caption', 'th', 'td', 'figure', 'img', 'figcaption']);
    expect(d.querySelector('ol')!.getAttribute('start')).toBe('3');
    expect(d.querySelector('td')!.getAttribute('colspan')).toBe('2');
    expect(d.querySelector('table')!.parentElement!.className).toBe('ikr-table');
    expect(d.textContent).toContain('Some stressed and strong words.');
  });

  it('opens links beside the app, resolving relative ones; other schemes keep their words only', () => {
    const d = dom(cleanArticle('<p><a href="/other">Rel</a> <a href="https://x.example.org/a">Abs</a> <a href="javascript:alert(1)">Bad</a> <a href="#note-1">Note</a> <a href="mailto:a@example.com">Mail</a></p>', BASE).html);
    const links = [...d.querySelectorAll('a')];
    expect(links.map(a => a.getAttribute('href'))).toEqual(['https://news.example.com/other', 'https://x.example.org/a', 'mailto:a@example.com']);
    expect(links.every(a => a.target === '_blank' && a.rel === 'noopener noreferrer')).toBe(true);
    expect(d.textContent).toBe('Rel Abs Bad Note Mail');
  });
});

describe('what goes', () => {
  it('removes scripts, styles, handlers, classes, ids and forms', () => {
    const d = dom(cleanArticle('<p id="x" class="lead" style="color:red" onclick="steal()">Text</p><script>steal()</script><style>p{}</style><form><input value="x"><button>Go</button></form><img src="a.jpg" onerror="steal()">', BASE).html);
    expect(d.innerHTML).not.toMatch(/script|style=|onclick|onerror|class="lead"|id="x"|<form|<input|<button/);
    expect(d.textContent).toContain('Text');
  });

  it('turns embedded media into a link to it, and never loads an image by itself', () => {
    const { html, images } = cleanArticle('<p>Before</p><iframe src="https://video.example.com/embed/1"></iframe><video src="/v.mp4"></video><img src="https://cdn.example.com/b.png"><img src="ftp://x/y.png">', BASE);
    const d = dom(html);
    expect([...d.querySelectorAll('[data-embed] a')].map(a => a.getAttribute('href'))).toEqual(['https://video.example.com/embed/1', 'https://news.example.com/v.mp4']);
    expect(d.querySelector('iframe, video')).toBeNull();
    expect(d.querySelectorAll('img[src]').length).toBe(0);
    expect(images).toEqual(['https://cdn.example.com/b.png']);
    expect(d.querySelector('img')!.getAttribute('data-src')).toBe('https://cdn.example.com/b.png');
  });

  it('drops empty paragraphs and wrappers', () => {
    const d = dom(cleanArticle('<p>Kept</p><p> </p><div><span> </span></div><p><img src="https://cdn.example.com/c.png"></p>', BASE).html);
    expect(d.querySelectorAll('p').length).toBe(2);
    expect(d.querySelector('div')).toBeNull();
  });
});

describe('what the reader needs', () => {
  it("starts the article's headings at h2 and lists h2 and h3 for the contents", () => {
    const { html, headings } = cleanArticle('<h1>Top</h1><p>a</p><h2>Sub</h2><p>b</p><h3>Deeper</h3>', BASE);
    expect([...dom(html).querySelectorAll('h2, h3, h4')].map(h => h.tagName)).toEqual(['H2', 'H3', 'H4']);
    expect(headings.map(h => [h.text, h.level])).toEqual([['Top', 2], ['Sub', 3]]);
    expect(dom(html).querySelector(`#${headings[0].id}`)!.textContent).toBe('Top');
  });

  it('numbers each block of text once, innermost first, a figure as one', () => {
    const { html, opening } = cleanArticle('<h2>H</h2><p>One</p><blockquote><p>Two</p><p>Three</p></blockquote><ul><li>Four</li></ul><figure><img src="https://cdn.example.com/d.png"><figcaption>Cap</figcaption></figure><p>Five <img src="https://cdn.example.com/e.png"></p><div>Loose text</div>', BASE);
    const blocks = [...dom(html).querySelectorAll('[data-b]')];
    expect(blocks.map(b => `${b.getAttribute('data-b')}:${b.tagName}`)).toEqual(['0:H2', '1:P', '2:P', '3:P', '4:LI', '5:FIGURE', '6:P', '7:DIV']);
    expect(opening).toBe('H');
  });
});

describe('pictures and their signatures', () => {
  it("asks for each picture by the very address the server signed for it (as the browser reads the HTML)", () => {
    const html = '<p><img src=" https://cdn.example.com/a.jpg?w=800&amp;q=80&#38;x=1 "><img src=\'HTTPS://CDN.Example.com/b c.png\'><img src="https://cdn.example.com/caf&eacute;.png"></p>';
    const signed = imageAddressesOf(html, [], null);
    const asked = cleanArticle(html, 'https://example.com/a/1').images;
    expect(asked.slice(0, 2)).toEqual(signed.slice(0, 2));
    expect(asked.slice(0, 2).every(u => signed.includes(u))).toBe(true);
    // A rarer entity the server doesn't read: that one picture goes unsigned and loads from the publisher.
    expect(signed).not.toContain(asked[2]);
  });
});
