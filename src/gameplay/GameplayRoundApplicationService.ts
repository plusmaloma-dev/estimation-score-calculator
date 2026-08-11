import type { EstimationBid } from '../domain/bid.js';
import type { Card } from '../domain/card.js';
import { GameplayCommandProcessor } from './GameplayCommandProcessor.js';
import { GameplayRoundSnapshotProjector } from './GameplayRoundSnapshotProjector.js';
import type {
  GameplayAuctionAction,
  GameplayCommand,
  GameplayCommandEnvelope,
  SeatIndex,
} from './types.js';
import type {
  GameplayRoundActor,
  GameplayRoundAggregate,
  GameplayRoundApplicationResult,
  GameplayRoundRepository,
  GameplayRoundSeatControl,
} from './roundApplicationTypes.js';

export class GameplayRoundApplicationService {
  constructor(
    private readonly repository: GameplayRoundRepository,
    private readonly commandProcessor = new GameplayCommandProcessor(),
    private readonly projector = new GameplayRoundSnapshotProjector(),
  ) {}

  async getSnapshot(
    tableId: string,
    actor: GameplayRoundActor,
  ): Promise<GameplayRoundApplicationResult> {
    const inputErrors = this.validateIdentity(tableId, actor);
    if (inputErrors.length > 0) return this.failure(inputErrors);

    const aggregate = await this.repository.load(tableId.trim());
    if (aggregate === undefined) return this.failure(['Gameplay round was not found.']);
    const seatControl = this.findHumanSeat(aggregate, actor.userId);
    if (seatControl === undefined) {
      return this.failure(['Authenticated user does not occupy a human seat at this table.']);
    }

    return {
      valid: true,
      errors: [],
      duplicate: false,
      value: this.projector.project(
        aggregate.tableId,
        aggregate.state,
        aggregate.version,
        seatControl.seat,
      ),
    };
  }

  async submitBid(
    tableId: string,
    actor: GameplayRoundActor,
    commandId: string,
    expectedVersion: number,
    bid: EstimationBid,
  ): Promise<GameplayRoundApplicationResult> {
    return this.mutate(tableId, actor, commandId, expectedVersion, (seat) => ({
      type: 'SUBMIT_BID',
      seat,
      bid,
    }));
  }

  async submitAuctionAction(
    tableId: string,
    actor: GameplayRoundActor,
    commandId: string,
    expectedVersion: number,
    action: GameplayAuctionAction,
  ): Promise<GameplayRoundApplicationResult> {
    return this.mutate(tableId, actor, commandId, expectedVersion, (seat) => ({
      type: 'SUBMIT_AUCTION_ACTION',
      seat,
      action,
    }));
  }

  async playCard(
    tableId: string,
    actor: GameplayRoundActor,
    commandId: string,
    expectedVersion: number,
    card: Card,
  ): Promise<GameplayRoundApplicationResult> {
    return this.mutate(tableId, actor, commandId, expectedVersion, (seat) => ({
      type: 'PLAY_CARD',
      seat,
      card,
    }));
  }

  private async mutate(
    tableId: string,
    actor: GameplayRoundActor,
    commandId: string,
    expectedVersion: number,
    commandForSeat: (seat: SeatIndex) => GameplayCommand,
  ): Promise<GameplayRoundApplicationResult> {
    const inputErrors = this.validateIdentity(tableId, actor);
    if (!commandId.trim()) inputErrors.push('Gameplay command ID is required.');
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      inputErrors.push('Expected gameplay version must be a non-negative integer.');
    }
    if (inputErrors.length > 0) return this.failure(inputErrors);

    const normalizedTableId = tableId.trim();
    const aggregate = await this.repository.load(normalizedTableId);
    if (aggregate === undefined) return this.failure(['Gameplay round was not found.']);

    const seatControl = this.findHumanSeat(aggregate, actor.userId);
    if (seatControl === undefined) {
      return this.failure(['Authenticated user does not occupy a human seat at this table.']);
    }
    if (aggregate.lifecycle !== 'active') {
      return this.failure(['Gameplay commands are only accepted while the table is active.']);
    }
    if (seatControl.controlOwner !== 'human') {
      return this.failure([
        `Seat ${seatControl.seat} is currently controlled by a ${seatControl.controlOwner === 'temporary-bot' ? 'temporary' : 'permanent'} bot.`,
      ]);
    }

    const envelope: GameplayCommandEnvelope = {
      commandId: commandId.trim(),
      expectedVersion,
      command: commandForSeat(seatControl.seat),
    };
    const processResult = this.commandProcessor.process(
      aggregate.state,
      aggregate.version,
      aggregate.records,
      envelope,
    );

    if (processResult.duplicate || processResult.record === undefined) {
      return {
        valid: processResult.valid,
        errors: processResult.errors,
        duplicate: processResult.duplicate,
        value: this.projector.project(
          aggregate.tableId,
          aggregate.state,
          aggregate.version,
          seatControl.seat,
        ),
      };
    }

    const commitResult = await this.repository.commit({
      tableId: aggregate.tableId,
      actorUserId: actor.userId.trim(),
      baseVersion: aggregate.version,
      resultingVersion: processResult.version,
      resultingState: processResult.state,
      record: processResult.record,
    });
    if (!commitResult.valid || commitResult.aggregate === undefined) {
      return this.failure(
        commitResult.errors.length > 0
          ? commitResult.errors
          : ['Gameplay round command could not be committed.'],
      );
    }

    const committedSeat = this.findHumanSeat(commitResult.aggregate, actor.userId);
    if (committedSeat === undefined) {
      return this.failure(['Authenticated user no longer occupies a human seat at this table.']);
    }

    return {
      valid: processResult.valid,
      errors: processResult.errors,
      duplicate: false,
      value: this.projector.project(
        commitResult.aggregate.tableId,
        commitResult.aggregate.state,
        commitResult.aggregate.version,
        committedSeat.seat,
      ),
    };
  }

  private findHumanSeat(
    aggregate: GameplayRoundAggregate,
    userId: string,
  ): GameplayRoundSeatControl | undefined {
    const normalizedUserId = userId.trim();
    return aggregate.seatControls.find(
      (seat) => seat.humanUserId === normalizedUserId,
    );
  }

  private validateIdentity(tableId: string, actor: GameplayRoundActor): string[] {
    const errors: string[] = [];
    if (!tableId.trim()) errors.push('Gameplay table ID is required.');
    if (!actor.userId.trim()) errors.push('Authenticated user ID is required.');
    return errors;
  }

  private failure(errors: readonly string[]): GameplayRoundApplicationResult {
    return { valid: false, errors, duplicate: false };
  }
}
