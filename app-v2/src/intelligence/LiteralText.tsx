// An article's own words in Takeaways (Intake 2.0 Phase 3): plain text, never read as Markdown, so an
// asterisk, a "1." at a line's start or a bracket shows as the article had it; its paragraphs as kept.
export function LiteralText({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</>;
}
