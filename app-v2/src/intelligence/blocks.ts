// Small readings of a briefing's Markdown shared by the section presenters.

/** Paragraphs, lists and the like: the text between blank lines. */
export function blocksOf(markdown: string): string[] {
  return markdown.split(/\n[ \t]*\n/).map(b => b.trim()).filter(Boolean);
}

/** A title or label as lower-case words, for recognising it whatever its punctuation. */
export const keyOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "A • B • C": the separator between topics or themes. */
export const SEPARATOR = /\s+[•·]\s+/;
/** Topic names are plain words: no emphasis, links or code to lose. */
export const PLAIN = /^[^*_`[\]<>#\n]+$/;

export const unlabel = (label: string) => label.replace(/\s*:\s*$/, '').trim();
