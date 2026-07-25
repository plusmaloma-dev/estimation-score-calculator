import { ActiveGameControlEngine as LifecycleControlEngine } from './ActiveGameControlEngine.js';
import type {
  ActiveControlTransition,
  ActiveGameControlState,
  StartTurnInput,
} from './types.js';

export class ActiveGameControlEngine extends LifecycleControlEngine {
  startTurn(
    state: ActiveGameControlState,
    input: StartTurnInput,
  ): ActiveControlTransition {
    if (state.lifecycle !== 'active') {
      return {
        valid: false,
        errors: ['Turns can start only while the game is active.'],
        state,
        events: [],
      };
    }
    if (state.turn !== undefined) {
      return {
        valid: false,
        errors: ['The current turn must complete before another turn starts.'],
        state,
        events: [],
      };
    }
    return this.completeActionBoundary(state, input, input.occurredAt);
  }
}
