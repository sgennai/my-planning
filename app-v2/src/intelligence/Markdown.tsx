// A briefing's own Markdown, rendered as written: GitHub-flavoured (tables,
// strikethrough, bare links), links opening beside the app, raw HTML shown as
// the text it is, images as links to them rather than pictures fetched from
// wherever the document points, and ChatGPT citation markers shown as
// "source not linked" rather than as tokens (`citations.ts`).
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkCitations } from './citations';

const PLUGINS = [remarkGfm, remarkCitations];

const BLOCK: Components = {
  a: (p) => <a href={p.href} title={p.title} target="_blank" rel="noopener noreferrer">{p.children}</a>,
  img: (p) => <a href={typeof p.src === 'string' ? p.src : undefined} target="_blank" rel="noopener noreferrer">{p.alt || p.src}</a>,
  table: (p) => <div className="intel-table"><table>{p.children}</table></div>,
};
const INLINE: Components = { ...BLOCK, p: (p) => <>{p.children}</> };

/**
 * `heading`: the text is a title, so "1. Vendor news" is a numbered title and
 * not a one-item list.
 */
export function Markdown({ children, inline = false, heading = false }: { children: string; inline?: boolean; heading?: boolean }) {
  const text = heading ? children.replace(/^(\s*)(\d+)([.)])(\s)/, '$1$2\\$3$4').replace(/^(\s*)([-*+])(\s)/, '$1\\$2$3') : children;
  return <ReactMarkdown remarkPlugins={PLUGINS} components={inline ? INLINE : BLOCK}>{text}</ReactMarkdown>;
}
