// ChatGPT's own citation markers, which point at nothing outside ChatGPT. A
// briefing copied with them still in it has sources that cannot be followed:
// the app shows each marker as "source not linked" (keeping the marker's text
// for whoever fixes the task) and never guesses a link in its place.
//
//   【4:2†source】                          bracketed reference
//   cite turn0search3 (with private-use delimiters U+E200–U+E202)
//   citeturn0search3turn1news2             the same with the delimiters lost
import type { Root, RootContent, PhrasingContent, Text } from 'mdast';

const MARKER = /【[^】\n]{0,80}】|[^\n]{0,200}|\bcite(?:turn\d+[a-z]+\d+)+|[-]/gu;

/** The citation markers in some Markdown, in order. */
export function citationsIn(markdown: string): string[] {
  return [...markdown.matchAll(MARKER)].map(m => m[0]);
}

const readable = (marker: string) => marker.replace(/[-]/g, ' ').trim() || 'citation marker';

function split(node: Text): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let last = 0;
  for (const m of node.value.matchAll(MARKER)) {
    if (m.index! > last) out.push({ type: 'text', value: node.value.slice(last, m.index) });
    out.push({
      type: 'emphasis',
      data: { hName: 'span', hProperties: { className: ['intel-cite'], title: `ChatGPT citation without a link: ${readable(m[0])}` } },
      children: [{ type: 'text', value: 'source not linked' }],
    });
    last = m.index! + m[0].length;
  }
  if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) });
  return out;
}

function walk(node: Root | RootContent) {
  if (!('children' in node)) return;
  const children = node.children as RootContent[];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === 'text' && child.value.search(MARKER) !== -1) {
      const parts = split(child);
      children.splice(i, 1, ...parts);
      i += parts.length - 1;
    } else {
      walk(child);
    }
  }
}

/** A remark plugin: each marker becomes a visible "source not linked". */
export function remarkCitations() {
  return (tree: Root) => walk(tree);
}
