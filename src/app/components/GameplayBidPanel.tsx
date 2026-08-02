import { useEffect, useState, type FormEvent } from 'react';
import type { EstimationBid } from '../../domain/bid.js';
import type { ContractSuit } from '../../domain/card.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { useI18n } from '../i18n/I18nContext.js';
import type { TranslationKey } from '../i18n/translations.js';
import { GameplayHand } from './GameplayHand.js';

const CONTRACT_OPTIONS: readonly ContractSuit[] = [
  'no-trump',
  'spades',
  'hearts',
  'diamonds',
  'clubs',
];

function contractLabelKey(contract: ContractSuit): TranslationKey {
  switch (contract) {
    case 'no-trump': return 'noTrump';
    case 'spades': return 'spades';
    case 'hearts': return 'hearts';
    case 'diamonds': return 'diamonds';
    case 'clubs': return 'clubs';
  }
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
  const firstEstimate = snapshot.legalNormalEstimates[0];
  const [estimate, setEstimate] = useState(firstEstimate === undefined ? '' : String(firstEstimate));
  const [contractSuit, setContractSuit] = useState<ContractSuit | ''>('');
  const isBidOwner = snapshot.viewerSeat === snapshot.bidOwnerSeat;

  useEffect(() => {
    const next = snapshot.legalNormalEstimates[0];
    setEstimate(next === undefined ? '' : String(next));
    if (!isBidOwner) setContractSuit('');
  }, [isBidOwner, snapshot.legalNormalEstimates, snapshot.version]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tricks = Number(estimate);
    const player = snapshot.players.find((candidate) => candidate.seat === snapshot.viewerSeat);
    if (player === undefined || !snapshot.legalNormalEstimates.includes(tricks)) return;
    if (isBidOwner && contractSuit === '') return;

    await onSubmit({
      playerId: player.playerId,
      bidType: 'normal',
      tricks,
      ...(contractSuit === '' ? {} : { trumpSuit: contractSuit }),
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
                value={estimate}
                disabled={busy}
                onChange={(event) => setEstimate(event.target.value)}
              >
                {snapshot.legalNormalEstimates.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            {isBidOwner && (
              <label>
                {t('contractSuit')}
                <select
                  value={contractSuit}
                  disabled={busy}
                  required
                  onChange={(event) => setContractSuit(event.target.value as ContractSuit | '')}
                >
                  <option value="">{t('selectContract')}</option>
                  {CONTRACT_OPTIONS.map((option) => (
                    <option key={option} value={option}>{t(contractLabelKey(option))}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <button
            className="primary-button"
            type="submit"
            disabled={busy || estimate === '' || isBidOwner && contractSuit === ''}
          >
            {t('submitEstimate')}
          </button>
        </form>
      )}
    </section>
  );
}
