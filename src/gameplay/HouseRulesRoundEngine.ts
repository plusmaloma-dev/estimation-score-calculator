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
  type GameplayAuctionAction,
  type GameplayAuctionContract,
  type GameplayAuctionHistoryEntry,
  type GameplaySeatPlayers,
  type GameplayStateTransition,
  type GameplayTrickEntry,
  type HouseRulesRoundState,
  type SeatHands,
  type SeatIndex,
  type SeatOrder,
} from './types.js';

const CONTRACT_ORDER: readonly ContractSuit[] = [
  'clubs', 'diamonds', 'hearts', 'spades', 'no-trump',
];

export class HouseRulesRoundEngine {
  constructor(
    private readonly scoringPort: RoundScoringPort = new ScoreEngineRoundScoringAdapter(),
    private readonly bidValidationService = new BidValidationService(),
    private readonly legalCardPlayService = new LegalCardPlayService(),
    private readonly trickResolutionService = new TrickResolutionService(),
  ) {}

  create(input: CreateHouseRulesRoundInput): HouseRulesRoundState {
    this.validateCreateInput(input);
    const dealerSeat = input.dealerSeat ?? input.bidOwnerSeat ?? input.bidOrder[3]!;
    const auctionFirstSeat = this.nextSeat(input.playOrder, dealerSeat);
    const auctionOrder = this.rotatingOrder(auctionFirstSeat);

    return {
      roundNumber: input.roundNumber,
      phase: 'auction',
      players: this.orderPlayers(input.players),
      hands: this.orderHands(input.hands),
      dealerSeat,
      bidOrder: auctionOrder,
      auctionOrder,
      playOrder: [...input.playOrder] as unknown as SeatOrder,
      firstLeadSeat: input.firstLeadSeat,
      auctionActiveSeat: auctionFirstSeat,
      passedAuctionSeats: [],
      consecutiveAuctionPasses: 0,
      auctionHistory: [],
      estimateOrder: [],
      currentEstimateIndex: 0,
      allPassAuction: false,
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

  submitAuctionAction(
    state: HouseRulesRoundState,
    seat: SeatIndex,
    action: GameplayAuctionAction,
  ): GameplayStateTransition {
    if (state.phase !== 'auction') return this.reject(state, 'Auction actions are only accepted during the auction phase.');
    if (state.passedAuctionSeats.includes(seat)) return this.reject(state, `Seat ${seat} has already passed and cannot re-enter the auction.`);
    if (state.auctionActiveSeat !== seat) return this.reject(state, `Seat ${state.auctionActiveSeat} must take the next auction action.`);

    const playerId = this.playerIdForSeat(state.players, seat);
    if (action.type === 'pass') {
      const passedAuctionSeats = [...state.passedAuctionSeats, seat] as readonly SeatIndex[];
      const history = [...state.auctionHistory, { seat, playerId, action } satisfies GameplayAuctionHistoryEntry];
      const consecutiveAuctionPasses = state.consecutiveAuctionPasses + 1;
      if (state.currentHighestContract === undefined && passedAuctionSeats.length === 4) {
        return this.resolveAllPassAuction(state, history, passedAuctionSeats, consecutiveAuctionPasses);
      }
      if (state.currentHighestContract !== undefined && consecutiveAuctionPasses === 3) {
        return this.resolveContractAuction(state, history, passedAuctionSeats, consecutiveAuctionPasses);
      }
      const nextSeat = this.nextEligibleAuctionSeat(state.auctionOrder, seat, passedAuctionSeats);
      if (nextSeat === undefined) return this.reject(state, 'Auction has no eligible next seat.');
      return this.accept({
        ...state,
        passedAuctionSeats,
        consecutiveAuctionPasses,
        auctionHistory: history,
        auctionActiveSeat: nextSeat,
      });
    }

    if (action.type === 'contract') {
      const candidate: GameplayAuctionContract = { seat, playerId, tricks: action.tricks, trumpSuit: action.trumpSuit };
      const error = this.validateContract(candidate, state.currentHighestContract);
      if (error !== undefined) return this.reject(state, error);
      const history = [...state.auctionHistory, { seat, playerId, action } satisfies GameplayAuctionHistoryEntry];
      const nextSeat = this.nextEligibleAuctionSeat(state.auctionOrder, seat, state.passedAuctionSeats);
      if (nextSeat === undefined) return this.reject(state, 'Auction has no eligible next seat.');
      return this.accept({
        ...state,
        auctionHistory: history,
        currentHighestContract: candidate,
        consecutiveAuctionPasses: 0,
        auctionActiveSeat: nextSeat,
      });
    }

    const referencedContract = state.currentHighestContract;
    if (
      referencedContract === undefined
      || action.referenceSeat !== referencedContract.seat
    ) return this.reject(state, 'WITH must reference the current highest contract.');
    const history = [...state.auctionHistory, {
      seat,
      playerId,
      action,
      referencedContract,
    } satisfies GameplayAuctionHistoryEntry];
    const nextSeat = this.nextEligibleAuctionSeat(state.auctionOrder, seat, state.passedAuctionSeats);
    if (nextSeat === undefined) return this.reject(state, 'Auction has no eligible next seat.');
    return this.accept({
      ...state,
      auctionHistory: history,
      consecutiveAuctionPasses: 0,
      auctionActiveSeat: nextSeat,
    });
  }

  submitBid(
    state: HouseRulesRoundState,
    seat: SeatIndex,
    bid: EstimationBid,
  ): GameplayStateTransition {
    if (state.phase !== 'estimate') return this.reject(state, 'Estimates can only be submitted during the estimate phase.');
    const expectedSeat = state.estimateOrder[state.currentEstimateIndex];
    if (expectedSeat === undefined) return this.reject(state, 'All required estimates have already been submitted.');
    if (seat !== expectedSeat) return this.reject(state, `Seat ${expectedSeat} must submit the next estimate.`);

    const playerId = this.playerIdForSeat(state.players, seat);
    if (bid.playerId !== playerId) return this.reject(state, `Seat ${seat} is assigned to player ${playerId}.`);
    if (bid.bidType !== 'normal' || bid.trumpSuit !== undefined || bid.withTargetPlayerId !== undefined) {
      return this.reject(state, 'Estimate entry accepts only an ordinary numeric estimate. WITH belongs to the auction.');
    }

    const bidOwnerPlayerId = state.callerSeat === undefined
      ? undefined
      : this.playerIdForSeat(state.players, state.callerSeat);
    const validationMode = bidOwnerPlayerId === undefined ? 'round-estimates-no-owner' : 'resolved-contract-estimates';
    const individualValidation = this.bidValidationService.validateBid(bid, {
      playerCount: 4,
      cardsPerPlayer: 13,
      mode: validationMode,
      ...(bidOwnerPlayerId === undefined ? {} : { bidOwnerPlayerId }),
    });
    if (!individualValidation.valid) return { valid: false, errors: individualValidation.errors, state };

    const applicableWith = this.isApplicableWith(state, seat, bid.tricks);
    if (
      state.currentHighestContract !== undefined
      && bid.tricks > state.currentHighestContract.tricks
    ) return this.reject(state, 'An estimate cannot exceed the resolved caller contract.');
    const scoredBid: EstimationBid = applicableWith && bidOwnerPlayerId !== undefined
      ? { ...bid, bidType: 'with', withTargetPlayerId: bidOwnerPlayerId }
      : bid;
    const tentativeBids = [...state.bids, scoredBid];
    const nextEstimateIndex = state.currentEstimateIndex + 1;
    if (nextEstimateIndex < state.estimateOrder.length) {
      return this.accept({
        ...state,
        bids: tentativeBids,
        currentEstimateIndex: nextEstimateIndex,
        currentBidIndex: state.currentBidIndex + 1,
      });
    }

    const fullValidation = this.scoringPort.validateBids(tentativeBids, {
      mode: validationMode,
      ...(bidOwnerPlayerId === undefined ? {} : { bidOwnerPlayerId }),
    });
    if (!fullValidation.valid) return { valid: false, errors: fullValidation.errors, state };
    return this.accept({
      ...state,
      phase: 'playing',
      bids: tentativeBids,
      currentEstimateIndex: nextEstimateIndex,
      currentBidIndex: 4,
      currentTurnSeat: state.firstLeadSeat,
    });
  }

  legalCards(state: HouseRulesRoundState, seat: SeatIndex): readonly Card[] {
    if (state.phase !== 'playing') return [];
    return this.legalCardPlayService.legalCards(state.hands[seat].cards, state.currentTrick);
  }

  playCard(state: HouseRulesRoundState, seat: SeatIndex, card: Card): GameplayStateTransition {
    if (state.phase !== 'playing') return this.reject(state, 'Cards can only be played during the playing phase.');
    if (state.currentTurnSeat !== seat) return this.reject(state, `Seat ${state.currentTurnSeat} must play the next card.`);
    const validation = this.legalCardPlayService.validate(card, state.hands[seat].cards, state.currentTrick);
    if (!validation.valid) return { valid: false, errors: validation.errors, state };

    const nextHands = this.removeCard(state.hands, seat, card);
    const nextTrick = [...state.currentTrick, { seat, card } satisfies GameplayTrickEntry];
    if (nextTrick.length < 4) {
      return this.accept({ ...state, hands: nextHands, currentTrick: nextTrick, currentTurnSeat: this.nextSeat(state.playOrder, seat) });
    }

    const winnerSeat = this.trickResolutionService.resolve(nextTrick, this.contractSuit(state));
    const actualTricksBySeat = [...state.actualTricksBySeat] as [number, number, number, number];
    actualTricksBySeat[winnerSeat] += 1;
    const completedTricks = [...state.completedTricks, {
      trickNumber: state.completedTricks.length + 1,
      leaderSeat: nextTrick[0]!.seat,
      entries: nextTrick,
      winnerSeat,
    } satisfies CompletedGameplayTrick];
    if (completedTricks.length < 13) {
      return this.accept({ ...state, hands: nextHands, currentTrick: [], completedTricks, actualTricksBySeat, currentTurnSeat: winnerSeat });
    }
    if (nextHands.some((seatHand) => seatHand.cards.length !== 0)) {
      throw new Error('Round reached thirteen completed tricks before all cards were consumed.');
    }

    const bidOwnerPlayerId = state.callerSeat === undefined ? undefined : this.playerIdForSeat(state.players, state.callerSeat);
    const riskSeat = state.estimateOrder[state.estimateOrder.length - 1];
    if (riskSeat === undefined) throw new Error('Scored round has no final estimate seat.');
    const scoreResult = this.scoringPort.scoreRound({
      roundNumber: state.roundNumber,
      bids: state.bids,
      actualResults: state.players.map(({ seat: playerSeat, playerId }) => ({ playerId, actualTricks: actualTricksBySeat[playerSeat] })),
      ...(bidOwnerPlayerId === undefined ? {} : { bidOwnerPlayerId }),
      riskPlayerId: this.playerIdForSeat(state.players, riskSeat),
      bidValidationMode: bidOwnerPlayerId === undefined ? 'round-estimates-no-owner' : 'resolved-contract-estimates',
      roundMultiplier: state.roundMultiplier,
      multipleWithMultiplier: state.multipleWithMultiplier,
    });
    if (!scoreResult.valid || scoreResult.scoreResult === undefined) {
      throw new Error(`Round scoring failed after legal gameplay: ${scoreResult.errors.join(' ')}`);
    }
    return this.accept({
      ...state,
      phase: 'scored',
      hands: nextHands,
      currentTrick: [],
      completedTricks,
      actualTricksBySeat,
      currentTurnSeat: undefined,
      scoreResult,
    });
  }

  private resolveContractAuction(
    state: HouseRulesRoundState,
    auctionHistory: readonly GameplayAuctionHistoryEntry[],
    passedAuctionSeats: readonly SeatIndex[],
    consecutiveAuctionPasses: number,
  ): GameplayStateTransition {
    const contract = state.currentHighestContract;
    if (contract === undefined) throw new Error('A resolved contract auction requires a highest contract.');
    const estimateOrder = this.rotatingOrder(this.nextSeat(state.playOrder, contract.seat)).filter((seat) => seat !== contract.seat);
    const callerBid: EstimationBid = {
      playerId: contract.playerId,
      bidType: 'normal',
      tricks: contract.tricks,
      trumpSuit: contract.trumpSuit,
    };
    return this.accept({
      ...state,
      phase: 'estimate',
      bidOwnerSeat: contract.seat,
      callerSeat: contract.seat,
      trumpSuit: contract.trumpSuit,
      auctionActiveSeat: undefined,
      auctionHistory,
      passedAuctionSeats,
      consecutiveAuctionPasses,
      estimateOrder,
      currentEstimateIndex: 0,
      currentBidIndex: 1,
      bids: [callerBid],
    });
  }

  private resolveAllPassAuction(
    state: HouseRulesRoundState,
    auctionHistory: readonly GameplayAuctionHistoryEntry[],
    passedAuctionSeats: readonly SeatIndex[],
    consecutiveAuctionPasses: number,
  ): GameplayStateTransition {
    return this.accept({
      ...state,
      phase: 'estimate',
      trumpSuit: 'no-trump',
      auctionActiveSeat: undefined,
      auctionHistory,
      passedAuctionSeats,
      consecutiveAuctionPasses,
      estimateOrder: this.rotatingOrder(state.dealerSeat),
      currentEstimateIndex: 0,
      currentBidIndex: 0,
      allPassAuction: true,
    });
  }

  private validateContract(candidate: GameplayAuctionContract, current: GameplayAuctionContract | undefined): string | undefined {
    if (!Number.isInteger(candidate.tricks) || candidate.tricks < 4 || candidate.tricks > 13) {
      return 'Auction contracts must be between 4 and 13 tricks.';
    }
    if (!CONTRACT_ORDER.includes(candidate.trumpSuit)) return 'Auction contract trump is invalid.';
    if (current === undefined) return undefined;
    return this.compareContracts(candidate, current) > 0
      ? undefined
      : 'Auction contract must strictly outrank the current highest contract.';
  }

  private compareContracts(left: GameplayAuctionContract, right: GameplayAuctionContract): number {
    if (left.tricks !== right.tricks) return left.tricks - right.tricks;
    return CONTRACT_ORDER.indexOf(left.trumpSuit) - CONTRACT_ORDER.indexOf(right.trumpSuit);
  }

  private isApplicableWith(state: HouseRulesRoundState, seat: SeatIndex, estimate: number): boolean {
    const contract = state.currentHighestContract;
    if (contract === undefined || estimate !== contract.tricks) return false;
    return state.auctionHistory.some((entry) => (
      entry.seat === seat
      && entry.action.type === 'with'
      && entry.action.referenceSeat === contract.seat
      && entry.referencedContract?.tricks === contract.tricks
      && entry.referencedContract.trumpSuit === contract.trumpSuit
    ));
  }

  private nextEligibleAuctionSeat(
    order: SeatOrder,
    seat: SeatIndex,
    passedSeats: readonly SeatIndex[],
  ): SeatIndex | undefined {
    const index = order.indexOf(seat);
    for (let offset = 1; offset <= order.length; offset += 1) {
      const candidate = order[(index + offset) % order.length]!;
      if (!passedSeats.includes(candidate)) return candidate;
    }
    return undefined;
  }

  private validateCreateInput(input: CreateHouseRulesRoundInput): void {
    const errors: string[] = [];
    if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) errors.push('Round number must be a positive integer.');
    if (!this.isSeatPermutation(input.players.map((player) => player.seat))) errors.push('Players must cover seats 0, 1, 2, and 3 exactly once.');
    const playerIds = input.players.map((player) => player.playerId.trim());
    if (playerIds.some((playerId) => playerId.length === 0) || new Set(playerIds).size !== 4) errors.push('Gameplay player ids must be unique and non-empty.');
    if (!this.isSeatPermutation(input.hands.map((hand) => hand.seat))) errors.push('Hands must cover seats 0, 1, 2, and 3 exactly once.');
    if (input.hands.some((hand) => hand.cards.length !== 13)) errors.push('Every gameplay seat must start with exactly thirteen cards.');
    const dealtCards = input.hands.flatMap((hand) => hand.cards);
    if (dealtCards.length !== 52 || new Set(dealtCards.map(cardId)).size !== 52) errors.push('Gameplay hands must contain all fifty-two unique cards exactly once.');
    if (!this.isSeatPermutation(input.bidOrder)) errors.push('Bidding order must contain seats 0, 1, 2, and 3 exactly once.');
    if (!this.isSeatPermutation(input.playOrder)) errors.push('Play order must contain seats 0, 1, 2, and 3 exactly once.');
    const dealerSeat = input.dealerSeat ?? input.bidOwnerSeat ?? input.bidOrder[3];
    if (dealerSeat === undefined || !input.playOrder.includes(dealerSeat)) errors.push('Dealer seat must exist in the play order.');
    if (!input.playOrder.includes(input.firstLeadSeat)) errors.push('First lead seat must exist in the play order.');
    if (input.roundMultiplier !== undefined && (!Number.isInteger(input.roundMultiplier) || input.roundMultiplier < 1)) errors.push('Round multiplier must be a positive integer when provided.');
    if (input.multipleWithMultiplier !== undefined && ![1, 2].includes(input.multipleWithMultiplier)) errors.push('Multiple-With multiplier must be 1 or 2 when provided.');
    if (errors.length > 0) throw new Error(errors.join(' '));
  }

  private orderPlayers(players: GameplaySeatPlayers): GameplaySeatPlayers {
    return SEAT_INDICES.map((seat) => {
      const player = players.find((candidate) => candidate.seat === seat);
      if (player === undefined) throw new Error(`Missing player for seat ${seat}.`);
      return { ...player, playerId: player.playerId.trim() };
    }) as unknown as GameplaySeatPlayers;
  }

  private orderHands(hands: SeatHands): SeatHands {
    return SEAT_INDICES.map((seat) => {
      const hand = hands.find((candidate) => candidate.seat === seat);
      if (hand === undefined) throw new Error(`Missing hand for seat ${seat}.`);
      return { seat, cards: [...hand.cards] };
    }) as unknown as SeatHands;
  }

  private isSeatPermutation(seats: readonly number[]): boolean {
    return seats.length === 4 && new Set(seats).size === 4 && SEAT_INDICES.every((seat) => seats.includes(seat));
  }

  private playerIdForSeat(players: GameplaySeatPlayers, seat: SeatIndex): string { return players[seat].playerId; }

  private removeCard(hands: SeatHands, seat: SeatIndex, selectedCard: Card): SeatHands {
    const selectedCardId = cardId(selectedCard);
    let removed = false;
    return hands.map((hand) => hand.seat !== seat ? hand : ({
      ...hand,
      cards: hand.cards.filter((card) => {
        if (!removed && cardId(card) === selectedCardId) { removed = true; return false; }
        return true;
      }),
    })) as unknown as SeatHands;
  }

  private nextSeat(order: SeatOrder, seat: SeatIndex): SeatIndex {
    const index = order.indexOf(seat);
    if (index === -1) throw new Error(`Seat ${seat} does not exist in the play order.`);
    return order[(index + 1) % order.length]!;
  }

  private rotatingOrder(firstSeat: SeatIndex): SeatOrder {
    return [firstSeat, ((firstSeat + 1) % 4) as SeatIndex, ((firstSeat + 2) % 4) as SeatIndex, ((firstSeat + 3) % 4) as SeatIndex];
  }

  private contractSuit(state: HouseRulesRoundState): ContractSuit {
    if (state.trumpSuit === undefined) throw new Error('Resolved round does not contain a trump suit.');
    return state.trumpSuit;
  }

  private accept(state: HouseRulesRoundState): GameplayStateTransition { return { valid: true, errors: [], state }; }
  private reject(state: HouseRulesRoundState, error: string): GameplayStateTransition { return { valid: false, errors: [error], state }; }
}
