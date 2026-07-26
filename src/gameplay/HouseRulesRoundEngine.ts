import { cardId, type Card, type ContractSuit } from '../domain/card.js';
import type { EstimationBid } from '../domain/bid.js';
import { BidValidationService } from '../services/BidValidationService.js';
import { LegalCardPlayService } from './LegalCardPlayService.js';
import type { RoundScoringPort } from './scoring/RoundScoringPort.js';
import { ScoreEngineRoundScoringAdapter } from './scoring/ScoreEngineRoundScoringAdapter.js';
import { TrickResolutionService } from './TrickResolutionService.js';
import {
  SEAT_INDICES,
  type CompletedGameplayTrick,
  type CreateHouseRulesRoundInput,
  type GameplaySeatPlayers,
  type GameplayStateTransition,
  type GameplayTrickEntry,
  type HouseRulesRoundState,
  type SeatHands,
  type SeatIndex,
  type SeatOrder,
} from './types.js';

export class HouseRulesRoundEngine {
  constructor(
    private readonly scoringPort: RoundScoringPort = new ScoreEngineRoundScoringAdapter(),
    private readonly bidValidationService = new BidValidationService(),
    private readonly legalCardPlayService = new LegalCardPlayService(),
    private readonly trickResolutionService = new TrickResolutionService(),
  ) {}

  create(input: CreateHouseRulesRoundInput): HouseRulesRoundState {
    this.validateCreateInput(input);

    return {
      roundNumber: input.roundNumber,
      phase: 'bidding',
      players: this.orderPlayers(input.players),
      hands: this.orderHands(input.hands),
      bidOrder: [...input.bidOrder] as unknown as SeatOrder,
      playOrder: [...input.playOrder] as unknown as SeatOrder,
      bidOwnerSeat: input.bidOwnerSeat,
      firstLeadSeat: input.firstLeadSeat,
      currentBidIndex: 0,
      currentTurnSeat: undefined,
      bids: [],
      currentTrick: [],
      completedTricks: [],
      actualTricksBySeat: [0, 0, 0, 0],
      roundMultiplier: input.roundMultiplier,
      multipleWithMultiplier: input.multipleWithMultiplier,
    };
  }

  submitBid(
    state: HouseRulesRoundState,
    seat: SeatIndex,
    bid: EstimationBid,
  ): GameplayStateTransition {
    if (state.phase !== 'bidding') {
      return this.reject(state, 'Estimates can only be submitted during the bidding phase.');
    }

    const expectedSeat = state.bidOrder[state.currentBidIndex];
    if (expectedSeat === undefined) {
      return this.reject(state, 'All four estimates have already been submitted.');
    }

    if (seat !== expectedSeat) {
      return this.reject(state, `Seat ${expectedSeat} must submit the next estimate.`);
    }

    const playerId = this.playerIdForSeat(state.players, seat);
    if (bid.playerId !== playerId) {
      return this.reject(state, `Seat ${seat} is assigned to player ${playerId}.`);
    }

    const bidOwnerPlayerId = this.playerIdForSeat(state.players, state.bidOwnerSeat);
    const individualValidation = this.bidValidationService.validateBid(bid, {
      playerCount: 4,
      cardsPerPlayer: 13,
      mode: 'round-estimates',
      bidOwnerPlayerId,
    });
    if (!individualValidation.valid) {
      return {
        valid: false,
        errors: individualValidation.errors,
        state,
      };
    }

    const tentativeBids = [...state.bids, bid];
    const isFinalBid = tentativeBids.length === 4;

    if (isFinalBid) {
      const fullValidation = this.scoringPort.validateBids(tentativeBids, {
        mode: 'round-estimates',
        bidOwnerPlayerId,
      });
      if (!fullValidation.valid) {
        return {
          valid: false,
          errors: fullValidation.errors,
          state,
        };
      }

      return {
        valid: true,
        errors: [],
        state: {
          ...state,
          phase: 'playing',
          currentBidIndex: 4,
          currentTurnSeat: state.firstLeadSeat,
          bids: tentativeBids,
        },
      };
    }

    return {
      valid: true,
      errors: [],
      state: {
        ...state,
        currentBidIndex: state.currentBidIndex + 1,
        bids: tentativeBids,
      },
    };
  }

  legalCards(state: HouseRulesRoundState, seat: SeatIndex): readonly Card[] {
    if (state.phase !== 'playing') {
      return [];
    }

    const hand = state.hands[seat];
    return this.legalCardPlayService.legalCards(hand.cards, state.currentTrick);
  }

  playCard(
    state: HouseRulesRoundState,
    seat: SeatIndex,
    card: Card,
  ): GameplayStateTransition {
    if (state.phase !== 'playing') {
      return this.reject(state, 'Cards can only be played during the playing phase.');
    }

    if (state.currentTurnSeat !== seat) {
      return this.reject(state, `Seat ${state.currentTurnSeat} must play the next card.`);
    }

    const hand = state.hands[seat];
    const validation = this.legalCardPlayService.validate(card, hand.cards, state.currentTrick);
    if (!validation.valid) {
      return {
        valid: false,
        errors: validation.errors,
        state,
      };
    }

    const nextHands = this.removeCard(state.hands, seat, card);
    const nextTrick = [...state.currentTrick, { seat, card } satisfies GameplayTrickEntry];

    if (nextTrick.length < 4) {
      return {
        valid: true,
        errors: [],
        state: {
          ...state,
          hands: nextHands,
          currentTrick: nextTrick,
          currentTurnSeat: this.nextSeat(state.playOrder, seat),
        },
      };
    }

    const contractSuit = this.contractSuit(state);
    const winnerSeat = this.trickResolutionService.resolve(nextTrick, contractSuit);
    const actualTricksBySeat = [...state.actualTricksBySeat] as [number, number, number, number];
    actualTricksBySeat[winnerSeat] += 1;

    const completedTrick: CompletedGameplayTrick = {
      trickNumber: state.completedTricks.length + 1,
      leaderSeat: nextTrick[0]!.seat,
      entries: nextTrick,
      winnerSeat,
    };
    const completedTricks = [...state.completedTricks, completedTrick];

    if (completedTricks.length < 13) {
      return {
        valid: true,
        errors: [],
        state: {
          ...state,
          hands: nextHands,
          currentTrick: [],
          completedTricks,
          actualTricksBySeat,
          currentTurnSeat: winnerSeat,
        },
      };
    }

    if (nextHands.some((seatHand) => seatHand.cards.length !== 0)) {
      throw new Error('Round reached thirteen completed tricks before all cards were consumed.');
    }

    const bidOwnerPlayerId = this.playerIdForSeat(state.players, state.bidOwnerSeat);
    const lastBidSeat = state.bidOrder[3];
    const riskPlayerId = this.playerIdForSeat(state.players, lastBidSeat);
    const scoreResult = this.scoringPort.scoreRound({
      roundNumber: state.roundNumber,
      bids: state.bids,
      actualResults: state.players.map(({ seat: playerSeat, playerId }) => ({
        playerId,
        actualTricks: actualTricksBySeat[playerSeat],
      })),
      bidOwnerPlayerId,
      riskPlayerId,
      roundMultiplier: state.roundMultiplier,
      multipleWithMultiplier: state.multipleWithMultiplier,
    });

    if (!scoreResult.valid || scoreResult.scoreResult === undefined) {
      throw new Error(`Round scoring failed after legal gameplay: ${scoreResult.errors.join(' ')}`);
    }

    return {
      valid: true,
      errors: [],
      state: {
        ...state,
        phase: 'scored',
        hands: nextHands,
        currentTrick: [],
        completedTricks,
        actualTricksBySeat,
        currentTurnSeat: undefined,
        scoreResult,
      },
    };
  }

  private validateCreateInput(input: CreateHouseRulesRoundInput): void {
    const errors: string[] = [];

    if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) {
      errors.push('Round number must be a positive integer.');
    }

    if (!this.isSeatPermutation(input.players.map((player) => player.seat))) {
      errors.push('Players must cover seats 0, 1, 2, and 3 exactly once.');
    }

    const playerIds = input.players.map((player) => player.playerId.trim());
    if (playerIds.some((playerId) => playerId.length === 0)) {
      errors.push('Every gameplay seat requires a player id.');
    }
    if (new Set(playerIds).size !== 4) {
      errors.push('Gameplay player ids must be unique.');
    }

    if (!this.isSeatPermutation(input.hands.map((hand) => hand.seat))) {
      errors.push('Hands must cover seats 0, 1, 2, and 3 exactly once.');
    }
    if (input.hands.some((hand) => hand.cards.length !== 13)) {
      errors.push('Every gameplay seat must start with exactly thirteen cards.');
    }

    const dealtCards = input.hands.flatMap((hand) => hand.cards);
    if (dealtCards.length !== 52 || new Set(dealtCards.map(cardId)).size !== 52) {
      errors.push('Gameplay hands must contain all fifty-two unique cards exactly once.');
    }

    if (!this.isSeatPermutation(input.bidOrder)) {
      errors.push('Bidding order must contain seats 0, 1, 2, and 3 exactly once.');
    }
    if (!this.isSeatPermutation(input.playOrder)) {
      errors.push('Play order must contain seats 0, 1, 2, and 3 exactly once.');
    }
    if (!input.bidOrder.includes(input.bidOwnerSeat)) {
      errors.push('Bid owner seat must exist in the bidding order.');
    }
    if (!input.playOrder.includes(input.firstLeadSeat)) {
      errors.push('First lead seat must exist in the play order.');
    }

    if (input.roundMultiplier !== undefined && (!Number.isInteger(input.roundMultiplier) || input.roundMultiplier < 1)) {
      errors.push('Round multiplier must be a positive integer when provided.');
    }
    if (input.multipleWithMultiplier !== undefined && ![1, 2].includes(input.multipleWithMultiplier)) {
      errors.push('Multiple-With multiplier must be 1 or 2 when provided.');
    }

    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }
  }

  private orderPlayers(players: GameplaySeatPlayers): GameplaySeatPlayers {
    return SEAT_INDICES.map((seat) => {
      const player = players.find((candidate) => candidate.seat === seat);
      if (player === undefined) {
        throw new Error(`Missing player for seat ${seat}.`);
      }
      return { ...player, playerId: player.playerId.trim() };
    }) as unknown as GameplaySeatPlayers;
  }

  private orderHands(hands: SeatHands): SeatHands {
    return SEAT_INDICES.map((seat) => {
      const hand = hands.find((candidate) => candidate.seat === seat);
      if (hand === undefined) {
        throw new Error(`Missing hand for seat ${seat}.`);
      }
      return { seat, cards: [...hand.cards] };
    }) as unknown as SeatHands;
  }

  private isSeatPermutation(seats: readonly number[]): boolean {
    return seats.length === 4
      && new Set(seats).size === 4
      && SEAT_INDICES.every((seat) => seats.includes(seat));
  }

  private playerIdForSeat(players: GameplaySeatPlayers, seat: SeatIndex): string {
    return players[seat].playerId;
  }

  private removeCard(hands: SeatHands, seat: SeatIndex, selectedCard: Card): SeatHands {
    const selectedCardId = cardId(selectedCard);
    let removed = false;

    return hands.map((hand) => {
      if (hand.seat !== seat) {
        return hand;
      }

      return {
        ...hand,
        cards: hand.cards.filter((card) => {
          if (!removed && cardId(card) === selectedCardId) {
            removed = true;
            return false;
          }
          return true;
        }),
      };
    }) as unknown as SeatHands;
  }

  private nextSeat(order: SeatOrder, seat: SeatIndex): SeatIndex {
    const index = order.indexOf(seat);
    if (index === -1) {
      throw new Error(`Seat ${seat} does not exist in the play order.`);
    }
    return order[(index + 1) % order.length]!;
  }

  private contractSuit(state: HouseRulesRoundState): ContractSuit {
    const bidOwnerPlayerId = this.playerIdForSeat(state.players, state.bidOwnerSeat);
    const contractSuit = state.bids.find((bid) => bid.playerId === bidOwnerPlayerId)?.trumpSuit;
    if (contractSuit === undefined) {
      throw new Error('Accepted bidding does not contain the bid owner contract suit.');
    }
    return contractSuit;
  }

  private reject(state: HouseRulesRoundState, error: string): GameplayStateTransition {
    return {
      valid: false,
      errors: [error],
      state,
    };
  }
}
