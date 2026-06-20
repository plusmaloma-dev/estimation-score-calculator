import { SUITS, type Suit } from '../domain/card.js';
import type { EstimationBid } from '../domain/bid.js';

export interface HighestBidResolverOptions {
  readonly suitPriority?: readonly Suit[];
}

export interface HighestBidResult {
  readonly winningBid: EstimationBid | null;
  readonly tiedBids: readonly EstimationBid[];
}

const defaultSuitPriority: readonly Suit[] = SUITS;

export class HighestBidResolver {
  resolve(
    bids: readonly EstimationBid[],
    options: HighestBidResolverOptions = {},
  ): HighestBidResult {
    if (bids.length === 0) {
      return { winningBid: null, tiedBids: [] };
    }

    const suitPriority = options.suitPriority ?? defaultSuitPriority;
    const ordered = [...bids].sort((left, right) => this.compareBids(right, left, suitPriority));
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

  private compareBids(
    left: EstimationBid,
    right: EstimationBid,
    suitPriority: readonly Suit[],
  ): number {
    if (left.tricks !== right.tricks) {
      return left.tricks - right.tricks;
    }

    return this.suitScore(left.trumpSuit, suitPriority) - this.suitScore(right.trumpSuit, suitPriority);
  }

  private suitScore(suit: Suit | undefined, suitPriority: readonly Suit[]): number {
    if (suit === undefined) {
      return -1;
    }

    return suitPriority.indexOf(suit);
  }
}
