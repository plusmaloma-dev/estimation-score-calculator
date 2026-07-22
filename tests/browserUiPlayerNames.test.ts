import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BrowserUiShellService,
  FEDERATION_2026,
  InMemoryScoreSheetRepository,
} from '../src/index.js';

test('score sheets preserve player display names for session recovery', () => {
  const repository = new InMemoryScoreSheetRepository();
  const shell = new BrowserUiShellService(repository);

  const created = shell.createScoreSheet({
    name: 'Thursday Table',
    ruleSet: FEDERATION_2026,
    players: [
      { id: 'player-1', name: 'Ahmed' },
      { id: 'player-2', name: 'Mona' },
      { id: 'player-3', name: 'Rami' },
      { id: 'player-4', name: 'Dina' },
    ],
    nowIso: '2026-07-22T10:00:00.000Z',
  });

  assert.equal(created.valid, true);
  assert.deepEqual(created.scoreSheet?.playerNamesById, {
    'player-1': 'Ahmed',
    'player-2': 'Mona',
    'player-3': 'Rami',
    'player-4': 'Dina',
  });
  assert.deepEqual(shell.getSessionHistory().sessions[0]?.players, ['Ahmed', 'Mona', 'Rami', 'Dina']);
});
