import type { EstimationBid } from '../domain/bid.js';
import { CONTRACT_SUIT_PRIORITY, type ContractSuit } from '../domain/card.js';
import type { HouseRulesRoundState, SeatIndex } from './types.js';

const NORMAL_ESTIMATES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export interface HouseRulesBidOption {
  readonly tricks: number;
  readonly bidType: 'normal' | 'with';
  readonly requiresContractSuit: boolean;
  readonly legalContractSuits: readonly ContractSuit[];
  readonly withTargetPlayerId?: string;
}

export class HouseRulesBidOptionsService {
  legalOptions(
    state: HouseRulesRoundState,
    seat: SeatIndex,
  ): readonly HouseRulesBidOption[] {
    if (state.phase !== 'bidding') return [];
    if (state.bidOrder[state.currentBidIndex] !== seat) return [];

    const playerId = state.players[seat].playerId;
    const ownerPlayer = state.players[state.bidOwnerSeat];
    const candidates = seat === state.bidOwnerSeat
      ? this.ownerOptions()
      : this.nonOwnerOptions(state, ownerPlayer.playerId);

    if (state.currentBidIndex !== 3) return candidates;

    const currentTotal = state.bids.reduce((total, bid) => total + bid.tricks, 0);
    return candidates.filter((option) => currentTotal + option.tricks !== 13);
  }

  private ownerOptions(): readonly HouseRulesBidOption[] {
    return NORMAL_ESTIMATES.map((tricks) => ({
      tricks,
      bidType: 'normal',
      requiresContractSuit: true,
      legalContractSuits: [...CONTRACT_SUIT_PRIORITY],
    }));
  }

  private nonOwnerOptions(
    state: HouseRulesRoundState,
    ownerPlayerId: string,
  ): readonly HouseRulesBidOption[] {
    const ownerBid = state.bids.find((bid) => bid.playerId === ownerPlayerId);
    if (ownerBid === undefined) return [];

    const lowerOptions = NORMAL_ESTIMATES
      .filter((tricks) => tricks < ownerBid.tricks)
      .map((tricks): HouseRulesBidOption => ({
        tricks,
        bidType: 'normal',
        requiresContractSuit: false,
        legalContractSuits: [],
      }));
    const withOption: HouseRulesBidOption = {
      tricks: ownerBid.tricks,
      bidType: 'with',
      requiresContractSuit: false,
      legalContractSuits: [],
      withTargetPlayerId: ownerPlayerId,
    };

    return [...lowerOptions, withOption];
  }

  bidForOption(
    playerId: string,
    option: HouseRulesBidOption,
    contractSuit?: ContractSuit,
  ): EstimationBid | undefined {
    if (option.requiresContractSuit && contractSuit === undefined) return undefined;
    return {
      playerId,
      bidType: option.bidType,
      tricks: option.tricks,
      ...(contractSuit === undefined ? {} : { trumpSuit: contractSuit }),
      ...(option.withTargetPlayerId === undefined
        ? {}
        : { withTargetPlayerId: option.withTargetPlayerId }),
    };
  }
}
