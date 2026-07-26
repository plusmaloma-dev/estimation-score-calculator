import { GameplayCommandProcessor } from '../GameplayCommandProcessor.js';
import { GameplayRoundSnapshotProjector } from '../GameplayRoundSnapshotProjector.js';
import type {
  GameplayCommand,
  GameplayCommandRecord,
  SeatIndex,
} from '../types.js';
import type {
  GameplayRoundActor,
  GameplayRoundApplicationResult,
  GameplayRoundRepository,
  GameplayRoundSeatControl,
} from '../roundApplicationTypes.js';
import type { BotActionDirective } from '../control/types.js';
import { BotBidObservationService } from './BotBidObservationService.js';
import { BotObservationService } from './BotObservationService.js';
import { StandardBotPolicy } from './StandardBotPolicy.js';
import type { BotDecisionAudit } from './types.js';

export interface GameplayBotDirectiveApplicationResult
  extends GameplayRoundApplicationResult {
  readonly audit?: BotDecisionAudit;
}

export class GameplayBotDirectiveService {
  private readonly botPolicy: StandardBotPolicy;

  constructor(
    private readonly repository: GameplayRoundRepository,
    private readonly commandProcessor = new GameplayCommandProcessor(),
    private readonly projector = new GameplayRoundSnapshotProjector(),
    private readonly bidObservationService = new BotBidObservationService(),
    private readonly cardObservationService = new BotObservationService(),
    botPolicy?: StandardBotPolicy,
  ) {
    this.botPolicy = botPolicy ?? new StandardBotPolicy();
  }

  async process(
    tableId: string,
    actor: GameplayRoundActor,
    directive: BotActionDirective,
  ): Promise<GameplayBotDirectiveApplicationResult> {
    const errors = this.validateIdentity(tableId, actor, directive);
    if (errors.length > 0) return this.failure(errors);

    const normalizedTableId = tableId.trim();
    const aggregate = await this.repository.load(normalizedTableId);
    if (aggregate === undefined) return this.failure(['Gameplay round was not found.']);
    const viewerSeat = this.findHumanSeat(aggregate.seatControls, actor.userId);
    if (viewerSeat === undefined) {
      return this.failure(['Authenticated user does not occupy a human seat at this table.']);
    }

    const commandId = `bot-round:${directive.directiveId}`;
    const existing = aggregate.records.find((record) => record.commandId === commandId);
    if (existing !== undefined) {
      if (existing.transition.metadata?.directiveId !== directive.directiveId) {
        return this.failure(['Bot directive command id was already used with different metadata.']);
      }
      const recordedAudit = this.auditFromRecord(existing);
      return {
        valid: existing.accepted,
        errors: existing.errors,
        duplicate: true,
        value: this.projector.project(
          aggregate.tableId,
          aggregate.state,
          aggregate.version,
          viewerSeat,
        ),
        ...(recordedAudit === undefined ? {} : { audit: recordedAudit }),
      };
    }

    if (aggregate.lifecycle !== 'active') {
      return this.failure(['Gameplay bot directives are accepted only while the table is active.']);
    }

    const seatControl = aggregate.seatControls.find((seat) => seat.seat === directive.seat);
    if (seatControl === undefined) return this.failure(['Bot directive seat was not found.']);
    const sourceError = this.sourceError(seatControl, directive.source);
    if (sourceError !== undefined) return this.failure([sourceError]);

    const phaseError = this.phaseError(aggregate.state.phase, directive.actionKind);
    if (phaseError !== undefined) return this.failure([phaseError]);
    const activeSeat = directive.actionKind === 'bid'
      ? aggregate.state.bidOrder[aggregate.state.currentBidIndex]
      : aggregate.state.currentTurnSeat;
    if (activeSeat !== directive.seat) {
      return this.failure(['Bot directive does not match the authoritative active seat.']);
    }

    const { command, audit } = this.decide(aggregate.state, directive);
    const processed = this.commandProcessor.process(
      aggregate.state,
      aggregate.version,
      aggregate.records,
      {
        commandId,
        expectedVersion: aggregate.version,
        command,
      },
    );

    if (processed.record === undefined) {
      return this.failure(
        processed.errors.length > 0
          ? processed.errors
          : ['Bot directive did not produce a gameplay command record.'],
      );
    }

    const record: GameplayCommandRecord = {
      ...processed.record,
      transition: {
        ...processed.record.transition,
        metadata: {
          directiveId: directive.directiveId,
          turnId: directive.turnId,
          actionSource: directive.source,
          botDecisionAudit: audit,
        },
      },
    };
    const commit = await this.repository.commit({
      tableId: aggregate.tableId,
      actorUserId: actor.userId.trim(),
      baseVersion: aggregate.version,
      resultingVersion: processed.version,
      resultingState: processed.state,
      record,
    });
    if (!commit.valid || commit.aggregate === undefined) {
      return this.failure(
        commit.errors.length > 0
          ? commit.errors
          : ['Gameplay bot directive could not be committed.'],
      );
    }

    return {
      valid: processed.valid,
      errors: processed.errors,
      duplicate: false,
      value: this.projector.project(
        commit.aggregate.tableId,
        commit.aggregate.state,
        commit.aggregate.version,
        viewerSeat,
      ),
      audit,
    };
  }

  private decide(
    state: Parameters<BotBidObservationService['create']>[0],
    directive: BotActionDirective,
  ): { readonly command: GameplayCommand; readonly audit: BotDecisionAudit } {
    if (directive.actionKind === 'bid') {
      const result = this.botPolicy.decideBid(
        this.bidObservationService.create(state, directive.seat),
        directive.source,
      );
      return {
        command: {
          type: 'SUBMIT_BID',
          seat: directive.seat,
          bid: result.decision.bid,
        },
        audit: result.audit,
      };
    }

    const result = this.botPolicy.decideCard(
      this.cardObservationService.createCardObservation(state, directive.seat),
      directive.source,
    );
    return {
      command: {
        type: 'PLAY_CARD',
        seat: directive.seat,
        card: result.decision.card,
      },
      audit: result.audit,
    };
  }

  private sourceError(
    seat: GameplayRoundSeatControl,
    source: BotActionDirective['source'],
  ): string | undefined {
    if (source === 'permanent-bot' && seat.controlOwner !== 'permanent-bot') {
      return 'Permanent-bot directive does not match the authoritative seat owner.';
    }
    if (source === 'disconnect-substitute' && seat.controlOwner !== 'temporary-bot') {
      return 'Disconnect-substitute directive does not match the authoritative seat owner.';
    }
    if (source === 'timeout-assistant' && seat.controlOwner !== 'human') {
      return 'Timeout-assistant directive does not match the authoritative seat owner.';
    }
    return undefined;
  }

  private phaseError(
    phase: 'bidding' | 'playing' | 'scored',
    actionKind: BotActionDirective['actionKind'],
  ): string | undefined {
    if (
      actionKind === 'bid' && phase !== 'bidding'
      || actionKind === 'card' && phase !== 'playing'
    ) return 'Bot directive does not match the authoritative round phase.';
    return undefined;
  }

  private findHumanSeat(
    seats: readonly GameplayRoundSeatControl[],
    userId: string,
  ): SeatIndex | undefined {
    return seats.find((seat) => seat.humanUserId === userId.trim())?.seat;
  }

  private auditFromRecord(record: GameplayCommandRecord): BotDecisionAudit | undefined {
    const value = record.transition.metadata?.botDecisionAudit;
    return typeof value === 'object' && value !== null
      ? value as BotDecisionAudit
      : undefined;
  }

  private validateIdentity(
    tableId: string,
    actor: GameplayRoundActor,
    directive: BotActionDirective,
  ): string[] {
    const errors: string[] = [];
    if (!tableId.trim()) errors.push('Gameplay table ID is required.');
    if (!actor.userId.trim()) errors.push('Authenticated user ID is required.');
    if (!directive.directiveId.trim()) errors.push('Bot directive ID is required.');
    if (directive.tableId !== tableId.trim()) {
      errors.push('Bot directive table does not match the requested table.');
    }
    if (!directive.turnId.trim()) errors.push('Bot directive turn ID is required.');
    return errors;
  }

  private failure(errors: readonly string[]): GameplayBotDirectiveApplicationResult {
    return { valid: false, errors, duplicate: false };
  }
}
