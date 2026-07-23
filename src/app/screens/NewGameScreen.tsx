import { useState, type FormEvent } from 'react';
import { FEDERATION_2026, HOUSE_RULES_V1, type ScoringRuleSetId } from '../../index.js';
import type { DirectoryPlayer } from '../../online/players/types.js';
import { useApp } from '../AppContext.js';
import { PlayerCombobox } from '../components/PlayerCombobox.js';
import { useI18n } from '../i18n/I18nContext.js';

const EMPTY_PLAYERS = [undefined, undefined, undefined, undefined] as const;

export function NewGameScreen() {
  const { services, navigate, openScoreSheet } = useApp();
  const { t } = useI18n();
  const [gameName, setGameName] = useState('');
  const [players, setPlayers] = useState<readonly (DirectoryPlayer | undefined)[]>(EMPTY_PLAYERS);
  const [ruleSet, setRuleSet] = useState<ScoringRuleSetId>(HOUSE_RULES_V1);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function updatePlayer(index: number, player: DirectoryPlayer | undefined) {
    setPlayers((current) => current.map((value, playerIndex) => playerIndex === index ? player : value));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = players.filter((player): player is DirectoryPlayer => player !== undefined);
    if (selected.length !== 4) {
      setErrors(['Select or create exactly four players.']);
      return;
    }
    if (new Set(selected.map((player) => player.id)).size !== 4) {
      setErrors(['The same player cannot be selected more than once.']);
      return;
    }

    setSubmitting(true);
    try {
      const result = await Promise.resolve(services.shell.createScoreSheet({
        name: gameName,
        ruleSet,
        players: selected.map((player) => ({ id: player.id, name: player.name })),
      }));
      if (result.valid && result.scoreSheet !== undefined) {
        setErrors([]);
        openScoreSheet(result.scoreSheet.id);
        return;
      }
      setErrors(result.errors);
    } catch (reason: unknown) {
      setErrors([reason instanceof Error ? reason.message : 'Game could not be created.']);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="screen-stack" aria-labelledby="new-game-heading">
      <button className="text-button" type="button" onClick={() => navigate('home')}>
        {t('backHome')}
      </button>
      <h2 id="new-game-heading">{t('startNewGame')}</h2>
      {errors.length > 0 && (
        <div className="error-summary" role="alert">
          <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      )}
      <form className="setup-form" onSubmit={submit}>
        <label>
          <span>{t('gameName')}</span>
          <input value={gameName} onChange={(event) => setGameName(event.target.value)} />
        </label>

        <fieldset>
          <legend>{t('scoringRuleSet')}</legend>
          <label className="radio-card">
            <input
              type="radio"
              name="rule-set"
              value={HOUSE_RULES_V1}
              checked={ruleSet === HOUSE_RULES_V1}
              onChange={() => setRuleSet(HOUSE_RULES_V1)}
            />
            {t('houseRules')}
          </label>
          <label className="radio-card">
            <input
              type="radio"
              name="rule-set"
              value={FEDERATION_2026}
              checked={ruleSet === FEDERATION_2026}
              onChange={() => setRuleSet(FEDERATION_2026)}
            />
            {t('federation')}
          </label>
        </fieldset>

        {players.map((player, index) => (
          <PlayerCombobox
            key={index}
            label={`${t('player')} ${index + 1}`}
            directory={services.playerDirectory}
            selected={player}
            excludedPlayerIds={players
              .filter((candidate, playerIndex): candidate is DirectoryPlayer => playerIndex !== index && candidate !== undefined)
              .map((candidate) => candidate.id)}
            onChange={(value) => updatePlayer(index, value)}
          />
        ))}

        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? 'Creating game…' : t('createGame')}
        </button>
      </form>
    </section>
  );
}
