import type { EstimationBid } from '../../domain/bid.js';
import { HouseRulesBidOptionsService } from '../HouseRulesBidOptionsService.js';
import type { HouseRulesRoundState, SeatIndex } from '../types.js';
import { STANDARD_BOT_POLICY_VERSION, type BotBidObservation } from './types.js';

/** Estimate-only observation. Auction commands use legalAuctionActions directly. */
export class BotBidObservationService {
  constructor(private readonly bidOptions = new HouseRulesBidOptionsService()) {}

  create(
    state: HouseRulesRoundState,
    seat: SeatIndex,
    currentScores: Readonly<Record<string, number>> = {},
  ): BotBidObservation {
    if (state.phase !== 'estimate') throw new Error('Bot bid observation requires the estimate phase.');
    if (state.estimateOrder[state.currentEstimateIndex] !== seat) throw new Error(`Seat ${seat} is not the active estimator.`);
    const playerId = state.players[seat].playerId;
    const legalBids: EstimationBid[] = this.bidOptions.legalOptions(state, seat).map((option) => ({
      playerId,
      bidType: 'normal',
      tricks: option.tricks,
    }));
    if (legalBids.length === 0) throw new Error(`No legal Standard bot estimates remain for seat ${seat}.`);
    const bidOwnerPlayerId = state.callerSeat === undefined ? undefined : state.players[state.callerSeat].playerId;
    return {
      policyVersion: STANDARD_BOT_POLICY_VERSION,
      playerId,
      hand: [...state.hands[seat].cards],
      legalBids,
      priorBids: state.bids.map((bid) => ({ ...bid })),
      ...(bidOwnerPlayerId === undefined ? {} : { bidOwnerPlayerId }),
      isLastBidder: state.currentEstimateIndex === state.estimateOrder.length - 1,
      currentScores: Object.fromEntries(state.players.map(({ playerId: id }) => [id, currentScores[id] ?? 0])),
    };
  }
}
