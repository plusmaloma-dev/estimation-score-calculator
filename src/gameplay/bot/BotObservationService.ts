import { HouseRulesRoundEngine } from '../HouseRulesRoundEngine.js';
import type { HouseRulesRoundState, SeatIndex } from '../types.js';
import {
  STANDARD_BOT_POLICY_VERSION,
  type BotCardObservation,
} from './types.js';

export class BotObservationService {
  constructor(private readonly roundEngine = new HouseRulesRoundEngine()) {}

  createCardObservation(
    state: HouseRulesRoundState,
    seat: SeatIndex,
  ): BotCardObservation {
    if (state.phase !== 'playing') {
      throw new Error('Bot card observation requires the playing phase.');
    }
    if (state.currentTurnSeat !== seat) {
      throw new Error(`Seat ${seat} is not the active card-play seat.`);
    }

    const player = state.players[seat];
    const playerBid = state.bids.find((bid) => bid.playerId === player.playerId);
    if (playerBid === undefined) {
      throw new Error(`Missing accepted estimate for player ${player.playerId}.`);
    }

    const contractSuit = state.trumpSuit;
    if (contractSuit === undefined) {
      throw new Error('Accepted bidding does not contain a contract suit.');
    }

    const hand = [...state.hands[seat].cards];

    return {
      policyVersion: STANDARD_BOT_POLICY_VERSION,
      seat,
      hand,
      legalCards: [...this.roundEngine.legalCards(state, seat)],
      bids: state.bids.map((bid) => ({ ...bid })),
      contractSuit,
      currentTrick: state.currentTrick.map((entry) => ({
        seat: entry.seat,
        card: { ...entry.card },
      })),
      completedTricks: state.completedTricks.map((trick) => ({
        trickNumber: trick.trickNumber,
        leaderSeat: trick.leaderSeat,
        winnerSeat: trick.winnerSeat,
        entries: trick.entries.map((entry) => ({
          seat: entry.seat,
          card: { ...entry.card },
        })),
      })),
      estimate: playerBid.tricks,
      tricksWon: state.actualTricksBySeat[seat],
      cardsRemaining: hand.length,
    };
  }
}
