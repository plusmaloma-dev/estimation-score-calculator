import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync('supabase/migrations/202607230001_online_uat_schema.sql', 'utf8');

test('online UAT schema defines every shared entity', () => {
  for (const table of [
    'workspaces', 'profiles', 'workspace_memberships', 'players', 'games', 'game_players',
    'rounds', 'round_bids', 'round_actuals', 'round_scores', 'score_overrides',
    'audit_events', 'game_edit_locks',
  ]) {
    assert.match(schema, new RegExp(`create table public\\.${table}\\b`, 'i'), `Missing table ${table}`);
  }
});

test('player names are normalized and unique per workspace', () => {
  assert.match(schema, /function public\.normalize_player_name/i);
  assert.match(schema, /generated always as \(public\.normalize_player_name\(display_name\)\) stored/i);
  assert.match(schema, /unique index players_workspace_normalized_name_uidx[\s\S]*workspace_id, normalized_name/i);
});

test('score integrity and all-loser carry metadata are stored separately', () => {
  for (const field of [
    'calculated_score', 'applied_score', 'is_all_loser_round',
    'consecutive_all_loser_count_before_round', 'carried_all_loser_multiplier',
    'carry_consumed', 'multiple_with_multiplier',
  ]) {
    assert.match(schema, new RegExp(`\\b${field}\\b`, 'i'), `Missing field ${field}`);
  }
});

test('schema contains no frontend or service-role credentials', () => {
  assert.doesNotMatch(schema, /service_role|supabase_service|eyJ[a-zA-Z0-9_-]{20,}/i);
});
