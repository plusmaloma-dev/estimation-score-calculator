import { CONTRACT_SUIT_PRIORITY, contractSuitStrength, type ContractSuit } from '../domain/card.js';
import type { EstimationBid } from '../domain/bid.js';

export interface HighestBidResolverOptions {
  readonly suitPriority?: readonly ContractSuit[];
}

export interface HighestBidResult {
  readonly winningBid: EstimationBid | null;
  readonly tiedBids: readonly EstimationBid[];
}

export class HighestBidResolver {
  resolve(
    bids: readonly EstimationBid[],
    options: HighestBidResolverOptions = {},
  ): HighestBidResult {
    const normalBids = bids.filter((bid) => bid.bidType === 'normal');

    if (normalBids.length === 0) {
      return { winningBid: null, tiedBids: [] };
    }

    const suitPriority = options.suitPriority ?? CONTRACT_SUIT_PRIORITY;
    const ordered = [...normalBids].sort((left, right) => this.compareBids(right, left, suitPriority));
    const winningBid = ordered[0] ?? null;

    if (winningBid === null) {
      return { winningBid: null, tiedBids: [] };
    }

    const tiedBids = ordered.filter((bid) => this.compareBids(bid, winningBid, suitPriority) === 0);

    return {
      winningBid,
      tiedBids,
    };
  }

  compareBids(
    left: EstimationBid,
    right: EstimationBid,
    suitPriority: readonly ContractSuit[] = CONTRACT_SUIT_PRIORITY,
  ): number {
    if (left.tricks !== right.tricks) {
      return left.tricks - right.tricks;
    }

    return this.suitScore(left.trumpSuit, suitPriority) - this.suitScore(right.trumpSuit, suitPriority);
  }

  private suitScore(suit: ContractSuit | undefined, suitPriority: readonly ContractSuit[]): number {
    if (suit === undefined) {
      return Number.NEGATIVE_INFINITY;
    }

    const customIndex = suitPriority.indexOf(suit);
    if (customIndex >= 0) {
      return suitPriority.length - customIndex;
    }

    return contractSuitStrength(suit);
  }
}
