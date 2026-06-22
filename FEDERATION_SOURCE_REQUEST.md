# Federation Source Request

## Purpose

This document defines the exact evidence needed to unblock US-216B and US-216C without mixing Egyptian Estimation with Planning Poker or changing scoring behavior from incomplete sources.

## Current blocker

Repeated English and Arabic public searches have not exposed a retrievable official detailed Egyptian Estimation scoring rulebook, rules page, or tournament regulation document. Until a detailed source is available, `PROJECT_RULES.md` remains the active local baseline built from user-confirmed rules.

## Requested source package

Collect one or more of the following from the Egyptian Bridge Federation, Estimation Committee, tournament organizers, or an explicitly user-confirmed house-rule reference:

- Official rules or laws document for Egyptian Estimation.
- Tournament regulation document that includes scoring rules.
- Official scoring table for Dash, Dash Call, WITH, risk, double risk, high contracts, all-loser multiplier, and any multiplier cap.
- Official or organizer-published clarification for total-bid validation, especially the rule that total estimates cannot equal 13.
- Official or organizer-published trump/suit ordering, including No Trump treatment.

## Minimum metadata to capture

For every source, record:

- Source title.
- Publisher or owner.
- URL, file name, or screenshot/source location.
- Publication date, update date, or retrieval date.
- Language.
- Relevant section/page/table.
- Whether it represents official tournament rules, league rules, or house rules.

## Rule-by-rule evidence checklist

| Rule area | Evidence needed before implementation change |
| --- | --- |
| Game scope | Source confirms Egyptian Estimation as the target trick-taking card game. |
| Players and deck | Source confirms four players and 52-card deck, or states allowed variants. |
| Round total | Source confirms total bids/estimates cannot equal 13 and defines Under/Over behavior. |
| Trump hierarchy | Source confirms suit/trump order and No Trump position. |
| Dash | Source confirms Dash scoring in Over and failure behavior. |
| Dash Call | Source confirms pre-bidding Dash Call timing, success value, failure penalty, and interaction with other bonuses. |
| WITH | Source confirms WITH behavior for normal and high contracts. |
| Risk taker | Source confirms that the last bidder determines Under/Over and receives risk impact. |
| Risk/double risk | Source confirms threshold totals, success bonus, failure penalty, and values. |
| All-loser multiplier | Source confirms multiplier trigger, compounding, reset, and any cap. |

## Decision flow

1. Add the source details to `FEDERATION_RULE_REVIEW.md`.
2. Compare the source against `PROJECT_RULES.md`.
3. Mark each rule as official, user-confirmed house rule, conflicting, or still unknown.
4. Create implementation stories only for accepted, source-confirmed differences.
5. Keep all scoring behavior unchanged when evidence is missing, unrelated, or ambiguous.

## Out of scope

- Planning Poker estimation rules.
- Unrelated card games such as Egyptian Ratscrew or Basra.
- General search snippets without a retrievable source.
- Scoring changes based only on absence of evidence.
