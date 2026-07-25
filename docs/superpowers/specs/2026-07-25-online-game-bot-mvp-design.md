# Online Estimation Game and Computer-Player MVP Design

**Date:** 25 July 2026  
**Status:** Approved for implementation  
**Rule set:** House Rules V1 only  
**Parent delivery:** Online UAT score calculator and shared player directory

## 1. Purpose

Deliver a playable, real-time, four-seat online Egyptian Estimation game. One to four humans may join a table. When the host starts the game, Standard computer players immediately fill all vacant seats. The game server deals private hands, runs bidding and trick play, validates every action, invokes the existing House Rules V1 scoring engine, and preserves a complete audit and replay record.

The primary computer-player objective is not to maximize tricks. It is to maximize the probability and expected score of matching its estimate exactly. After reaching its estimate, the bot must actively avoid unnecessary tricks.

This phase is developed separately from online-UAT stabilization so that current UAT deployment and defect resolution are not delayed.

## 2. Research basis

The design combines techniques from related trick-taking games while preserving Estimation's exact-target objective:

- **Oh Hell and Wizard:** exact-bid success, where both undertricks and overtricks represent failure.
- **Bridge:** hidden-card belief tracking, void inference, hand sampling, deterministic replay, and search-based card evaluation.
- **Tarneeb:** hand-strength evaluation, trump selection, honour and suit-length analysis, and competitive bidding.
- **Spades:** Nil-style trick avoidance, controlled disposal of winners, and expected-utility bidding.
- **400:** individual trick estimates, risk-aware bidding, and adaptation to game score.

Bridge, Tarneeb, Spades, and 400 strategies cannot be copied directly because their usual objective is to meet or exceed a contract. Estimation requires a bot to switch deliberately between acquiring tricks and avoiding tricks.

## 3. MVP scope

### Included

- House Rules V1 only.
- Real-time synchronous play.
- Four seats per table.
- One to four signed-in human players.
- Standard computer players filling vacant seats when the host presses **Start Game**.
- Private invite-only tables by link or code.
- Public tables listed in a lobby.
- Public-table join policy selected by the host: open join or host approval.
- Server-authoritative dealing, bidding, card play, trick resolution, and scoring.
- Host-configurable turn timer.
- Host-configurable disconnect grace period.
- One-turn bot assistance when a connected player's timer expires.
- Temporary bot takeover after a disconnected player's grace period expires.
- Human reclaim at the next safe, uncommitted action boundary.
- Pause, resume, termination, audit history, fair-deal verification, and deterministic replay.

### Excluded from the MVP

- Federation 2026 gameplay.
- Asynchronous games.
- Multiple bot difficulty levels.
- Machine-learning or LLM-based decisions.
- Public ranked competition, prizes, or matchmaking ratings.
- Human replacement of a pre-game bot after dealing begins.
- Spectator mode.
- Cross-game adaptive learning from individual players.
- Full mental-poker cryptography that hides the deck from the server.

## 4. Table and lobby behavior

### 4.1 Table types

A host creates either:

- **Private table:** hidden from the public lobby and joinable through its link or code.
- **Public table:** visible in the public lobby with host, occupied-seat count, join policy, turn timer, disconnect grace period, and status.

### 4.2 Public join policies

The host selects one policy before play:

- **Open join:** any signed-in player immediately occupies an available human seat.
- **Approval required:** the host accepts or rejects each pending join request.

The host may change the policy before play. Joining closes when the host starts the game.

### 4.3 Starting the game

When the host presses **Start Game**:

1. The server validates that the table is startable and no start command has already succeeded.
2. Every vacant seat is filled immediately by a clearly labelled Standard bot.
3. Seat assignments and table settings are locked.
4. A fair deal is generated and committed.
5. The game enters the bidding phase.

A table may therefore start with one, two, three, or four humans.

### 4.4 Host succession before play

When the host leaves before the game starts, host control transfers immediately to the longest-waiting connected human, determined by earliest accepted table-join time. Existing settings remain. If no human remains, the table closes automatically.

## 5. Authoritative game state machine

The server owns the state machine. Clients display state and propose commands but cannot directly mutate authoritative game records.

```text
LOBBY
  -> DEALING
  -> BIDDING
  -> PLAYING_TRICK
  -> ROUND_SCORING
  -> NEXT_ROUND or COMPLETED

NEXT_ROUND -> DEALING
Any active state may become PAUSED.
LOBBY may become CLOSED.
Any active game may become TERMINATED.
```

Dealer rotation, play direction, bidding order, and round progression follow the accepted House Rules V1 baseline. This design introduces no alternative dealing or turn-order rule.

Every command includes an idempotency key and expected game version. A successful command increments the version. Duplicate commands return the original result. Stale or out-of-turn commands are rejected without partial mutation.

The game command service validates:

- authenticated actor and seat control;
- current phase and turn;
- legal bid or legal card;
- follow-suit requirements;
- House Rules V1 bidding constraints, including total estimates not equalling 13;
- game version and command idempotency;
- pause, completion, or termination status.

## 6. Fair dealing and verification

### 6.1 Canonical deck

The server constructs one canonical 52-card deck with immutable card identifiers covering all combinations of four suits and thirteen ranks. Each identifier occurs exactly once.

### 6.2 Seed generation and commitment

For every deal, the server generates:

- a fresh 256-bit seed from a cryptographically secure operating-system random source;
- a unique deal ID and nonce;
- a commitment calculated from the seed, deal ID, game ID, rule-set ID, and nonce.

The commitment is stored and made public before any hand is exposed. The seed remains secret during active play.

### 6.3 Shuffle

The server uses deterministic Fisher-Yates driven by a cryptographic random stream derived from the seed. Every bounded index is selected through an unbiased algorithm such as secure `randomInt` or rejection sampling. The implementation must not use `Math.random()`, modulo-biased index selection, or random sort comparators.

### 6.4 Distribution

Cards are distributed face down, one card at a time in the House Rules V1 seat direction, beginning with the seat required by the accepted dealer rule and cycling through all four seats until each seat has exactly thirteen cards. The dealing algorithm is identical for human and bot seats.

### 6.5 Privacy

- A human client receives only the cards belonging to its authenticated seat.
- A bot receives only its own hand and public observations.
- Other hands and future deck order are never included in client or bot payloads.
- Database row-level security and server DTO boundaries enforce this rule.

### 6.6 Reveal and verification

The seed and nonce are revealed automatically after the game is **Completed** or **Terminated**. A verifier can reconstruct the shuffle and confirm that:

- the pre-game commitment matches;
- the deck contained 52 unique cards;
- each seat received the recorded thirteen cards;
- the played-card history is consistent with the deal.

The reveal is retained with the permanent game audit record.

## 7. Real-time synchronization and command placement

Supabase remains the persistence and authentication platform. Every gameplay command enters an authenticated Supabase Edge Function. The Edge Function loads the authorized observation, applies the TypeScript gameplay/legal-action engine, invokes the Standard bot when required, and calls a narrow transactional PostgreSQL RPC to commit the accepted command, expected version, event records, and resulting snapshot atomically.

Clients cannot write authoritative gameplay tables directly. PostgreSQL RPCs do not decide strategy; they enforce transaction integrity, idempotency, expected-version checks, and append-only event persistence.

Committed public state changes are distributed through Supabase Realtime. Private hand state is fetched through seat-scoped, row-level-secured queries. Reconnect uses the latest authoritative snapshot plus events after the snapshot version.

The client must tolerate duplicate, delayed, and out-of-order real-time notifications by comparing game versions and reloading the authoritative snapshot when a gap is detected.

## 8. Standard computer player

### 8.1 Safety boundary

The server supplies a `BotObservation`, not a database connection. It contains:

- the bot's hand;
- legal actions;
- public bids and bid order;
- trump and public House Rules V1 state;
- current trick and prior tricks;
- public trick winners and scores;
- the bot's estimate, tricks already won, and turns remaining.

It excludes opponent hands, future deck order, hidden seed, private reconnect information, and other bots' unpublished decisions. Contract tests must fail if prohibited data is added.

### 8.2 Bidding objective

The bot estimates a probability distribution for taking 0 through 13 tricks. It evaluates each legal estimate using the existing House Rules V1 scoring engine and current game context:

```text
Expected utility(bid) = sum over t of
  P(actual tricks = t | observation) * HouseRulesScore(bid, t, context)
```

The evaluation considers honours, suit length and concentration, voids and short suits, trump quality, No Trump control, bidding position, prior bids, Over/Under total, Risk exposure, WITH/Hold implications, leaderboard position, and remaining rounds.

The bot chooses only from legal bids. The estimate-total validation remains authoritative in the gameplay engine.

### 8.3 Card-play modes

For each turn:

```text
neededTricks = estimate - tricksAlreadyWon
remainingTricks = cardsRemaining
```

The policy operates in one of these modes:

- **Acquire:** win required tricks while preserving entries and future winners.
- **Control:** remain on a plausible path to the exact target and avoid unnecessary volatility.
- **Dump:** after reaching the target, dispose of dangerous winners and avoid taking another trick.
- **Recovery:** when exact success is unlikely or impossible, choose the legal action with the best expected score and lowest additional damage.
- **Endgame:** with few cards remaining, enumerate or search legal continuations for exact outcomes.

V1 combines deterministic heuristics, card counting, known-void tracking, and shallow bounded search. It does not use an LLM or external paid inference API.

### 8.4 Decision-time budget

A Standard bot decision must complete within **2 seconds at the 95th percentile** and **5 seconds at the absolute maximum** in the UAT load profile. If the primary policy has not selected an action by 5 seconds, the server executes a deterministic fallback policy that chooses a legal action within an additional 250 milliseconds. The fallback prioritizes mandatory follow-suit, exact-target preservation, and then minimum expected damage.

### 8.5 Explainability and versioning

Every bot action records:

- bot policy version;
- legal actions considered;
- selected action;
- short reason code, such as `ACQUIRE_REQUIRED_TRICK`, `AVOID_OVERTRICK`, `FOLLOW_SUIT_ONLY_ACTION`, `POLICY_TIMEOUT_FALLBACK`, or `MINIMIZE_DAMAGE`;
- decision duration;
- whether it acted as a permanent bot, disconnect substitute, or one-turn timeout assistant.

Past games always retain their original bot version for replay and diagnosis.

## 9. Timers, disconnection, takeover, and reclaim

### 9.1 Turn timer

The host selects **20, 30, 45, 60, or 90 seconds** before play. Default: **45 seconds**. The value applies to bidding and card-play actions and is locked when dealing begins.

When a connected human's timer expires:

- the Standard bot makes exactly one legal action for that turn;
- the human retains ownership and control of the seat for future turns;
- repeated expiries continue to trigger one-turn bot actions indefinitely;
- no takeover occurs solely because of repeated timeouts;
- the timeout and bot action are audited.

### 9.2 Disconnect grace period

The host selects **30, 60, 90, or 120 seconds** before play. Default: **60 seconds**. The value is locked when dealing begins.

When a human disconnects:

1. The grace countdown starts.
2. The game continues for other seats where possible.
3. If the player's turn expires during the grace period, the normal one-turn bot action applies.
4. After the grace period expires, a Standard bot temporarily controls that seat.

### 9.3 Human reclaim

A returning human reclaims control at the next safe action boundary before the seat's next uncommitted bid or card action.

- When the bot has not committed the pending action, control returns immediately.
- When the bot action is already committed or transactionally processing, that action remains final and the human resumes before the following seat action.
- Bot actions, takeover, reconnect, and reclaim remain valid and audited.
- The server is the sole authority for seat-control ownership, preventing simultaneous human and bot actions.

A bot added to a vacant seat at game start is permanent for that game and cannot be replaced by a later human.

## 10. Host authority during play

If the host disconnects during an active game, host privileges transfer immediately to the longest-connected human. The disconnected seat separately follows its normal grace period and bot-takeover process. Host privileges do not automatically return after reconnection.

During active play, the host may only:

- pause the game;
- resume the game;
- close the table after explicit confirmation.

The host cannot remove a connected player, view private hands, alter bids or cards, edit gameplay scores, change timers, or override outcomes.

Pausing freezes turn timers, disconnect-grace countdowns, and uncommitted bot decisions. Resuming restarts them from their remaining durations.

## 11. Termination

After host confirmation, closing an active game:

- immediately stops timers and pending uncommitted bot decisions;
- rejects further gameplay commands;
- marks the game **Terminated**, not Completed;
- preserves the deal, hands, bids, cards, tricks, partial scoring, bot actions, and audit history;
- reveals the shuffle seed and nonce for verification;
- allows read-only history and deterministic replay;
- excludes the game from completed-game rankings and formal performance statistics;
- records the acting host and timestamp.

## 12. Existing scoring-engine integration

The existing House Rules V1 services remain the single scoring authority. The gameplay layer supplies validated bidding context and actual trick counts; it does not reimplement scoring formulas.

Boundaries:

- gameplay determines legal bids, cards, trick winners, and actual tricks;
- the existing score engine calculates player scores, Risk, WITH, Hold, high contracts, all-loser behavior, and carry rules;
- the selected House Rules V1 rule set is fixed for the full game;
- scoring inputs and outputs are frozen into the gameplay audit record.

## 13. Data and audit model

The persistence model must represent at least:

- tables, visibility, join policy, settings, host, and lifecycle;
- seats, human users, permanent bots, temporary bot control, and join timestamps;
- deals, commitment, seat-scoped private-hand rows, revealed seed, and verification state;
- rounds, bids, trump, Risk/WITH/Hold metadata, tricks, played cards, and trick winners;
- game commands with idempotency key, actor, expected version, outcome, and timestamp;
- bot decisions with policy version and reason code;
- connection, timeout, takeover, reclaim, host-transfer, pause, resume, completion, and termination events;
- score-engine input/output snapshots.

Private-hand rows rely on Supabase encryption at rest plus strict seat-scoped row-level security. The application does not introduce custom reversible card encryption in the MVP.

The action log is append-only. Derived snapshots may be rebuilt from the deal plus accepted events.

## 14. Error handling

User-facing errors must distinguish:

- not authenticated or no longer a table member;
- table full or join request no longer valid;
- game already started;
- stale game version;
- not the active seat or seat currently bot-controlled;
- illegal bid or card;
- game paused, completed, terminated, or closed;
- command already processed;
- temporary server or realtime failure.

On ambiguous network failure, the client reloads the authoritative snapshot before allowing another action. It must never assume a command failed solely because the response was lost.

## 15. Security and integrity controls

- All gameplay writes pass through server-authoritative commands.
- Row-level security protects membership and private hands.
- Service-role credentials never reach browsers.
- Bot observations are constructed from allow-listed fields.
- The server checks turn, phase, legal action, expected version, and idempotency in one transaction.
- Public lobby records expose no private game data.
- Rate limits protect table creation, join requests, and command submission.
- Audit events retain actor, source, IP/session metadata where permitted, and server timestamp.
- Automated checks verify that no hidden cards leak through realtime payloads, logs, analytics, or error messages.

## 16. Testing and acceptance

### 16.1 Dealing

- Every generated deck has 52 unique cards.
- Every seat receives exactly 13 cards.
- The same seed and configuration reproduce the same deck and hands.
- The commitment fails verification when seed, nonce, deck, or hands are altered.
- A deterministic statistical test corpus of at least **100,000 distinct seeds** keeps each card's frequency in each seat within **±2% of the expected 25% frequency**.

### 16.2 Gameplay

- Only legal bids and cards can be committed.
- Follow-suit behavior is enforced.
- Exactly one action is accepted per turn.
- Duplicate command submission is idempotent.
- Stale and concurrent commands are rejected safely.
- Completed trick counts feed the existing House Rules V1 scoring engine correctly.

### 16.3 Bot

- Bot observations never contain opponent hands or future deck state.
- Illegal-action rate is zero.
- The bot can acquire needed tricks and deliberately avoid overtricks after reaching its estimate.
- Deterministic fixtures cover exact-target, unavoidable overtrick, Risk, WITH, Hold, high-contract, and all-loser cases.
- Bot-versus-bot simulations complete without deadlock and produce replayable games.
- UAT measurements satisfy the 2-second p95 and 5-second hard decision-time limits; forced policy timeouts select a legal fallback within 250 milliseconds.

### 16.4 Online behavior

- One to four humans can start a four-seat game.
- Empty seats become bots only when the host starts.
- Public open join and approval-required join work correctly.
- Private link/code access is enforced.
- Turn timeout triggers one bot action and returns control to the human.
- Disconnect grace, temporary takeover, reconnect, and reclaim behave at transaction boundaries.
- Host succession works before and during play.
- Pause freezes timers; resume restores them.
- Termination preserves history, reveals the seed, and excludes formal statistics.
- Realtime reconnect recovers from missed and duplicate events.

### 16.5 Release gate

The MVP is not complete until:

- all unit, property, integration, concurrency, security, and browser tests pass;
- the gameplay UAT environment is deployed separately from production;
- at least one 1-human/3-bot game and one multi-human game are completed end to end;
- a terminated game is verified and replayed;
- the seed commitment is independently reconstructed;
- no private-hand leakage is found in browser network traces or logs;
- known limitations and bot policy version are visible in the UAT release notes.

## 17. Delivery sequencing

1. Gameplay domain model and legal-action engine.
2. Secure deterministic deal and verification library.
3. Server-authoritative command processor and event log.
4. Lobby, seats, public/private joining, and host succession.
5. Real-time snapshots, private-hand projection, and reconnect.
6. House Rules V1 bidding and trick-play flow.
7. Standard bot bidding and legal card play.
8. Timers, one-turn assistance, disconnect takeover, and reclaim.
9. Pause, resume, completion, termination, and replay.
10. Security, load, simulation, and end-to-end UAT validation.

Implementation proceeds under the user's standing approval. Gameplay work remains isolated from the current online-UAT stabilization branch until its integration points are explicitly ready.
