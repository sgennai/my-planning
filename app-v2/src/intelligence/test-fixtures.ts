// An AI Challenge edition in the shape the scheduled task writes (made-up
// words, the real document's structure), for the reader's tests.
export const CHALLENGE_FILE = {
  id: '1ChallengeFixture000000000000000000000000',
  name: '2026-11-02_0820__enterprise-ai-challenge',
  createdTime: '2026-11-02T07:20:30.000Z',
  modifiedTime: '2026-11-02T07:20:32.000Z',
  webViewLink: 'https://docs.google.com/document/d/1ChallengeFixture000000000000000000000000/edit?usp=drivesdk',
};

export const CHALLENGE_BODY = `## Enterprise AI topic map


Strategy • Governance • Agentic AI • Operating models • ROI


**Relevant to today's challenge:** Governance • Agentic AI • Operating models


## Challenge


**Teams are deploying AI agents faster than anyone can list them.**


Each department builds its own **agents** to automate requests, and nobody keeps an [inventory](https://example.com/inventory).


## Business impact


Duplicated agents multiply licence costs.


Unowned agents keep running after their sponsor leaves: **nobody can switch them off.**


## 3 approaches


**1. Keep one register of agents**


Record every agent, its owner and the data it touches.


**2. Fund a platform team**


Give builders a shared, supported way to ship agents.


**3. Retire what nobody owns**


Review the register each quarter and switch off orphans.


## What to listen for


- "Every team has its own bot now."
- "We don't know who approved that agent."


## Executive discovery questions


**Opening question:**


"How many AI agents are running in your organisation today?"


**Follow-up question:**


"Who would switch one off if it misbehaved tonight?"


## Executive Vocabulary — 3 Terms to Remember


**1. Agent sprawl** — Uncontrolled growth in the number of AI agents.


**2. Agent register** — The list of every agent, its owner and its permissions.


**3. Orphaned agent** — An agent whose owner has left.


**Use it in a conversation:**


"Before agent sprawl sets in, an agent register makes sure no orphaned agent stays live."`;

export const CHALLENGE_DOC = `---
schema_version: 1
content_type: "enterprise-ai-challenge"
edition_date: "2026-11-02"
generated_at: "2026-11-02T08:20:00+01:00"
title: "Agent Sprawl: Who Owns the Bots?"
topics: ["Governance", "Agentic AI", "Operating models"]
---
${CHALLENGE_BODY}
`;

/** Every word of some Markdown, without its markup: what a reader must be able to see. */
export function wordsOf(markdown: string): string[] {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .split(/[^\p{L}\p{N}'’]+/u)
    .filter(w => w.length > 1);
}

// The Enterprise AI Sales Brief and the Customer Engagement Brief in the shape
// their scheduled tasks write (made-up words, the real documents' structure):
// a "# title" line over "##" sections; the Sales Brief's developments are
// "###" inside its themes, made of labelled parts; the Engagement Brief's are
// numbered "##" sections of labelled paragraphs.
export const SALES_FILE = {
  id: '1SalesFixture00000000000000000000000000000',
  name: '2026-11-03_0905__enterprise-ai-sales-brief',
  createdTime: '2026-11-03T08:05:30.000Z',
  modifiedTime: '2026-11-03T08:05:32.000Z',
  webViewLink: 'https://docs.google.com/document/d/1SalesFixture00000000000000000000000000000/edit?usp=drivesdk',
};

export const SALES_BODY = `# Enterprise AI Sales Brief — 3 November 2026


## Relevant executive themes today


**Budgets • Vendor strategy • Resilience**


Two developments met today’s significance threshold.


### Agent pricing moves to outcomes


**What happened**


**Confirmed reporting — 2 November:** A vendor priced agents per resolved case. [Example News — 2 November 2026](https://example.com/news/agent-pricing)


**Interpretation:** Pricing follows outcomes, not seats.


**Why it matters to the industry**


Seat licences lose ground:


- budgets move;
- procurement changes.


**Why it matters to me**


A better opening than model benchmarks.


**Why it matters to banks**


Banks must audit outcome claims.


**Executive question**


“Which outcomes would you be willing to pay for?”


**How I can respond**


“Start with the outcome you already measure.”


**Banking use case**


A bank prices its service agent per resolved request.


**Expected business outcome and KPIs:** cost per resolution, first-contact resolution.


**Unica+ interpretation**


**Journey** keeps the decision state. [Example docs](https://example.com/docs/journey)


**LinkedIn angle**


“Seats are a proxy. Outcomes are the product.”


### Sovereign clouds add capacity


**What happened**


**Confirmed — 1 November:** A provider opened a sovereign region. https://example.com/news/sovereign-region


**Why it matters to banks**


Residency questions get easier.


## What I should remember today


- Outcome pricing is arriving.
- Sovereign capacity is growing.


## Best executive question today


“Which outcomes would you be willing to pay for?”


## Contrarian or non-obvious insight


Cheaper seats can cost more.


## Development to watch


Watch who prices per outcome next.`;

export const SALES_DOC = `---
schema_version: 1
content_type: "enterprise-ai-sales-brief"
edition_date: "2026-11-03"
generated_at: "2026-11-03T09:05:02+01:00"
origin: "scheduled"
title: "Outcome Pricing and Sovereign Capacity"
topics: ["Investment & budgets", "Vendor strategy"]
---


${SALES_BODY}
`;

export const ENGAGEMENT_FILE = {
  id: '1EngagementFixture000000000000000000000000',
  name: '2026-11-02_0800__customer-engagement-brief',
  createdTime: '2026-11-02T07:00:30.000Z',
  modifiedTime: '2026-11-02T07:00:32.000Z',
  webViewLink: 'https://docs.google.com/document/d/1EngagementFixture000000000000000000000000/edit?usp=drivesdk',
};

export const ENGAGEMENT_BODY = `# Enterprise Customer Engagement Brief


**Coverage: 26 October – 2 November 2026 — new since Friday**


## Executive take


Two developments cleared the threshold:


- A vendor connected its agents end to end.
- Another exposed its CDP to assistants.


## 1. Vendor A connects agents end to end


**Confirmed — 30 October:** Vendor A opened a beta of connected agents:


- Ideation Agent, using signals.
- Compliance Agent, checking rules.


Humans keep approvals. [Vendor A, 30 October 2026](https://example.com/vendor-a/agents)


**Interpretation — why it matters:** The whole cycle gets automated.


**Sales implication:** Integration beats single agents.


**Banking relevance:** Compliance checks cannot replace controls.


**Be ready to discuss:** Approval authority, rollback.


**Executive discovery question:** “Where does your campaign process lose the most time?”


---


## 2. Vendor B exposes its CDP to assistants


**Confirmed — 31 October:** Vendor B launched a headless interface. [Vendor B announcement](https://example.com/vendor-b/headless) [Vendor B explainer](https://example.com/vendor-b/explainer)


**Sales implication:** A credible headless story matters.


**Executive discovery question:** “Can the assistant inherit every restriction?”


## Three executive talking points


- **Engagement is going headless:** value shifts to governed data.
- **Agents automate the operating model:** approvals need design.


## Three customer questions worth asking


- “Which workflows could run headless?”
- “Which system keeps the approval record?”


## Competitive watchlist


- **Vendor A:** Production evidence after beta.
- **Vendor B:** Permission granularity.
- **Vendor C and Vendor D:** Third-party agent coverage.


## Contrarian insight


Headless can deepen lock-in.


## Development to monitor next


**Vendor A’s Compliance Agent:** whether rules are deterministic.`;

export const ENGAGEMENT_DOC = `---
schema_version: 1
content_type: "customer-engagement-brief"
edition_date: "2026-11-02"
generated_at: "2026-11-02T08:00:04+01:00"
origin: "scheduled"
title: "Connected Agents and Headless CDPs"
topics: ["Agentic AI", "Headless CDP"]
---


${ENGAGEMENT_BODY}
`;

/** Every link target written in some Markdown: `[text](url)` and bare URLs. */
export function linksOf(markdown: string): string[] {
  const bracketed = [...markdown.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map(m => m[1]);
  const bare = [...markdown.replace(/\]\((https?:\/\/[^)\s]+)\)/g, ']').matchAll(/https?:\/\/[^\s)<>]+/g)].map(m => m[0]);
  return [...bracketed, ...bare];
}
