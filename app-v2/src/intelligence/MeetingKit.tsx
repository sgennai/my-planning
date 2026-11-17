// The Meeting kit (INT-56, kit.ts): the takeaways picked for a meeting under
// their roles, in the order a conversation takes them (Open the discussion,
// Test an assumption, Go deeper, Share a perspective), each in its exact
// words with where it came from. The meeting's name is yours to write. Remove
// takes an item out of this kit only: it stays in Takeaways. The kit copies
// as text, or goes out as a Markdown file like the Takeaways export.
import { useId } from 'react';
import { Markdown } from './Markdown';
import { originOf, type SavedInsight } from './saved';
import { kitText, kitFileName, kitSize, type KitSection } from './kit';
import { isQuotable, wordsOf, dateOf } from './notebook';
import { handOver } from './export';
import { useDraft } from './useDraft';
import type { DayKey } from '../routine/dates';

interface Props {
  sections: KitSection[];
  label: string;
  today: DayKey;
  onLabel: (label: string) => void;
  /** Out of the kit; the takeaway stays. */
  onOut: (item: SavedInsight) => void;
  /** Its role, changed where it is chosen (Use in conversation). */
  onRole: (item: SavedInsight) => void;
  onBack: () => void;
  onNote: (text: string) => void;
}

/** Its words as kept: a term with its meaning, an edition by its title, a longer text at its own length. */
function KitWords({ item }: { item: SavedInsight }) {
  if (item.kind === 'edition') return <p>{item.editionTitle}</p>;
  if (item.kind === 'term') return <p><b><Markdown inline>{item.label ?? ''}</Markdown></b> — <Markdown inline>{item.text}</Markdown></p>;
  if (isQuotable(item.text)) return <p><Markdown inline>{item.text}</Markdown></p>;
  return <div className="tk-kit-long"><Markdown>{item.text}</Markdown></div>;
}

export function MeetingKit({ sections, label, today, onLabel, onOut, onRole, onBack, onNote }: Props) {
  const fieldId = useId();
  const headId = useId();
  const { draft, setDraft, flush, justSaved } = useDraft(label, onLabel);
  const size = kitSize(sections);
  const text = () => kitText(sections, draft);
  const copy = () => {
    flush();
    if (!navigator.clipboard) { onNote("Couldn't copy"); return; }
    navigator.clipboard.writeText(text()).then(() => onNote('Meeting kit copied'), () => onNote("Couldn't copy"));
  };
  const exportKit = async () => {
    flush();
    if (await handOver(kitFileName(today), text())) onNote('Meeting kit exported');
  };

  return (
    <div className="tk-kit">
      <div className="tk-kit-context">
        <div>
          <p className="tk-label">Your conversation assets</p>
          <h2 className="tk-kit-title" id={headId}>Executive meeting kit</h2>
          <p className="tk-meta">A focused sequence of questions and arguments drawn from your saved knowledge.</p>
        </div>
        <div className="tk-kit-field">
          <div className="tk-label-row">
            <label className="tk-label" htmlFor={fieldId}>Meeting / customer</label>
            <span className="tk-saved" role="status">{justSaved ? 'Saved' : ''}</span>
          </div>
          <input id={fieldId} className="tk-input" value={draft} onChange={e => setDraft(e.target.value)} onBlur={flush} placeholder="e.g. Bank executive meeting" />
        </div>
      </div>

      {size === 0 ? (
        <div className="tk-empty">
          <b>The kit is empty.</b> Choose a takeaway, open Use in conversation, give it a role and add it to the meeting kit. Each role has its own section here.
        </div>
      ) : sections.map(s => (
        <section key={s.role.id} className="tk-kit-group" aria-label={s.role.group}>
          <h3>{s.role.group} · {s.items.length}</h3>
          {s.items.length ? (
            <ul>
              {s.items.map(item => (
                <li key={item.id} className="tk-kit-item">
                  <div>
                    <KitWords item={item} />
                    <small>
                      {originOf(item)} · {dateOf(item.editionDate)} · <button type="button" className="tk-quiet" onClick={() => onRole(item)} aria-label={`Change role: ${wordsOf(item)}`}>Change role</button>
                    </small>
                  </div>
                  <button type="button" className="tk-remove" onClick={() => onOut(item)} aria-label={`Remove ${wordsOf(item)} from the meeting kit`}>Remove</button>
                </li>
              ))}
            </ul>
          ) : <p className="tk-meta tk-kit-none">No item selected for this moment yet.</p>}
        </section>
      ))}

      <div className="tk-actions">
        <button type="button" className="tk-btn is-primary" onClick={copy} disabled={!size}>Copy meeting kit</button>
        {size > 0 && <button type="button" className="tk-btn" onClick={exportKit}>Export</button>}
        <button type="button" className="tk-btn" onClick={onBack}>Back to notebook</button>
      </div>
      <p className="tk-hint">The kit uses each takeaway's exact saved wording. Remove takes an item out of this kit only: it stays in Takeaways, with its note and its review.</p>
    </div>
  );
}
