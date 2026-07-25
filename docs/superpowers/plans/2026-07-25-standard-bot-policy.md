# Standard Estimation Bot Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, explainable Standard bot that receives only its private hand plus public state, chooses only legal actions, estimates exact-trick probabilities, and selects bids/cards for House Rules V1.

**Architecture:** A projection service creates an allow-listed observation from authoritative round state. Focused policies handle card mode/selection and bid expected utility. A final orchestrator adds policy versioning, decision metadata, time limits, and deterministic fallback without exposing database access or hidden hands.

**Tech Stack:** TypeScript 5.5+, Node.js 24, Node test runner, existing gameplay engine and House Rules V1 scoring services.

## Global Constraints

- The bot receives no opponent hand, deal seed, shuffled deck, future cards, private reconnect data, or unpublished bot decision.
- Every selected bid/card must already be present in the supplied legal-action list.
- Illegal-action rate must remain zero in deterministic bot-vs-bot simulations.
- The objective is exact-estimate success and House Rules V1 expected score, not maximum trick count.
- Policy version for the MVP is `STANDARD_V1`.
- Card modes are `acquire`, `control`, `dump`, `recovery`, and `endgame`.
- Decision reason codes are stable audit values, not localized user-facing text.
- The policy is deterministic for the same observation.
- `npm run ci` is required after every task.

---

### Task 1: Allow-listed card observation and deterministic legal fallback

**Status:** Completed. RED CI #699; GREEN CI #703.

**Delivered:** `BotObservationService`, `StandardCardPolicy`, privacy-contract tests, and a complete four-bot card-play round with zero illegal actions.

---

### Task 2: Hand-strength evaluator and exact-trick probability distribution

**Status:** Completed. RED CI #704; GREEN CI #708.

**Delivered:** `HandStrengthEvaluator` with a normalized deterministic 0–13 probability distribution based on honours, suit structure, trump strength, ruffing potential, and No Trump stoppers.

---

### Task 3: Legal bid expected-utility policy

**Status:** Completed. RED CI #709; GREEN CI #712.

**Delivered:** `StandardBidPolicy`, evaluating only supplied legal bids through the existing House Rules V1 scoring strategy for every actual-trick outcome.

---

### Task 4: Time-bounded Standard bot orchestrator and fallback audit metadata

**Status:** Completed. RED CI #713; GREEN CI #716.

**Delivered:** `StandardBotPolicy` with legal-output validation, policy/source/reason auditing, hard-limit detection, and deterministic card/bid fallback.

---

### Task 5: Bot simulation and baseline metrics

**Status:** Completed. RED CI #717; GREEN CI #720.

**Delivered:** `BotSimulationService`, seeded four-bot bidding and 52-card play, House Rules V1 scoring, exact-match/mean-error/average-score metrics, reason counts, and deterministic replay verification.
