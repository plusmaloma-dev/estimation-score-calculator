import { FairDealService } from '../FairDealService.js';
import { DeterministicRandomSource } from '../DeterministicRandomSource.js';
import { HouseRulesRoundEngine } from '../HouseRulesRoundEngine.js';
import {
  SEAT_INDICES,
  type GameplaySessionBootstrapRequest,
  type GameplaySeatPlayers,
  type SeatIndex,
  type SeatOrder,
} from '../types.js';
import type {
  GameplayDealAuditRecord,
  GameplaySessionBootstrapResult,
} from './types.js';

const SEED_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;

export class GameplaySessionBootstrapService {
  constructor(
    private readonly fairDealService = new FairDealService(),
    private readonly roundEngine = new HouseRulesRoundEngine(),
  ) {}

  async bootstrap(
    input: GameplaySessionBootstrapRequest,
  ): Promise<GameplaySessionBootstrapResult> {
    this.validateInput(input);

    const normalizedSeedHex = input.seedHex.toLowerCase();
    const dealerSeat = await this.resolveDealerSeat(input, normalizedSeedHex);
    const roundMultiplier = input.initialization.kind === 'subsequent-round'
      ? input.initialization.roundMultiplier
      : undefined;

    return this.initializeRound(input, normalizedSeedHex, dealerSeat, roundMultiplier);
  }

  private async initializeRound(
    input: GameplaySessionBootstrapRequest,
    normalizedSeedHex: string,
    dealerSeat: SeatIndex,
    roundMultiplier: number | undefined,
  ): Promise<GameplaySessionBootstrapResult> {
    // This explicit order is the canonical table rotation: the next entry is
    // the seat immediately to the dealer's right for auction, deal, and lead
    // ordering. Do not derive it from a rendered table layout.
    const playOrder: SeatOrder = [0, 1, 2, 3];
    const firstAuctionSeat = this.nextSeat(playOrder, dealerSeat);
    const firstLeadSeat = firstAuctionSeat;
    const bidOrder = this.rotatingOrder(playOrder, firstAuctionSeat);
    const players = this.orderPlayers(input.seats);

    const deal = await this.fairDealService.deal({
      gameId: input.tableId.trim(),
      dealId: input.dealId.trim(),
      ruleSet: 'HOUSE_RULES_V1',
      nonce: input.nonce.trim(),
      seedHex: normalizedSeedHex,
      firstSeat: firstLeadSeat,
    });
    const dealAudit: GameplayDealAuditRecord = {
      gameId: deal.gameId,
      dealId: deal.dealId,
      ruleSet: deal.ruleSet,
      nonce: deal.nonce,
      seedHex: deal.seedHex,
      firstSeat: deal.firstSeat,
      dealerSeat,
      commitment: deal.commitment,
      shuffledDeck: [...deal.shuffledDeck],
      revealed: false,
    };
    const created = this.roundEngine.create({
      roundNumber: input.roundNumber,
      players,
      hands: deal.hands,
      bidOrder,
      playOrder,
      dealerSeat,
      firstLeadSeat,
      roundMultiplier,
      dealAudit,
    });
    const state = { ...created, dealAudit };

    return {
      state,
      dealerSeat,
      firstLeadSeat,
      firstTurn: {
        turnId: `round-${input.roundNumber}:bid:0:${bidOrder[0]}`,
        seat: bidOrder[0],
        actionKind: 'bid',
      },
      dealCommitment: deal.commitment,
    };
  }

  private async resolveDealerSeat(
    input: GameplaySessionBootstrapRequest,
    normalizedSeedHex: string,
  ): Promise<SeatIndex> {
    if (input.initialization.kind === 'subsequent-round') {
      return input.initialization.dealerSeat;
    }
    return (await new DeterministicRandomSource(
      this.hexToBytes(normalizedSeedHex),
    ).nextInt(4)) as SeatIndex;
  }

  private validateInput(input: GameplaySessionBootstrapRequest): void {
    const errors: string[] = [];
    if (!input.tableId.trim()) errors.push('Gameplay table id is required.');
    if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) {
      errors.push('Round number must be a positive integer.');
    }
    if (!SEED_HEX_PATTERN.test(input.seedHex)) {
      errors.push('Seed must be exactly 32 bytes encoded as 64 hexadecimal characters.');
    }
    if (!input.dealId.trim()) errors.push('Deal id is required.');
    if (!input.nonce.trim()) errors.push('Deal nonce is required.');
    if (input.initialization.kind === 'subsequent-round') {
      if (!(SEAT_INDICES as readonly number[]).includes(input.initialization.dealerSeat)) {
        errors.push('Dealer seat must be 0, 1, 2, or 3.');
      }
      if (
        !Number.isInteger(input.initialization.roundMultiplier)
        || input.initialization.roundMultiplier < 1
      ) {
        errors.push('Round multiplier must be a positive integer.');
      }
    }

    const seats = input.seats as readonly { readonly seat: number; readonly playerId: string }[];
    const validSeatSet = seats.length === 4
      && new Set(seats.map((seat) => seat.seat)).size === 4
      && SEAT_INDICES.every((seat) => seats.some((candidate) => candidate.seat === seat));
    const playerIds = seats.map((seat) => seat.playerId.trim());
    if (
      !validSeatSet
      || playerIds.some((playerId) => playerId.length === 0)
      || new Set(playerIds).size !== 4
    ) {
      errors.push('Bootstrap requires exactly one valid player for seats 0, 1, 2, and 3.');
    }

    if (errors.length > 0) throw new Error(errors.join(' '));
  }

  private orderPlayers(players: GameplaySeatPlayers): GameplaySeatPlayers {
    return SEAT_INDICES.map((seat) => {
      const player = players.find((candidate) => candidate.seat === seat);
      if (player === undefined) throw new Error(`Missing bootstrap player for seat ${seat}.`);
      return { seat, playerId: player.playerId.trim() };
    }) as unknown as GameplaySeatPlayers;
  }

  private rotatingOrder(order: SeatOrder, firstSeat: SeatIndex): SeatOrder {
    const index = order.indexOf(firstSeat);
    if (index === -1) throw new Error(`Seat ${firstSeat} is not in the canonical table rotation.`);
    return [
      order[index]!,
      order[(index + 1) % order.length]!,
      order[(index + 2) % order.length]!,
      order[(index + 3) % order.length]!,
    ];
  }

  private nextSeat(order: SeatOrder, seat: SeatIndex): SeatIndex {
    const index = order.indexOf(seat);
    if (index === -1) throw new Error(`Seat ${seat} is not in the canonical table rotation.`);
    return order[(index + 1) % order.length]!;
  }

  private hexToBytes(value: string): Uint8Array {
    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }
}
