export type FederationAuctionActionType = 'pass' | 'bid';

export interface FederationAuctionAction {
  readonly playerId: string;
  readonly actionType: FederationAuctionActionType;
}

export interface FederationAuctionInput {
  readonly roundNumber: number;
  readonly dealerPlayerId: string;
  readonly playerIds: readonly string[];
  readonly actions: readonly FederationAuctionAction[];
}

export type FederationAuctionResolution =
  | {
      readonly valid: true;
      readonly errors: readonly [];
      readonly status: 'continue-auction';
      readonly roundNumber: number;
      readonly dealerPlayerId: string;
    }
  | {
      readonly valid: true;
      readonly errors: readonly [];
      readonly status: 'redeal-required';
      readonly reason: 'all-pass';
      readonly roundNumber: number;
      readonly dealerPlayerId: string;
      readonly nextDealerPlayerId: string;
    }
  | {
      readonly valid: false;
      readonly errors: readonly string[];
      readonly status: 'invalid';
    };
