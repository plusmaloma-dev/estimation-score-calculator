import { useEffect, useState, type FormEvent } from 'react';
import type { EstimationBid } from '../../domain/bid.js';
import type { ContractSuit } from '../../domain/card.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
import { useI18n } from '../i18n/I18nContext.js';

const CONTRACT_OPTIONS: readonly { readonly value: ContractSuit; readonly label: string }[] = [
  { value: 'no-trump', label: 'No Trump' },
  { value: 'spades', label: 'Spades' },
  { value: 'hearts', label: 'Hearts' },
  { value: 'diamonds', label: 'Diamonds' },
  { value: 'clubs', label: 'Clubs' },
];

function contractLabel(suit: ContractSuit | undefined): string {
  return CONTRACT_OPTIONS.find((option) => option.value === suit)?.label ?? '';
}

function bidLabel(bid: EstimationBid | undefined): string {
  if (bid === undefined) return 'Pending';
  const contract = contractLabel(bid.trumpSuit);
  return contract.length === 0 ? String(bid.tricks) : `${bid.tricks} · ${contract}`;
}

export function GameplayBidPanel({
  snapshot,
  busy,
  onSubmit,
}: {
  readonly snapshot: OnlineGameplayRoundSnapshot;
  readonly busy: boolean;
  readonly onSubmit: (bid: EstimationBid) => Promise<void>;
}) {
  const { t } = useI18n();
  const firstEstimate = snapshot.legalNormalEstimates[0];
  const [estimate, setEstimate] = useState(firstEstimate === undefined ? '' : String(firstEstimate));
  const [contractSuit, setContractSuit] = useState<ContractSuit | ''>('');
  const isViewerTurn = snapshot.phase === 'bidding'
    && snapshot.nextBidSeat === snapshot.viewerSeat
    && snapshot.legalNormalEstimates.length > 0;
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
        <h3 id="round-estimates-heading">Round {snapshot.roundNumber} estimates</h3>
        <span className="rule-chip">Version {snapshot.version}</span>
      </div>

      <ul className="gameplay-estimate-list" aria-label="Public estimates">
        {snapshot.players.map((player) => (
          <li key={player.seat} className={snapshot.nextBidSeat === player.seat ? 'gameplay-estimate--active' : ''}>
            <span>Seat {player.seat + 1}</span>
            <strong>{bidLabel(player.bid)}</strong>
          </li>
        ))}
      </ul>

      {snapshot.phase === 'playing' ? (
        <p role="status">{t('biddingComplete')}</p>
      ) : snapshot.phase === 'scored' ? (
        <p role="status">{t('roundScored')}</p>
      ) : isViewerTurn ? (
        <form className="gameplay-bid-form" onSubmit={(event) => void submit(event)}>
          <p className="gameplay-turn-status">{t('yourEstimateTurn')}</p>
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
                  <option value="">Select contract</option>
                  {CONTRACT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
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
      ) : snapshot.nextBidSeat !== undefined ? (
        <p role="status">Waiting for Seat {snapshot.nextBidSeat + 1}</p>
      ) : null}
    </section>
  );
}
