import type { OnlineBotActionDirective } from './activeControlTypes.js';
import type { OnlineGameplayRoundSnapshot } from './roundTypes.js';
import type { OnlineGameplayResult } from './types.js';

export interface OnlineBotDirectiveResult
  extends OnlineGameplayResult<OnlineGameplayRoundSnapshot> {
  readonly terminal: boolean;
}

export interface BotDirectiveProcessor {
  processBotDirective(
    tableId: string,
    directiveId: string,
  ): Promise<OnlineBotDirectiveResult>;
}

export class BotDirectiveCoordinator {
  private readonly completed = new Set<string>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly processor: BotDirectiveProcessor) {}

  async process(
    directives: readonly OnlineBotActionDirective[],
    onSnapshot: (snapshot: OnlineGameplayRoundSnapshot) => void,
    onError: (errors: readonly string[]) => void,
  ): Promise<void> {
    const operations = directives.map((directive) => this.enqueue(
      directive,
      onSnapshot,
      onError,
    ));
    await Promise.all(operations);
  }

  reset(): void {
    this.completed.clear();
    this.inFlight.clear();
    this.queue = Promise.resolve();
  }

  private enqueue(
    directive: OnlineBotActionDirective,
    onSnapshot: (snapshot: OnlineGameplayRoundSnapshot) => void,
    onError: (errors: readonly string[]) => void,
  ): Promise<void> {
    if (this.completed.has(directive.directiveId)) return Promise.resolve();
    const existing = this.inFlight.get(directive.directiveId);
    if (existing !== undefined) return existing;

    const operation = this.queue.then(async () => {
      if (this.completed.has(directive.directiveId)) return;
      const result = await this.processor.processBotDirective(
        directive.tableId,
        directive.directiveId,
      );
      if (result.valid && result.value !== undefined) {
        this.completed.add(directive.directiveId);
        onSnapshot(result.value);
        return;
      }
      if (result.terminal) this.completed.add(directive.directiveId);
      onError(result.errors);
    }).finally(() => {
      this.inFlight.delete(directive.directiveId);
    });

    this.inFlight.set(directive.directiveId, operation);
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
