import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const copies = [
  {
    label: 'repository gameplay-round-command source',
    source: readFileSync(
      'supabase/functions/gameplay-round-command/index.ts',
      'utf8',
    ),
  },
  {
    label: 'isolated gameplay deployment source',
    source: readFileSync(
      'supabase-gameplay/supabase/functions/gameplay-round-command/index.ts',
      'utf8',
    ),
  },
] as const;

for (const copy of copies) {
  test(
    `next-round dispatch leaves human bid and card boundary coordination intact in the ${copy.label}`,
    () => {
      assert.match(copy.source, /start-next-round/);
      assert.match(copy.source, /actionKind:\s*'bid'/);
      assert.match(copy.source, /actionKind:\s*'card'/);
      assert.match(copy.source, /coordinateHumanRoundAction/);
    },
  );

  test(
    `human actions synchronize active control in the ${copy.label}`,
    () => {
      assert.match(copy.source, /coordinateHumanRoundAction/);
      assert.match(copy.source, /class SupabaseHumanActionBoundaryPort/);
      assert.match(copy.source, /complete_active_action_boundary/);
      assert.match(copy.source, /actionKind:\s*'bid'/);
      assert.match(copy.source, /actionKind:\s*'card'/);

      assert.doesNotMatch(
        copy.source,
        /return json\(await service\.(submitBid|playCard)\(/,
      );
    },
  );

  test(
    `deterministic completion recovery exists in the ${copy.label}`,
    () => {
      assert.match(
        copy.source,
        /human-complete:\$\{input\.roundCommandId\}/,
      );

      assert.match(
        copy.source,
        /completedCommand\?\.accepted === true/,
      );

      assert.match(
        copy.source,
        /\['running', 'assistant-pending', 'bot-processing'\]/,
      );

      assert.match(copy.source, /turn_action_kind/);
      assert.match(copy.source, /turn_seat/);
    },
  );
}
