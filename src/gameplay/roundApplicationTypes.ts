import type { OnlineGameplayRoundSnapshot } from '../online/gameplay/roundTypes.js';
import type {
  GameplayCommandRecord,
  HouseRulesRoundState,
  SeatIndex,
} from './types.js';
import type { GameplayRoundScoreHistoryRow } from './scoreHistoryTypes.js';

export type GameplayRoundLifecycle = 'active' | 'paused' | 'completed' | 'terminated';
export type GameplayRoundControlOwner = 'human' | 'temporary-bot' | 'permanent-bot';

export interface GameplayRoundActor {
  readonly userId: string;
}

export interface GameplayRoundSeatControl {
  readonly seat: SeatIndex;
  readonly humanUserId?: string;
  readonly botId?: string;
  readonly controlOwner: GameplayRoundControlOwner;
  readonly seatKind?: 'human' | 'bot';
  readonly displayName?: string;
}

export interface GameplayRoundAggregate {
  readonly tableId: string;
  readonly lifecycle: GameplayRoundLifecycle;
  readonly state: HouseRulesRoundState;
  readonly version: number;
  readonly records: readonly GameplayCommandRecord[];
  readonly seatControls: readonly GameplayRoundSeatControl[];
  readonly scoreHistory?: readonly GameplayRoundScoreHistoryRow[];
}

export interface GameplayRoundCommitInput {
  readonly tableId: string;
  readonly actorUserId: string;
  readonly baseVersion: number;
  readonly resultingVersion: number;
  readonly resultingState: HouseRulesRoundState;
  readonly record: GameplayCommandRecord;
}

export interface GameplayRoundCommitResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly aggregate?: GameplayRoundAggregate;
}

export interface GameplayRoundRepository {
  load(tableId: string): Promise<GameplayRoundAggregate | undefined>;
  commit(input: GameplayRoundCommitInput): Promise<GameplayRoundCommitResult>;
}

export interface GameplayRoundApplicationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly duplicate: boolean;
  readonly value?: OnlineGameplayRoundSnapshot;
}
