import type { EstimationBid } from '../../domain/bid.js';
import { CONTRACT_SUITS } from '../../domain/card.js';
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
    if (input.bidOrder[0] !== input.bidOwnerSeat) {
      throw new Error('Standard bot simulation requires the bid owner to act first.');
    }

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
      firstLeadSeat: input.firstLeadSeat,
    };
    const initialState = this.roundEngine.create(createInput);
    let state = initialState;
    let version = 0;
    let records: readonly GameplayCommandRecord[] = [];
    const decisionAudits: BotDecisionAudit[] = [];
    let rejectedCommandCount = 0;

    while (state.phase === 'bidding') {
      const seat = state.bidOrder[state.currentBidIndex];
      if (seat === undefined) {
        throw new Error('Bidding phase has no active seat.');
      }
      const observation = this.createBidObservation(state, seat);
      const botResult = this.botPolicy.decideBid(observation, 'permanent-bot');
      decisionAudits.push(botResult.audit);

      const processed = this.commandProcessor.process(state, version, records, {
        commandId: `bid-${state.currentBidIndex + 1}`,
        expectedVersion: version,
        command: {
          type: 'SUBMIT_BID',
          seat,
          bid: botResult.decision.bid,
        },
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

  private createBidObservation(
    state: HouseRulesRoundState,
    seat: SeatIndex,
  ): BotBidObservation {
    const playerId = state.players[seat].playerId;

    return {
      policyVersion: STANDARD_BOT_POLICY_VERSION,
      playerId,
      hand: state.hands[seat].cards,
      legalBids: this.legalBids(state, seat),
      priorBids: state.bids,
      bidOwnerPlayerId: state.players[state.bidOwnerSeat].playerId,
      isLastBidder: state.currentBidIndex === 3,
      currentScores: Object.fromEntries(state.players.map((player) => [player.playerId, 0])),
    };
  }

  private legalBids(
    state: HouseRulesRoundState,
    seat: SeatIndex,
  ): readonly EstimationBid[] {
    const playerId = state.players[seat].playerId;
    const bidOwnerPlayerId = state.players[state.bidOwnerSeat].playerId;
    let candidates: EstimationBid[];

    if (seat === state.bidOwnerSeat) {
      candidates = [];
      for (let tricks = 4; tricks <= 7; tricks += 1) {
        for (const trumpSuit of CONTRACT_SUITS) {
          candidates.push({
            playerId,
            bidType: 'normal',
            tricks,
            trumpSuit,
          });
        }
      }
    } else {
      const ownerBid = state.bids.find((bid) => bid.playerId === bidOwnerPlayerId);
      if (ownerBid === undefined) {
        throw new Error('Bid owner must act before other Standard bot bidders.');
      }
      candidates = [];
      for (let tricks = 1; tricks < ownerBid.tricks; tricks += 1) {
        candidates.push({ playerId, bidType: 'normal', tricks });
      }
      candidates.push({
        playerId,
        bidType: 'with',
        tricks: ownerBid.tricks,
        withTargetPlayerId: bidOwnerPlayerId,
      });
    }

    if (state.currentBidIndex === 3) {
      const currentTotal = state.bids.reduce((total, bid) => total + bid.tricks, 0);
      candidates = candidates.filter((bid) => currentTotal + bid.tricks !== 13);
    }

    if (candidates.length === 0) {
      throw new Error(`No legal Standard bot bids remain for seat ${seat}.`);
    }
    return candidates;
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
