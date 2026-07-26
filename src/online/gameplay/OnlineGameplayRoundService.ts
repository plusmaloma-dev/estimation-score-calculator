import {
  cardId,
  isValidContractSuit,
  isValidRank,
  isValidSuit,
  type Card,
  type ContractSuit,
} from '../../domain/card.js';
import type { EstimationBid } from '../../domain/bid.js';
import type {
  CompletedGameplayTrick,
  GameplayTrickEntry,
  SeatIndex,
} from '../../gameplay/types.js';
import type { MvpRoundResult } from '../../services/EstimationMvpService.js';
import type { OnlineGameplayResult } from './types.js';
import type {
  OnlineGameplayRoundPlayer,
  OnlineGameplayRoundSnapshot,
} from './roundTypes.js';

export interface GameplayRoundFunctionClient {
  readonly functions: {
    invoke(
      name: string,
      options: { readonly body: Readonly<Record<string, unknown>> },
    ): Promise<{
      readonly data: unknown;
      readonly error: { readonly message: string } | null;
    }>;
  };
}

const PHASES = ['bidding', 'playing', 'scored'] as const;
const BID_TYPES = ['normal', 'dash', 'dash-call', 'with', 'hold'] as const;
const PROHIBITED_KEYS = new Set([
  'hands',
  'seed',
  'seedHex',
  'nonce',
  'shuffledDeck',
  'deckOrder',
  'futureCards',
]);

export class OnlineGameplayRoundService {
  constructor(private readonly client: GameplayRoundFunctionClient) {}

  async getSnapshot(
    tableId: string,
  ): Promise<OnlineGameplayResult<OnlineGameplayRoundSnapshot>> {
    const errors = this.validateTableId(tableId);
    if (errors.length > 0) return this.failure(errors);
    return this.invoke({ action: 'snapshot', tableId: tableId.trim() });
  }

  async submitBid(
    tableId: string,
    expectedVersion: number,
    commandId: string,
    bid: EstimationBid,
  ): Promise<OnlineGameplayResult<OnlineGameplayRoundSnapshot>> {
    const errors = this.validateCommand(tableId, expectedVersion, commandId);
    if (this.parseBid(bid) === undefined) errors.push('Gameplay bid is invalid.');
    if (errors.length > 0) return this.failure(errors);
    return this.invoke({
      action: 'submit-bid',
      tableId: tableId.trim(),
      expectedVersion,
      commandId: commandId.trim(),
      bid,
    });
  }

  async playCard(
    tableId: string,
    expectedVersion: number,
    commandId: string,
    card: Card,
  ): Promise<OnlineGameplayResult<OnlineGameplayRoundSnapshot>> {
    const errors = this.validateCommand(tableId, expectedVersion, commandId);
    if (this.parseCard(card) === undefined) errors.push('Gameplay card is invalid.');
    if (errors.length > 0) return this.failure(errors);
    return this.invoke({
      action: 'play-card',
      tableId: tableId.trim(),
      expectedVersion,
      commandId: commandId.trim(),
      card,
    });
  }

  private async invoke(
    body: Readonly<Record<string, unknown>>,
  ): Promise<OnlineGameplayResult<OnlineGameplayRoundSnapshot>> {
    const response = await this.client.functions.invoke('gameplay-round-command', { body });
    if (response.error !== null) return this.failure([response.error.message]);

    const envelope = this.object(response.data);
    if (envelope === undefined || typeof envelope.valid !== 'boolean') {
      return this.failure(['Gameplay round response is incomplete.']);
    }
    const errors = this.stringArray(envelope.errors);
    if (!envelope.valid) {
      return this.failure(errors.length > 0 ? errors : ['Gameplay round command was rejected.']);
    }
    if (this.containsProhibitedField(envelope.value)) {
      return this.failure(['Gameplay round snapshot contains prohibited private fields.']);
    }

    const snapshot = this.parseSnapshot(envelope.value);
    return snapshot === undefined
      ? this.failure(['Gameplay round snapshot is incomplete.'])
      : { valid: true, errors: [], value: snapshot };
  }

  private parseSnapshot(value: unknown): OnlineGameplayRoundSnapshot | undefined {
    const row = this.object(value);
    if (row === undefined) return undefined;

    const tableId = this.string(row.tableId);
    const roundNumber = this.positiveInteger(row.roundNumber);
    const phase = this.oneOf(row.phase, PHASES);
    const version = this.nonNegativeInteger(row.version);
    const viewerSeat = this.seat(row.viewerSeat);
    const bidOwnerSeat = this.seat(row.bidOwnerSeat);
    if (
      tableId === undefined
      || roundNumber === undefined
      || phase === undefined
      || version === undefined
      || viewerSeat === undefined
      || bidOwnerSeat === undefined
      || !Array.isArray(row.players)
      || row.players.length !== 4
      || !Array.isArray(row.ownHand)
      || !Array.isArray(row.legalNormalEstimates)
      || !Array.isArray(row.legalCards)
      || !Array.isArray(row.currentTrick)
      || !Array.isArray(row.completedTricks)
    ) return undefined;

    const players: OnlineGameplayRoundPlayer[] = [];
    const seenSeats = new Set<SeatIndex>();
    for (const item of row.players) {
      const player = this.parsePlayer(item);
      if (player === undefined || seenSeats.has(player.seat)) return undefined;
      seenSeats.add(player.seat);
      players.push(player);
    }
    if (seenSeats.size !== 4) return undefined;
    players.sort((left, right) => left.seat - right.seat);

    const ownHand = this.parseCards(row.ownHand);
    const legalCards = this.parseCards(row.legalCards);
    if (ownHand === undefined || legalCards === undefined) return undefined;
    if (ownHand.length !== players[viewerSeat]?.cardCount) return undefined;
    const ownIds = new Set(ownHand.map(cardId));
    if (legalCards.some((card) => !ownIds.has(cardId(card)))) return undefined;

    const legalNormalEstimates: number[] = [];
    for (const estimate of row.legalNormalEstimates) {
      const parsed = this.nonNegativeInteger(estimate);
      if (parsed === undefined || parsed > 12 || legalNormalEstimates.includes(parsed)) return undefined;
      legalNormalEstimates.push(parsed);
    }

    const currentTrick = this.parseTrickEntries(row.currentTrick, false);
    if (currentTrick === undefined) return undefined;
    const completedTricks: CompletedGameplayTrick[] = [];
    for (const item of row.completedTricks) {
      const trick = this.parseCompletedTrick(item);
      if (trick === undefined) return undefined;
      completedTricks.push(trick);
    }

    const nextBidSeat = row.nextBidSeat === null || row.nextBidSeat === undefined
      ? undefined : this.seat(row.nextBidSeat);
    const currentTurnSeat = row.currentTurnSeat === null || row.currentTurnSeat === undefined
      ? undefined : this.seat(row.currentTurnSeat);
    if (
      row.nextBidSeat !== null && row.nextBidSeat !== undefined && nextBidSeat === undefined
      || row.currentTurnSeat !== null && row.currentTurnSeat !== undefined && currentTurnSeat === undefined
    ) return undefined;

    const scoreResult = row.scoreResult === null || row.scoreResult === undefined
      ? undefined : this.parseScoreResult(row.scoreResult);
    if (row.scoreResult !== null && row.scoreResult !== undefined && scoreResult === undefined) return undefined;

    return {
      tableId,
      roundNumber,
      phase,
      version,
      viewerSeat,
      bidOwnerSeat,
      ...(nextBidSeat === undefined ? {} : { nextBidSeat }),
      ...(currentTurnSeat === undefined ? {} : { currentTurnSeat }),
      players,
      ownHand,
      legalNormalEstimates,
      legalCards,
      currentTrick,
      completedTricks,
      ...(scoreResult === undefined ? {} : { scoreResult }),
    };
  }

  private parsePlayer(value: unknown): OnlineGameplayRoundPlayer | undefined {
    const row = this.object(value);
    if (row === undefined) return undefined;
    const seat = this.seat(row.seat);
    const playerId = this.string(row.playerId);
    const cardCount = this.nonNegativeInteger(row.cardCount);
    const actualTricks = this.nonNegativeInteger(row.actualTricks);
    if (
      seat === undefined
      || playerId === undefined
      || cardCount === undefined
      || cardCount > 13
      || actualTricks === undefined
      || actualTricks > 13
    ) return undefined;
    const bid = row.bid === null || row.bid === undefined ? undefined : this.parseBid(row.bid);
    if (row.bid !== null && row.bid !== undefined && bid === undefined) return undefined;
    return {
      seat,
      playerId,
      cardCount,
      ...(bid === undefined ? {} : { bid }),
      actualTricks,
    };
  }

  private parseBid(value: unknown): EstimationBid | undefined {
    const row = this.object(value);
    if (row === undefined) return undefined;
    const playerId = this.string(row.playerId);
    const bidType = this.oneOf(row.bidType, BID_TYPES);
    const tricks = this.nonNegativeInteger(row.tricks);
    if (playerId === undefined || bidType === undefined || tricks === undefined || tricks > 13) {
      return undefined;
    }
    const trumpSuit = row.trumpSuit === null || row.trumpSuit === undefined
      ? undefined : this.contractSuit(row.trumpSuit);
    const withTargetPlayerId = row.withTargetPlayerId === null || row.withTargetPlayerId === undefined
      ? undefined : this.string(row.withTargetPlayerId);
    if (
      row.trumpSuit !== null && row.trumpSuit !== undefined && trumpSuit === undefined
      || row.withTargetPlayerId !== null
        && row.withTargetPlayerId !== undefined
        && withTargetPlayerId === undefined
    ) return undefined;
    return {
      playerId,
      bidType,
      tricks,
      ...(trumpSuit === undefined ? {} : { trumpSuit }),
      ...(withTargetPlayerId === undefined ? {} : { withTargetPlayerId }),
    };
  }

  private parseCard(value: unknown): Card | undefined {
    const row = this.object(value);
    if (row === undefined || typeof row.suit !== 'string' || typeof row.rank !== 'string') return undefined;
    return isValidSuit(row.suit) && isValidRank(row.rank)
      ? { suit: row.suit, rank: row.rank }
      : undefined;
  }

  private parseCards(value: readonly unknown[]): Card[] | undefined {
    const cards: Card[] = [];
    const ids = new Set<string>();
    for (const item of value) {
      const card = this.parseCard(item);
      if (card === undefined || ids.has(cardId(card))) return undefined;
      ids.add(cardId(card));
      cards.push(card);
    }
    return cards;
  }

  private parseTrickEntries(value: readonly unknown[], requireFour: boolean): GameplayTrickEntry[] | undefined {
    if (value.length > 4 || requireFour && value.length !== 4) return undefined;
    const entries: GameplayTrickEntry[] = [];
    const seats = new Set<SeatIndex>();
    for (const item of value) {
      const row = this.object(item);
      if (row === undefined) return undefined;
      const seat = this.seat(row.seat);
      const card = this.parseCard(row.card);
      if (seat === undefined || card === undefined || seats.has(seat)) return undefined;
      seats.add(seat);
      entries.push({ seat, card });
    }
    return entries;
  }

  private parseCompletedTrick(value: unknown): CompletedGameplayTrick | undefined {
    const row = this.object(value);
    if (row === undefined || !Array.isArray(row.entries)) return undefined;
    const trickNumber = this.positiveInteger(row.trickNumber);
    const leaderSeat = this.seat(row.leaderSeat);
    const winnerSeat = this.seat(row.winnerSeat);
    const entries = this.parseTrickEntries(row.entries, true);
    return trickNumber === undefined || leaderSeat === undefined || winnerSeat === undefined || entries === undefined
      ? undefined
      : { trickNumber, leaderSeat, entries, winnerSeat };
  }

  private parseScoreResult(value: unknown): MvpRoundResult | undefined {
    const row = this.object(value);
    if (
      row === undefined
      || this.positiveInteger(row.roundNumber) === undefined
      || typeof row.valid !== 'boolean'
      || !Array.isArray(row.errors)
      || this.object(row.bidValidation) === undefined
    ) return undefined;
    return value as MvpRoundResult;
  }

  private containsProhibitedField(value: unknown): boolean {
    if (Array.isArray(value)) return value.some((item) => this.containsProhibitedField(item));
    const row = this.object(value);
    if (row === undefined) return false;
    return Object.entries(row).some(([key, item]) => (
      PROHIBITED_KEYS.has(key) || this.containsProhibitedField(item)
    ));
  }

  private validateTableId(tableId: string): string[] {
    return tableId.trim().length === 0 ? ['Gameplay table ID is required.'] : [];
  }

  private validateCommand(tableId: string, expectedVersion: number, commandId: string): string[] {
    const errors = this.validateTableId(tableId);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      errors.push('Expected gameplay version must be a non-negative integer.');
    }
    if (!commandId.trim()) errors.push('Gameplay command ID is required.');
    return errors;
  }

  private contractSuit(value: unknown): ContractSuit | undefined {
    return typeof value === 'string' && isValidContractSuit(value) ? value : undefined;
  }

  private seat(value: unknown): SeatIndex | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3
      ? value as SeatIndex : undefined;
  }

  private oneOf<const T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
    return typeof value === 'string' && values.includes(value as T[number])
      ? value as T[number] : undefined;
  }

  private object(value: unknown): Readonly<Record<string, unknown>> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Readonly<Record<string, unknown>> : undefined;
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }

  private nonNegativeInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
  }

  private positiveInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private failure<T>(errors: readonly string[]): OnlineGameplayResult<T> {
    return { valid: false, errors };
  }
}
