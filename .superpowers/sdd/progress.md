# Development Progress

## Earlier all-loser carry delivery

- Tasks 1-5 complete: chronological x2/x4/x6 carry, persistence/reopen, override isolation, and React coverage.

## UAT Round 2 - 2026-07-26

| Activity | Status | Completion |
|---|---|---:|
| Existing behavior investigation | Complete | 100% |
| Regression tests | Complete; RED and GREEN recorded | 100% |
| Dash Call implementation | Complete | 100% |
| All-loser carry correction | Complete | 100% |
| Persistence and projections | Complete | 100% |
| Full validation | Local `npm run ci` green: 188 engine, 98 UI, production build | 100% |
| Overall UAT Round 2 | Complete in draft PR #15; manual preview UAT remains a release gate | 100% |

## UAT Round 2 follow-up - 2026-07-26

| Activity | Status | Completion |
|---|---|---:|
| Estimate-highlight regression tests | Complete; RED and GREEN recorded | 100% |
| Actual-picker estimate suggestion | Complete | 100% |
| Legacy carry reconciliation tests | Complete; RED and GREEN recorded | 100% |
| Explicit override preservation | Complete | 100% |
| Migration decision | Complete; no migration required | 100% |
| Full validation | `npm run ci` green: 188 engine, 100 UI, production build | 100% |
| Publication and UAT | Draft PR update and preview smoke test pending | 70% |

## House Rules Under zero-estimate follow-up - 2026-07-28

| Activity | Status | Completion |
|---|---|---:|
| Approved rule design and plan | Complete | 100% |
| RED/GREEN scoring modifier | Complete: normal `0` receives `+10` or `-10` in House Rules Under | 100% |
| Modifier ordering and exclusions | Complete: Risk, winner/loser, carry, Multiple WITH, Dash Call, Over, exact-13, Federation, and all-loser covered | 100% |
| Online persistence and reopen | Complete: calculated/applied equality, no override, x2/x4 reopen covered | 100% |
| Migration decision | Complete; no migration or schema change required | 100% |
| Full validation | `npm run ci` green: 196 engine, 100 UI, production build | 100% |
| Publication and stable UAT | Published on stable alias; live success, failure, Dash Call exclusion, all-loser zero, x2 carry, persistence, and no-override smoke checks passed | 100% |
