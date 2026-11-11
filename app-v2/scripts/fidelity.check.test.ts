// Publication integrity check (INT-45), run by hand, never in the normal suite:
//
//   FIDELITY_EXTRACT=<a task's conversation, from SUPPORTING FILES/backfill/extract-chatgpt-task.js>
//   FIDELITY_DRIVE=<folder of the feed's Drive docs as JSON, from /api/intel/docs/<id>>
//   FIDELITY_FEED=<feed id> FIDELITY_OUT=<folder for report.md and report.json>
//   [FIDELITY_STRICT=1: the run fails when any edition fails]
//   npx vitest run scripts/fidelity.check
//
// Each Drive document is paired with the reply it archives (its source_message,
// else the same run: the same Paris day, generated_at within SAME_RUN_MINUTES)
// and compared with it (`compareFidelity`): PASS, or FAIL with what changed.
// A document with no reply in the extract, and a reply with no document, are
// listed apart. Nothing is sent anywhere; the report stays outside the repository.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { compareFidelity, type Fidelity } from '../src/intelligence/fidelity';
import { parisIso, SAME_RUN_MINUTES, type Extract } from '../src/intelligence/backfill';

const { FIDELITY_EXTRACT, FIDELITY_DRIVE, FIDELITY_FEED, FIDELITY_OUT, FIDELITY_STRICT } = process.env;

const field = (text: string, name: string) => new RegExp(`^${name}:\\s*"?([^"\\r\\n]*)"?\\s*$`, 'm').exec(text)?.[1] ?? null;

describe.skipIf(!FIDELITY_EXTRACT || !FIDELITY_DRIVE || !FIDELITY_OUT)('publication integrity', () => {
  it('compares every archived edition with its reply', () => {
    const extract = JSON.parse(readFileSync(FIDELITY_EXTRACT!, 'utf8')) as Extract;
    const replies = extract.items.filter(i => i.kind === 'edition' && i.markdown && i.timeElement?.datetime)
      .map(i => ({ item: i, at: new Date(i.timeElement!.datetime!), paris: parisIso(new Date(i.timeElement!.datetime!)) }));
    const docs = readdirSync(FIDELITY_DRIVE!).filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(readFileSync(join(FIDELITY_DRIVE!, f), 'utf8')) as { feedId: string; file: { name: string }; text: string })
      .filter(d => !FIDELITY_FEED || d.feedId === FIDELITY_FEED)
      .sort((a, b) => (a.file.name < b.file.name ? -1 : 1));

    const rows: { name: string; origin: string; reply: string | null; result: Fidelity | null }[] = [];
    const paired = new Set<string>();
    for (const d of docs) {
      const message = field(d.text, 'source_message');
      const generated = Date.parse(field(d.text, 'generated_at') ?? '');
      const day = field(d.text, 'edition_date') ?? d.file.name.slice(0, 10);
      const reply = replies.find(r => message && r.item.messageId === message)
        ?? replies.find(r => r.paris.slice(0, 10) === day && Math.abs(r.at.getTime() - generated) <= SAME_RUN_MINUTES * 60_000);
      if (reply) paired.add(reply.item.messageId!);
      rows.push({ name: d.file.name, origin: field(d.text, 'origin') ?? '—', reply: reply?.paris ?? null, result: reply ? compareFidelity(reply.item.markdown!, d.text) : null });
    }
    const unarchived = replies.filter(r => !paired.has(r.item.messageId!));

    const checked = rows.filter(r => r.result);
    const failed = checked.filter(r => !r.result!.pass);
    const count = (f: Fidelity, kind: string) => f.hunks.filter(h => h.kind === kind).length;
    const md = [
      `# Publication integrity · ${FIDELITY_FEED ?? 'all feeds'}`,
      '',
      `${new Date().toISOString()} · extract: ${FIDELITY_EXTRACT} · Drive documents: ${docs.length}`,
      '',
      `**Checked ${checked.length}: ${checked.length - failed.length} pass, ${failed.length} fail.** No reply in the extract: ${rows.length - checked.length}. Replies with no Drive document: ${unarchived.length}.`,
      '',
      'The ChatGPT reply is the authority. Allowed, and set aside: the YAML header, the publication receipt, ChatGPT\'s own interface messages, its tracking tag and repeated source chips (the address kept), and formatting. See `intelligence-publication-integrity-contract.md`.',
      '',
      '| Document | Origin | Result | Changed | Missing text | Added text | Sections missing / added | Sources missing / added |',
      '|---|---|---|---:|---:|---:|---|---|',
      ...rows.map(r => r.result
        ? `| ${r.name} | ${r.origin} | ${r.result.pass ? 'PASS' : r.result.tooDifferent ? 'FAIL (too different to align)' : 'FAIL'} | ${count(r.result, 'changed')} | ${count(r.result, 'missing')} | ${count(r.result, 'added')} | ${r.result.missingSections.length} / ${r.result.addedSections.length} | ${r.result.missingSources.length} / ${r.result.addedSources.length} |`
        : `| ${r.name} | ${r.origin} | no reply in the extract | | | | | |`),
      '',
      ...(unarchived.length ? ['## Replies with no Drive document', '', ...unarchived.map(r => `- ${r.paris} (reply ${r.item.messageId})`), ''] : []),
      ...failed.flatMap(r => {
        const f = r.result!;
        return [
          `## ${r.name} · FAIL`,
          '',
          ...f.missingSections.map(s => `- **Section missing from Drive:** ${s}`),
          ...f.addedSections.map(s => `- **Section only in Drive:** ${s}`),
          ...f.hunks.slice(0, 15).map(h => `- **${h.kind === 'changed' ? 'Wording changed' : h.kind === 'missing' ? 'Text missing from Drive' : 'Text only in Drive'}** in "${h.section || 'the opening'}":\n  - reply: ${h.reply}\n  - Drive: ${h.drive}`),
          ...(f.hunks.length > 15 ? [`- … ${f.hunks.length - 15} more differences`] : []),
          ...f.missingSources.map(u => `- **Source missing from Drive:** ${u}${f.samePage[u] ? ` (Drive has the same page at ${f.samePage[u]})` : ''}`),
          ...f.addedSources.map(u => `- **Source only in Drive:** ${u}`),
          '',
        ];
      }),
    ].join('\n');
    mkdirSync(FIDELITY_OUT!, { recursive: true });
    writeFileSync(join(FIDELITY_OUT!, 'report.md'), md);
    writeFileSync(join(FIDELITY_OUT!, 'report.json'), JSON.stringify({ rows, unarchived: unarchived.map(r => ({ at: r.paris, messageId: r.item.messageId })) }, null, 2));
    process.stdout.write(`${FIDELITY_FEED}: checked ${checked.length}, pass ${checked.length - failed.length}, fail ${failed.length}; no reply ${rows.length - checked.length}; not archived ${unarchived.length}\n`);
    if (FIDELITY_STRICT) expect(failed.map(r => r.name)).toEqual([]);
  });
});
