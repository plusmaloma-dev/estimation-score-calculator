import type { EstimationBid } from '../../domain/bid.js';
import { CONTRACT_SUITS } from '../../domain/card.js';
import type { HouseRulesRoundState, SeatIndex } from '../types.js';
import {
  STANDARD_BOT_POLICY_VERSION,
  type BotBidObservation,
} from './types.js';

export class BotBidObservationService {
  create(
    state: HouseRulesRoundState,
    seat: SeatIndex,
    currentScores: Readonly<Record<string, number>> = {},
  ): BotBidObservation {
    if (state.phase !== 'bidding') {
      throw new Error('Bot bid observation requires the bidding phase.');
    }
    const activeSeat = state.bidOrder[state.currentBidIndex];
    if (activeSeat !== seat) {
      throw new Error(`Seat ${seat} is not the active bidder.`);
    }

    const playerId = state.players[seat].playerId;
    const bidOwnerPlayerId = state.players[state.bidOwnerSeat].playerId;
    const legalBids = this.legalBids(state, seat);

    return {
      policyVersion: STANDARD_BOT_POLICY_VERSION,
      playerId,
      hand: [...state.hands[seat].cards],
      legalBids,
      priorBids: state.bids.map((bid) => ({ ...bid })),
      bidOwnerPlayerId,
      isLastBidder: state.currentBidIndex === 3,
      currentScores: Object.fromEntries(
        state.players.map(({ playerId: id }) => [id, currentScores[id] ?? 0]),
      ),
    };
  }

  private legalBids(
    state: HouseRulesRoundState,
    seat: SeatIndex,
  ): readonly EstimationBid[] {
    const playerId = state.players[seat].playerId;
    const bidOwnerPlayerId = state.players[state.bidOwnerSeat].playerId;
    let candidates: EstimationBid[] = [];

    if (seat === state.bidOwnerSeat) {
      for (let tricks = 4; tricks <= 7; tricks += 1) {
        for (const trumpSuit of CONTRACT_SUITS) {
          candidates.push({
            playerId,
            bidType: 'normal',
            tricks,
            trumpSuit,
          });
        }
      }
    } else {
      const ownerBid = state.bids.find((bid) => bid.playerId === bidOwnerPlayerId);
      if (ownerBid === undefined) {
        throw new Error('Bid owner must act before other Standard bot bidders.');
      }
      for (let tricks = 1; tricks < ownerBid.tricks; tricks += 1) {
        candidates.push({ playerId, bidType: 'normal', tricks });
      }
      candidates.push({
        playerId,
        bidType: 'with',
        tricks: ownerBid.tricks,
        withTargetPlayerId: bidOwnerPlayerId,
      });
    }

    if (state.currentBidIndex === 3) {
      const currentTotal = state.bids.reduce((total, bid) => total + bid.tricks, 0);
      candidates = candidates.filter((bid) => currentTotal + bid.tricks !== 13);
    }
    if (candidates.length === 0) {
      throw new Error(`No legal Standard bot bids remain for seat ${seat}.`);
    }
    return candidates;
  }
}
