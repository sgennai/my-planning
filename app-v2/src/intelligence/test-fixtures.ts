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
