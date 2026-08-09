import { useEffect, useState, type FormEvent } from 'react';
import type { EstimationBid } from '../../domain/bid.js';
import type { ContractSuit } from '../../domain/card.js';
import type {
  OnlineGameplayBidOption,
  OnlineGameplayRoundSnapshot,
} from '../../online/gameplay/roundTypes.js';
import { useI18n } from '../i18n/I18nContext.js';
import type { TranslationKey } from '../i18n/translations.js';
import { GameplayHand } from './GameplayHand.js';

function contractLabelKey(contract: ContractSuit): TranslationKey {
  switch (contract) {
    case 'no-trump': return 'noTrump';
    case 'spades': return 'spades';
    case 'hearts': return 'hearts';
    case 'diamonds': return 'diamonds';
    case 'clubs': return 'clubs';
  }
}

function optionKey(option: OnlineGameplayBidOption): string {
  return `${option.tricks}:${option.bidType}:${option.withTargetPlayerId ?? ''}`;
}

export function GameplayBidPanel({
  snapshot,
  canSubmit,
  busy,
  onSubmit,
}: {
  readonly snapshot: OnlineGameplayRoundSnapshot;
  readonly canSubmit: boolean;
  readonly busy: boolean;
  readonly onSubmit: (bid: EstimationBid) => Promise<void>;
}) {
  const { t } = useI18n();
  const legalBidOptions = snapshot.legalBidOptions ?? [];
  const firstOption = legalBidOptions[0];
  const [selectedOptionKey, setSelectedOptionKey] = useState(firstOption === undefined ? '' : optionKey(firstOption));
  const [contractSuit, setContractSuit] = useState<ContractSuit | ''>('');
  const selectedOption = legalBidOptions.find((option) => optionKey(option) === selectedOptionKey);

  useEffect(() => {
    const next = snapshot.legalBidOptions?.[0];
    setSelectedOptionKey(next === undefined ? '' : optionKey(next));
    setContractSuit('');
  }, [snapshot.legalBidOptions, snapshot.version]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const player = snapshot.players.find((candidate) => candidate.seat === snapshot.viewerSeat);
    if (player === undefined || selectedOption === undefined) return;
    if (selectedOption.requiresContractSuit && contractSuit === '') return;

    await onSubmit({
      playerId: player.playerId,
      bidType: selectedOption.bidType,
      tricks: selectedOption.tricks,
      ...(selectedOption.requiresContractSuit ? { trumpSuit: contractSuit as ContractSuit } : {}),
      ...(selectedOption.withTargetPlayerId === undefined
        ? {}
        : { withTargetPlayerId: selectedOption.withTargetPlayerId }),
    });
  }

  return (
    <section className="gameplay-bid-panel" aria-labelledby="round-estimates-heading">
      <div className="gameplay-round-heading">
        <h3 id="round-estimates-heading">{t('estimate')}</h3>
        <span className="rule-chip">{t('version')} {snapshot.version}</span>
      </div>

      {snapshot.phase === 'bidding' && (
        <GameplayHand
          ownHand={snapshot.ownHand}
          mode="read-only"
          legalCardIds={new Set()}
        />
      )}

      {snapshot.phase === 'bidding' && canSubmit && (
        <form className="gameplay-bid-form" onSubmit={(event) => void submit(event)}>
          <div className="gameplay-form-grid">
            <label>
              {t('estimate')}
              <select
                value={selectedOptionKey}
                disabled={busy}
                onChange={(event) => {
                  setSelectedOptionKey(event.target.value);
                  setContractSuit('');
                }}
              >
                {legalBidOptions.map((option) => (
                  <option key={optionKey(option)} value={optionKey(option)}>{option.tricks}</option>
                ))}
              </select>
            </label>
            {selectedOption?.requiresContractSuit === true && (
              <label>
                {t('contractSuit')}
                <select
                  value={contractSuit}
                  disabled={busy}
                  required
                  onChange={(event) => setContractSuit(event.target.value as ContractSuit | '')}
                >
                  <option value="">{t('selectContract')}</option>
                  {selectedOption.legalContractSuits.map((option) => (
                    <option key={option} value={option}>{t(contractLabelKey(option))}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <button
            className="primary-button"
            type="submit"
            disabled={busy || selectedOption === undefined || selectedOption.requiresContractSuit && contractSuit === ''}
          >
            {t('submitEstimate')}
          </button>
        </form>
      )}
    </section>
  );
}
