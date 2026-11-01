// A briefing's own Markdown, rendered as written: GitHub-flavoured (tables,
// strikethrough, bare links), links opening beside the app, raw HTML shown as
// the text it is, and images as links to them rather than pictures fetched
// from wherever the document points.
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PLUGINS = [remarkGfm];

const BLOCK: Components = {
  a: (p) => <a href={p.href} title={p.title} target="_blank" rel="noopener noreferrer">{p.children}</a>,
  img: (p) => <a href={typeof p.src === 'string' ? p.src : undefined} target="_blank" rel="noopener noreferrer">{p.alt || p.src}</a>,
  table: (p) => <div className="intel-table"><table>{p.children}</table></div>,
};
const INLINE: Components = { ...BLOCK, p: (p) => <>{p.children}</> };

export function Markdown({ children, inline = false }: { children: string; inline?: boolean }) {
  return <ReactMarkdown remarkPlugins={PLUGINS} components={inline ? INLINE : BLOCK}>{children}</ReactMarkdown>;
}
