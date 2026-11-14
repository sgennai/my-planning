// The Meeting Kit (INT-56): takeaways picked for a conversation with an
// executive, each in a role (Opening, Challenge, Follow-up, Argument), and
// the meeting's name. A layer over Takeaways, never a copy of them: the kit
// holds a takeaway's id and nothing of its words, so what it shows is always
// the takeaway as kept. Taking an item out of the kit takes it out of the
// kit only; it stays in Takeaways, with its note, tags and review.
//
// Synced like Takeaways, as small records in `data.content`, each with a
// fixed id, so a tap repeated or made on two devices never makes a second
// one; every record is last-write-wins on its own:
//
//   mk:<kit>              the kit, and the meeting's name   (type intel-kit)
//   kr:<kit>:<takeaway>   the takeaway's role in this kit   (type intel-kit-role)
//   km:<kit>:<takeaway>   whether it is in this kit         (type intel-kit-member)
//
// Role and membership are apart so that one device changing a role and
// another taking the item out, both offline, both stand. A role belongs to
// the kit, not to the takeaway, so a later second kit can give the same
// takeaway another role. Version 1 has one kit, `main`. A takeaway removed
// from Takeaways takes its kit records with it (`withoutKit`).
import type { SavedInsight } from './saved';
import { reviewKindOf } from './review';
import { feedById } from './feeds';
import { copyText } from './present';
import { dayNameShort, formatDayCompact } from '../routine/dates';

export const KIT_TYPE = 'intel-kit';
export const KIT_ROLE_TYPE = 'intel-kit-role';
export const KIT_MEMBER_TYPE = 'intel-kit-member';

/** The one kit of version 1. */
export const MAIN_KIT = 'main';

export type Role = 'opening' | 'challenge' | 'follow-up' | 'argument';

export interface RoleInfo {
  id: Role;
  label: string;
  /** What the role is for, as the kit's picker says it. */
  purpose: string;
  /** The kit's section for it. */
  group: string;
}

/** In the order a conversation takes them, which is the kit's order. */
export const ROLES: RoleInfo[] = [
  { id: 'opening', label: 'Opening', purpose: 'A question that starts the conversation.', group: 'Open the discussion' },
  { id: 'challenge', label: 'Challenge', purpose: 'A question that tests an assumption or opens a new perspective.', group: 'Test an assumption' },
  { id: 'follow-up', label: 'Follow-up', purpose: 'A question that explores an issue more deeply.', group: 'Go deeper' },
  { id: 'argument', label: 'Argument', purpose: 'An insight or point of view to share with the executive.', group: 'Share a perspective' },
];

export const roleInfo = (role: Role) => ROLES.find(r => r.id === role)!;

export interface KitRecord { id: string; type: typeof KIT_TYPE; kitId: string; label: string }
export interface KitRole { id: string; type: typeof KIT_ROLE_TYPE; kitId: string; takeawayId: string; role: Role }
export interface KitMember {
  id: string;
  type: typeof KIT_MEMBER_TYPE;
  kitId: string;
  takeawayId: string;
  inKit: boolean;
  /** When it joined the kit: its place in its role's section. */
  addedAt: string | null;
}

export const kitId = (kit: string) => `mk:${kit}`;
export const roleId = (kit: string, takeawayId: string) => `kr:${kit}:${takeawayId}`;
export const memberId = (kit: string, takeawayId: string) => `km:${kit}:${takeawayId}`;

const isRole = (r: unknown): r is KitRole =>
  (r as KitRole)?.type === KIT_ROLE_TYPE && ROLES.some(x => x.id === (r as KitRole).role) && typeof (r as KitRole).takeawayId === 'string';
const isMember = (r: unknown): r is KitMember =>
  (r as KitMember)?.type === KIT_MEMBER_TYPE && typeof (r as KitMember).takeawayId === 'string';
const isKit = (r: unknown): r is KitRecord => (r as KitRecord)?.type === KIT_TYPE;

/** One kit as the records hold it. */
export interface Kit {
  label: string;
  roles: Map<string, Role>;
  /** The takeaways in it, by id, with when each joined. */
  members: Map<string, string>;
}

export function kitOf(content: unknown[] | undefined, kit = MAIN_KIT): Kit {
  const out: Kit = { label: '', roles: new Map(), members: new Map() };
  for (const r of content || []) {
    if ((r as { kitId?: unknown })?.kitId !== kit) continue;
    if (isKit(r)) out.label = typeof r.label === 'string' ? r.label : '';
    else if (isRole(r)) out.roles.set(r.takeawayId, r.role);
    else if (isMember(r) && r.inKit) out.members.set(r.takeawayId, r.addedAt ?? '');
  }
  return out;
}

/**
 * The role a kind of takeaway usually plays, offered until one is chosen: a
 * question opens, anything else is a point of view. Never stored as the
 * takeaway's own, and never said to come from the publication.
 */
export const suggestedRole = (item: SavedInsight): Role => (reviewKindOf(item) === 'question' ? 'opening' : 'argument');

/** Its role in the kit: the one chosen, else the suggestion. */
export function roleOf(kit: Kit, item: SavedInsight): { role: Role; chosen: boolean } {
  const role = kit.roles.get(item.id);
  return role ? { role, chosen: true } : { role: suggestedRole(item), chosen: false };
}

/** The record put in place of the one with its id, or the content unchanged if it is the same. */
function put(content: unknown[] | undefined, record: { id: string }): unknown[] {
  const all = content || [];
  const at = all.findIndex(r => (r as { id?: string })?.id === record.id);
  if (at >= 0 && JSON.stringify(all[at]) === JSON.stringify(record)) return all;
  return [...all.filter(r => (r as { id?: string })?.id !== record.id), record];
}

/** The takeaway's role in the kit. */
export function withRole(content: unknown[] | undefined, item: SavedInsight, role: Role, kit = MAIN_KIT): unknown[] {
  const record: KitRole = { id: roleId(kit, item.id), type: KIT_ROLE_TYPE, kitId: kit, takeawayId: item.id, role };
  return put(content, record);
}

/**
 * Into the kit, in the role it shows (the suggestion, if none was chosen,
 * becomes its role), or out of it. Nothing about the takeaway changes.
 */
export function withMembership(content: unknown[] | undefined, item: SavedInsight, inKit: boolean, now = new Date(), kit = MAIN_KIT): unknown[] {
  const current = kitOf(content, kit);
  if (current.members.has(item.id) === inKit) return content || [];
  let next = content || [];
  if (inKit && !current.roles.has(item.id)) next = withRole(next, item, suggestedRole(item), kit);
  const record: KitMember = { id: memberId(kit, item.id), type: KIT_MEMBER_TYPE, kitId: kit, takeawayId: item.id, inKit, addedAt: inKit ? now.toISOString() : null };
  return put(next, record);
}

/** The meeting's name, as typed. */
export function withKitLabel(content: unknown[] | undefined, label: string, kit = MAIN_KIT): unknown[] {
  const record: KitRecord = { id: kitId(kit), type: KIT_TYPE, kitId: kit, label };
  return put(content, record);
}

/** A takeaway removed from Takeaways leaves no trace in any kit. */
export function withoutKit(content: unknown[] | undefined, takeawayId: string): unknown[] {
  const all = content || [];
  const gone = (r: unknown) => (isRole(r) || isMember(r)) && r.takeawayId === takeawayId;
  return all.some(gone) ? all.filter(r => !gone(r)) : all;
}

export interface KitSection { role: RoleInfo; items: SavedInsight[] }

/**
 * The kit's takeaways under their roles, in the roles' order, each section
 * in the order they joined. A record whose takeaway is not (or no longer) in
 * Takeaways is left out.
 */
export function kitSections(kit: Kit, saved: SavedInsight[]): KitSection[] {
  const byId = new Map(saved.map(s => [s.id, s]));
  const members = [...kit.members.entries()]
    .filter(([id]) => byId.has(id))
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .map(([id]) => byId.get(id)!);
  return ROLES.map(role => ({ role, items: members.filter(m => roleOf(kit, m).role === role.id) }));
}

/** How many takeaways the kit holds. */
export const kitSize = (sections: KitSection[]) => sections.reduce((n, s) => n + s.items.length, 0);

/**
 * The words of a takeaway to say or paste, as kept: a term with its meaning,
 * an edition by its title, anything else its text without Markdown's
 * emphasis or the quotation marks around it.
 */
export function wordingOf(item: SavedInsight): string {
  if (item.kind === 'term') return `${item.label} — ${copyText(item.text)}`;
  if (item.kind === 'edition') return item.editionTitle;
  return copyText(item.text);
}

const sourceOf = (item: SavedInsight) =>
  `${feedById(item.feedId)?.label ?? item.feedId}, ${dayNameShort(item.editionDate)} ${formatDayCompact(item.editionDate)} ${item.editionDate.slice(0, 4)}`;

/**
 * The kit as text to paste into notes, a document or an email: the meeting,
 * then each role's section with its takeaways, word for word, each followed
 * by where it came from. Lines of a longer takeaway stay under its bullet.
 */
export function kitText(sections: KitSection[], label: string): string {
  const head = `# Executive meeting kit${label.trim() ? ` · ${label.trim()}` : ''}`;
  const parts = sections.filter(s => s.items.length).map(s => [
    `## ${s.role.group}`,
    s.items.map(item => {
      const [first, ...rest] = wordingOf(item).trim().split('\n');
      return [`- ${first}`, ...rest.map(line => (line.trim() ? `  ${line}` : '')), `  (${sourceOf(item)})`].join('\n');
    }).join('\n'),
  ].join('\n\n'));
  return `${[head, ...parts].join('\n\n')}\n`;
}

/** meeting-kit-2026-11-14.md, by the Paris day. */
export const kitFileName = (day: string) => `meeting-kit-${day}.md`;
