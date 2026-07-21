import type {
  FederationAuctionInput,
  FederationAuctionResolution,
} from './types.js';

export class FederationAuctionService {
  resolve(input: FederationAuctionInput): FederationAuctionResolution {
    const errors: string[] = [];
    const playerIds = input.playerIds.map((playerId) => playerId.trim());
    const uniquePlayers = new Set(playerIds);

    if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) {
      errors.push('Round number must be a positive integer.');
    }

    if (
      playerIds.length !== 4 ||
      uniquePlayers.size !== 4 ||
      playerIds.some((playerId) => playerId.length === 0)
    ) {
      errors.push('Exactly four unique players are required for a Federation auction.');
    }

    const dealerPlayerId = input.dealerPlayerId.trim();
    if (!uniquePlayers.has(dealerPlayerId)) {
      errors.push('Dealer must be one of the game players.');
    }

    if (input.actions.length > 4) {
      errors.push('A Federation auction cannot contain more than four actions.');
    }

    const actedPlayers = new Set<string>();
    for (const action of input.actions) {
      const playerId = action.playerId.trim();
      if (!uniquePlayers.has(playerId)) {
        errors.push(`Auction action player is not part of the game: ${playerId}.`);
      }
      if (actedPlayers.has(playerId)) {
        errors.push(`Player ${playerId} cannot act more than once in the same auction attempt.`);
      }
      actedPlayers.add(playerId);
    }

    if (errors.length > 0) {
      return { valid: false, errors, status: 'invalid' };
    }

    const allPlayersPassed =
      input.actions.length === 4 &&
      input.actions.every((action) => action.actionType === 'pass');

    if (allPlayersPassed) {
      return {
        valid: true,
        errors: [],
        status: 'redeal-required',
        reason: 'all-pass',
        roundNumber: input.roundNumber,
        dealerPlayerId,
        nextDealerPlayerId: dealerPlayerId,
      };
    }

    return {
      valid: true,
      errors: [],
      status: 'continue-auction',
      roundNumber: input.roundNumber,
      dealerPlayerId,
    };
  }
}
