import type { EstimationBid } from '../../domain/bid.js';
import { FairDealService } from '../FairDealService.js';
import { GameplayCommandProcessor } from '../GameplayCommandProcessor.js';
import { GameplayReplayService } from '../GameplayReplayService.js';
import { HouseRulesRoundEngine } from '../HouseRulesRoundEngine.js';
import type {
  CreateHouseRulesRoundInput,
  GameplayCommandRecord,
  HouseRulesRoundState,
  SeatIndex,
} from '../types.js';
import { BotObservationService } from './BotObservationService.js';
import { BotBidObservationService } from './BotBidObservationService.js';
import { StandardBotPolicy } from './StandardBotPolicy.js';
import {
  STANDARD_BOT_POLICY_VERSION,
  type BotBidObservation,
  type BotDecisionAudit,
  type BotSimulationInput,
  type BotSimulationMetrics,
  type BotSimulationResult,
} from './types.js';

export class BotSimulationService {
  private readonly botPolicy: StandardBotPolicy;
  private readonly observationService: BotObservationService;
  private readonly bidObservationService = new BotBidObservationService();

  constructor(
    private readonly fairDealService = new FairDealService(),
    private readonly roundEngine = new HouseRulesRoundEngine(),
    private readonly commandProcessor = new GameplayCommandProcessor(roundEngine),
    private readonly replayService = new GameplayReplayService(),
    botPolicy?: StandardBotPolicy,
  ) {
    this.botPolicy = botPolicy ?? new StandardBotPolicy({ clock: () => 0 });
    this.observationService = new BotObservationService(roundEngine);
  }

  async simulateRound(input: BotSimulationInput): Promise<BotSimulationResult> {
    const deal = await this.fairDealService.deal({
      gameId: input.gameId,
      dealId: input.dealId,
      ruleSet: 'HOUSE_RULES_V1',
      nonce: input.nonce,
      seedHex: input.seedHex,
      firstSeat: input.firstSeat,
    });
    const createInput: CreateHouseRulesRoundInput = {
      roundNumber: input.roundNumber,
      players: [
        { seat: 0, playerId: 'bot-0' },
        { seat: 1, playerId: 'bot-1' },
        { seat: 2, playerId: 'bot-2' },
        { seat: 3, playerId: 'bot-3' },
      ],
      hands: deal.hands,
      bidOrder: input.bidOrder,
      playOrder: input.playOrder,
      bidOwnerSeat: input.bidOwnerSeat,
      dealerSeat: input.bidOwnerSeat,
      firstLeadSeat: input.firstLeadSeat,
    };
    const initialState = this.roundEngine.create(createInput);
    let state = initialState;
    let version = 0;
    let records: readonly GameplayCommandRecord[] = [];
    const decisionAudits: BotDecisionAudit[] = [];
    let rejectedCommandCount = 0;

    while (state.phase === 'auction' || state.phase === 'estimate') {
      const seat = state.phase === 'auction'
        ? state.auctionActiveSeat
        : state.estimateOrder[state.currentEstimateIndex];
      if (seat === undefined) {
        throw new Error('Bidding phase has no active seat.');
      }
      const command = state.phase === 'auction'
        ? {
            type: 'SUBMIT_AUCTION_ACTION' as const,
            seat,
            action: state.currentHighestContract === undefined
              ? { type: 'contract' as const, tricks: 4, trumpSuit: 'clubs' as const }
              : { type: 'pass' as const },
          }
        : (() => {
            const botResult = this.botPolicy.decideBid(this.bidObservationService.create(state, seat), 'permanent-bot');
            decisionAudits.push(botResult.audit);
            return { type: 'SUBMIT_BID' as const, seat, bid: botResult.decision.bid };
          })();
      if (command.type === 'SUBMIT_AUCTION_ACTION') {
        decisionAudits.push({
          policyVersion: STANDARD_BOT_POLICY_VERSION,
          actionSource: 'permanent-bot',
          reasonCode: 'EXPECTED_UTILITY_BID',
          legalActionIds: [],
          selectedActionId: JSON.stringify(command.action),
          durationMs: 0,
          fallbackUsed: false,
        });
      }

      const processed = this.commandProcessor.process(state, version, records, {
        commandId: `bid-${version + 1}`,
        expectedVersion: version,
        command,
      });
      if (!processed.valid) {
        rejectedCommandCount += 1;
        throw new Error(`Standard bot submitted an invalid bid: ${processed.errors.join(' ')}`);
      }
      state = processed.state;
      version = processed.version;
      records = processed.records;
    }

    let playNumber = 0;
    while (state.phase !== 'scored') {
      const seat = state.currentTurnSeat;
      if (seat === undefined) {
        throw new Error('Playing phase has no active seat.');
      }
      const botResult = this.botPolicy.decideCard(
        this.observationService.createCardObservation(state, seat),
        'permanent-bot',
      );
      decisionAudits.push(botResult.audit);

      const processed = this.commandProcessor.process(state, version, records, {
        commandId: `play-${playNumber + 1}`,
        expectedVersion: version,
        command: {
          type: 'PLAY_CARD',
          seat,
          card: botResult.decision.card,
        },
      });
      if (!processed.valid) {
        rejectedCommandCount += 1;
        throw new Error(`Standard bot submitted an invalid card: ${processed.errors.join(' ')}`);
      }
      state = processed.state;
      version = processed.version;
      records = processed.records;
      playNumber += 1;
    }

    const replay = this.replayService.replay(initialState, records);
    const replayVerified = replay.valid
      && replay.version === version
      && JSON.stringify(replay.state) === JSON.stringify(state);

    return {
      finalState: state,
      version,
      records,
      decisionAudits,
      reasonCounts: this.countReasons(decisionAudits),
      metrics: this.calculateMetrics(state),
      rejectedCommandCount,
      replayVerified,
    };
  }

  private calculateMetrics(state: HouseRulesRoundState): BotSimulationMetrics {
    const playerScores = state.scoreResult?.scoreResult?.playerScores;
    if (playerScores === undefined || playerScores.length !== 4) {
      throw new Error('Completed bot simulation does not contain four player scores.');
    }

    return {
      exactMatchRate: playerScores.filter((score) => score.didMatchBid).length / playerScores.length,
      meanAbsoluteEstimateError: playerScores.reduce((total, score) => total + score.delta, 0) / playerScores.length,
      averageScore: playerScores.reduce((total, score) => total + score.score, 0) / playerScores.length,
    };
  }

  private countReasons(audits: readonly BotDecisionAudit[]): Readonly<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const audit of audits) {
      counts[audit.reasonCode] = (counts[audit.reasonCode] ?? 0) + 1;
    }
    return counts;
  }
}
