import { useState, type FormEvent } from 'react';
import { FEDERATION_2026, HOUSE_RULES_V1, type ScoringRuleSetId } from '../../index.js';
import { useApp } from '../AppContext.js';
import { useI18n } from '../i18n/I18nContext.js';

const EMPTY_NAMES = ['', '', '', ''] as const;

export function NewGameScreen() {
  const { services, navigate, openScoreSheet } = useApp();
  const { t } = useI18n();
  const [gameName, setGameName] = useState('');
  const [names, setNames] = useState<readonly string[]>(EMPTY_NAMES);
  const [ruleSet, setRuleSet] = useState<ScoringRuleSetId>(HOUSE_RULES_V1);
  const [errors, setErrors] = useState<readonly string[]>([]);

  function updateName(index: number, value: string) {
    setNames((current) => current.map((name, playerIndex) => playerIndex === index ? value : name));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = services.shell.createScoreSheet({
      name: gameName,
      ruleSet,
      players: names.map((name, index) => ({ id: `player-${index + 1}`, name })),
    });
    if (result.valid && result.scoreSheet !== undefined) {
      openScoreSheet(result.scoreSheet.id);
      return;
    }
    setErrors(result.errors);
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

        {names.map((name, index) => (
          <label key={index}>
            <span>{t('player')} {index + 1}</span>
            <input value={name} onChange={(event) => updateName(index, event.target.value)} />
          </label>
        ))}

        <button className="primary-button" type="submit">{t('createGame')}</button>
      </form>
    </section>
  );
}
