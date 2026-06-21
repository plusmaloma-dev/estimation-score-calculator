# Federation Rule Review

This document tracks the post-MVP review of local Egyptian Estimation scoring assumptions against official or user-confirmed sources.

## Review principles

- Keep this project focused on Egyptian Estimation scoring, not Planning Poker.
- Treat `PROJECT_RULES.md` as the current local rule reference until a rule is confirmed differently.
- Do not change scoring behavior from this review document alone.
- Create a focused implementation story only when a source-confirmed or user-confirmed rule requires a scoring change.
- Record source, decision, and implementation impact for every reviewed rule.

## Source notes

| Source | Current evidence | Review status |
| --- | --- | --- |
| Egyptian Bridge Federation Estimation site | Public site confirms Estimation is a four-player 52-card game where players bid/estimate tricks and score by achieving the exact estimate. It also says the Estimation Committee is responsible for officially recognized laws/rules, arbitration, tournaments, licensing, ranking, and player classification. | Usable for broad scope confirmation. Detailed scoring rules still need direct rules/document access or user confirmation. |
| `PROJECT_RULES.md` | Local project rule reference built from user-confirmed requirements during MVP development. | Active local baseline. |
| User-confirmed table rules | User-confirmed rules from the project conversation, including total bids never equal 13, risk/double-risk values, Dash Call behavior, and WITH behavior. | Active local baseline until contradicted by confirmed federation rules. |

## Rule review tracker

| Rule area | Local baseline | Source status | Decision | Implementation impact |
| --- | --- | --- | --- | --- |
| Game scope | Egyptian Estimation score calculator, not Planning Poker. | Confirmed by project scope and public federation site description of Estimation as a trick-taking card game. | Keep. | No code change. |
| Players and deck | Four players using a 52-card deck. | Broadly supported by public federation site. | Keep. | No code change. |
| Round total | Total estimates must never equal 13; round is Under when total < 13 and Over when total > 13. | User-confirmed local rule; detailed federation scoring source still pending. | Keep pending direct rule source review. | No code change. |
| Trump hierarchy | No Trump > Spades > Hearts > Diamonds > Clubs unless overridden by official federation rules. | User-confirmed local baseline; direct federation hierarchy source pending. | Keep pending direct rule source review. | No code change. |
| Dash in Over | Dash/0 in Over: success +10; failure is delta * -1. | User-confirmed local baseline; direct federation scoring source pending. | Keep pending direct rule source review. | No code change. |
| Dash Call | Pre-bidding Dash announcement: success +35; failure delta * -1 -25; other bonuses/risks still apply. | User-confirmed local baseline; direct federation scoring source pending. | Keep pending direct rule source review. | No code change. |
| WITH | WITH applies the same for high contracts as normal contracts; no special high-contract exception. | User-confirmed local baseline; direct federation scoring source pending. | Keep pending direct rule source review. | No code change. |
| Risk taker | Last bidder/caller determines Under/Over and carries risk impact. | User-confirmed local baseline; direct federation scoring source pending. | Keep pending direct rule source review. | No code change. |
| Risk and double risk | Totals 11/15 = risk value 10; totals 9/17 = double-risk value 20; add/subtract for risk-taker success/failure. | User-confirmed local baseline; direct federation scoring source pending. | Keep pending direct rule source review. | No code change. |
| Consecutive all-loser multiplier | First all-loser occurrence makes next round x2; another loss compounds to x4; resets on successful/winning result unless future rule caps multiplier. | User-confirmed local baseline; cap/official treatment pending. | Keep pending direct rule source review. | No code change. |

## Pending evidence to collect

- Direct official Rules page or downloadable document from the federation site.
- Tournament regulation document, if separate from scoring rules.
- Any official scoring table that covers Dash, Dash Call, WITH, risk, double risk, and multiplier treatment.
- User confirmation for any house rule that differs from official tournament rules.

## Follow-up implementation stories

### US-216A — Federation Source Capture
Status: **Ready**

- Locate accessible official rules/regulations documents.
- Record document title, URL or file name, publication/update date if available, and relevant sections.
- Add citations or source notes for every reviewed scoring rule.
- Do not change code.

### US-216B — Confirm Rule Differences
Status: **Backlog**

- Compare official rules against the local project baseline.
- List exact differences and recommended project decision for each difference.
- Separate official tournament rules from user-preferred house rules.
- Create scoring implementation stories only for accepted differences.

### US-216C — Rule Change Implementation
Status: **Blocked until differences are confirmed**

- Implement only confirmed scoring changes.
- Add acceptance dataset rows for every changed rule.
- Update `PROJECT_RULES.md`, tests, README, and backlog with final decisions.
