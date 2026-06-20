# Acceptance Dataset

This dataset captures representative Egyptian Estimation scoring scenarios for MVP validation.
It is intentionally separate from Planning Poker concepts.

## Scoring Profile

The current MVP acceptance profile uses these local Egyptian Estimation values:

- Normal success: estimated tricks + 10.
- Normal failure: negative absolute delta between actual and estimated tricks.
- Bid owner / WITH win bonus: +10.
- Bid owner / WITH loss penalty: -10.
- Only winner bonus: +10.
- Only loser penalty: -10.
- Dash success: +10.
- Dash failure: negative delta.
- Dash Call success: +35.
- Dash Call failure: negative delta -25.
- Risk: total estimates 11 or 15 apply +/-10 to risk taker.
- Double Risk: total estimates 9 or 17 apply +/-20 to risk taker.
- All-loser round: current scores are zero; next round multiplier doubles.

## Round Cases

| Case | Round | Bids | Actual Tricks | Expected Scores | Notes |
| --- | --- | --- | --- | --- | --- |
| Under Risk | Under, risk taker D, total estimates 11 | A=3, B=3, C=3, D=2 | A=3, B=3, C=4, D=3 | A=13, B=13, C=-1, D=-11 | D fails and receives -10 risk penalty. |
| Over Double Risk | Over, risk taker D, total estimates 17 | A=4, B=4, C=4, D=5 | A=4, B=3, C=3, D=3 | A=24, B=-1, C=-1, D=-22 | A is only winner; D fails and receives -20 double-risk penalty. |
| Dash Call Failure | Over, risk taker A, total estimates 15 | A=Dash Call 0, B=5, C=5, D=5 | A=2, B=5, C=4, D=2 | A=-37, B=25, C=-1, D=-3 | A gets delta -2, Dash Call -25, risk -10. B is only winner. |
| WITH Win | Over, owner A, WITH player B, risk taker D, total estimates 15 | A=6, B=WITH 6, C=2, D=1 | A=6, B=6, C=1, D=0 | A=26, B=26, C=-1, D=-11 | Owner and WITH player both receive owner-style win bonus. |
| All Players Lose | Over, total estimates 15 | A=4, B=4, C=4, D=3 | A=3, B=3, C=3, D=4 | A=0, B=0, C=0, D=0 | Next round multiplier becomes x2. |
| Consecutive All-Loser | Over, current multiplier x2, total estimates 15 | A=4, B=4, C=4, D=3 | A=3, B=3, C=3, D=4 | A=0, B=0, C=0, D=0 | Next round multiplier escalates to x4. |

## Test Coverage

The executable coverage for this dataset is in `tests/acceptanceDataset.test.ts`.
