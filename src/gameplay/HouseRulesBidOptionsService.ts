import type { ContractSuit } from '../domain/card.js';
import type { GameplayAuctionAction, HouseRulesRoundState, SeatIndex } from './types.js';

const CONTRACT_ORDER: readonly ContractSuit[] = ['clubs', 'diamonds', 'hearts', 'spades', 'no-trump'];
const NORMAL_ESTIMATES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export interface HouseRulesBidOption {
  readonly tricks: number;
  readonly bidType: 'normal';
  readonly requiresContractSuit: false;
  readonly legalContractSuits: readonly [];
}

export interface HouseRulesAuctionOption {
  readonly action: GameplayAuctionAction;
}

export class HouseRulesBidOptionsService {
  legalOptions(state: HouseRulesRoundState, seat: SeatIndex): readonly HouseRulesBidOption[] {
    if (state.phase !== 'estimate' || state.estimateOrder[state.currentEstimateIndex] !== seat) return [];
    const currentTotal = state.bids.reduce((total, bid) => total + bid.tricks, 0);
    const isFinalEstimate = state.currentEstimateIndex === state.estimateOrder.length - 1;
    const maxEstimate = state.currentHighestContract?.tricks ?? 12;
    return NORMAL_ESTIMATES
      .filter((tricks) => tricks <= maxEstimate)
      .filter((tricks) => !isFinalEstimate || currentTotal + tricks !== 13)
      .map((tricks) => ({
        tricks,
        bidType: 'normal' as const,
        requiresContractSuit: false as const,
        legalContractSuits: [] as const,
      }));
  }

  legalAuctionActions(state: HouseRulesRoundState, seat: SeatIndex): readonly HouseRulesAuctionOption[] {
    if (state.phase !== 'auction' || state.auctionActiveSeat !== seat || state.passedAuctionSeats.includes(seat)) return [];
    const options: HouseRulesAuctionOption[] = [{ action: { type: 'pass' } }];
    for (let tricks = 4; tricks <= 13; tricks += 1) {
      for (const trumpSuit of CONTRACT_ORDER) {
        if (this.outranks(tricks, trumpSuit, state.currentHighestContract)) {
          options.push({ action: { type: 'contract', tricks, trumpSuit } });
        }
      }
    }
    if (state.currentHighestContract !== undefined && state.currentHighestContract.seat !== seat) {
      options.push({ action: { type: 'with', referenceSeat: state.currentHighestContract.seat } });
    }
    return options;
  }

  private outranks(
    tricks: number,
    trumpSuit: ContractSuit,
    current: HouseRulesRoundState['currentHighestContract'],
  ): boolean {
    if (current === undefined) return true;
    return tricks > current.tricks || (
      tricks === current.tricks && CONTRACT_ORDER.indexOf(trumpSuit) > CONTRACT_ORDER.indexOf(current.trumpSuit)
    );
  }

}
