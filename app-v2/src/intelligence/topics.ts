// Topic labels as one vocabulary (INT-46). The Enterprise AI topic map's 27
// labels, which the AI Challenge uses and all three tasks' headers have used
// since November, are canonical. The Sales Brief's history (August to
// October) wrote the longer labels of its own customer-conversation map, and
// a few editions wrote their own words; each such label is matched as the
// canonical topics it names, word for word or by plain abbreviation (TCO is
// a cost), and no others: "Revenue & growth" is not taken for "Business
// performance", nor "Human oversight" for "Governance". A shortened form of a
// map label maps as the full label does. A label not listed here is compared
// as itself, as before. Used to match related editions only: every document
// and every edition keeps its labels as written.
import { fold } from './blocks';

export const CANONICAL_TOPICS = [
  'Strategy', 'Investment', 'Transformation programs', 'Risk', 'Architecture', 'Data', 'Governance', 'People',
  'Business performance', 'Data readiness', 'Security', 'AI risk', 'Model reliability', 'Infrastructure', 'Cost',
  'Skills', 'Operating models', 'Change management', 'Integration', 'Legacy systems', 'Vendor concentration', 'ROI',
  'Measurement', 'Agentic AI', 'Compliance', 'Organizational adoption', 'Scaling from pilots to production',
] as const;

export type CanonicalTopic = typeof CANONICAL_TOPICS[number];

/** Each label written in the documents that names canonical topics without being one. */
export const TOPIC_ALIASES: Readonly<Record<string, readonly CanonicalTopic[]>> = {
  // The Sales Brief's customer-conversation map.
  'Strategy & business priorities': ['Strategy'],
  'Investment & budgets': ['Investment'],
  'Cost & productivity': ['Cost'],
  'Business case, ROI & TCO': ['ROI', 'Cost'],
  'Measurement & KPIs': ['Measurement'],
  'Operating model & ownership': ['Operating models'],
  'Skills & talent': ['Skills'],
  'Change management & organizational adoption': ['Change management', 'Organizational adoption'],
  'Data strategy, readiness & quality': ['Data', 'Data readiness'],
  'Integration & legacy modernization': ['Integration', 'Legacy systems'],
  'Infrastructure, scalability & performance': ['Infrastructure'],
  'AI/model risk & reliability': ['AI risk', 'Model reliability'],
  'Compliance & regulation': ['Compliance'],
  'Vendor strategy, concentration & lock-in': ['Vendor concentration'],
  // Shortened forms of those labels.
  'Vendor concentration & lock-in': ['Vendor concentration'],
  'Vendor strategy & lock-in': ['Vendor concentration'],
  'Vendor strategy': ['Vendor concentration'],
  'Data strategy': ['Data'],
  'AI/model risk': ['AI risk'],
  'Infrastructure & scalability': ['Infrastructure'],
  // The Customer Engagement Brief's own words.
  'Agentic marketing': ['Agentic AI'],
  'B2B measurement': ['Measurement'],
  'Customer-data governance': ['Data', 'Governance'],
  'Measurement & ROI': ['Measurement', 'ROI'],
};

// Labels repeat across thousands of editions: each is worked out once.
const keys = new Map<string, string>();

/** A topic label as compared: "Investment & budgets" → "investment and budgets". */
export function topicKey(topic: string): string {
  let key = keys.get(topic);
  if (key === undefined) {
    key = fold(topic).replace(/&/g, ' and ').replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
    keys.set(topic, key);
  }
  return key;
}

const aliases = new Map(Object.entries(TOPIC_ALIASES).map(([label, to]) => [topicKey(label), to.map(topicKey)]));

/** What a label is matched as: the canonical topics it names, or itself. */
export function topicKeys(topic: string): string[] {
  const key = topicKey(topic);
  return aliases.get(key) ?? (key ? [key] : []);
}
