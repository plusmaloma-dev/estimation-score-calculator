import { useEffect, useState, type FormEvent } from 'react';
import type { EstimationBid } from '../../domain/bid.js';
import type { ContractSuit } from '../../domain/card.js';
import type { GameplayAuctionAction } from '../../gameplay/types.js';
import type { OnlineGameplayRoundSnapshot } from '../../online/gameplay/roundTypes.js';
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

function auctionActionKey(action: GameplayAuctionAction): string { return JSON.stringify(action); }

export function GameplayBidPanel({
  snapshot,
  canSubmit,
  busy,
  onSubmit,
  onSubmitAuctionAction,
}: {
  readonly snapshot: OnlineGameplayRoundSnapshot;
  readonly canSubmit: boolean;
  readonly busy: boolean;
  readonly onSubmit: (bid: EstimationBid) => Promise<void>;
  readonly onSubmitAuctionAction?: (action: GameplayAuctionAction) => Promise<void>;
}) {
  const { t } = useI18n();
  const estimates = snapshot.legalNormalEstimates;
  const auctionActions = snapshot.legalAuctionActions ?? [];
  const [selectedEstimate, setSelectedEstimate] = useState(String(estimates[0] ?? ''));
  const [selectedAuctionAction, setSelectedAuctionAction] = useState(auctionActions[0] === undefined ? '' : auctionActionKey(auctionActions[0].action));
  const isAuction = snapshot.phase === 'auction';
  const isEstimate = snapshot.phase === 'estimate';

  useEffect(() => {
    setSelectedEstimate(String(snapshot.legalNormalEstimates[0] ?? ''));
    setSelectedAuctionAction((snapshot.legalAuctionActions ?? [])[0] === undefined
      ? ''
      : auctionActionKey(snapshot.legalAuctionActions![0]!.action));
  }, [snapshot.legalAuctionActions, snapshot.legalNormalEstimates, snapshot.version]);

  async function submitEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const player = snapshot.players.find((candidate) => candidate.seat === snapshot.viewerSeat);
    const tricks = Number(selectedEstimate);
    if (player === undefined || !Number.isInteger(tricks)) return;
    await onSubmit({ playerId: player.playerId, bidType: 'normal', tricks });
  }

  async function submitAuction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = auctionActions.find((option) => auctionActionKey(option.action) === selectedAuctionAction)?.action;
    if (action === undefined || onSubmitAuctionAction === undefined) return;
    await onSubmitAuctionAction(action);
  }

  function auctionLabel(action: GameplayAuctionAction): string {
    if (action.type === 'pass') return t('pass');
    if (action.type === 'with') return t('with');
    return `${action.tricks} ${t(contractLabelKey(action.trumpSuit))}`;
  }

  return (
    <section className="gameplay-bid-panel" aria-labelledby="round-estimates-heading">
      <div className="gameplay-round-heading">
        <h3 id="round-estimates-heading">{isAuction ? t('auction') : t('estimate')}</h3>
        <span className="rule-chip">{t('version')} {snapshot.version}</span>
      </div>

      {(isAuction || isEstimate) && <GameplayHand ownHand={snapshot.ownHand} mode="read-only" legalCardIds={new Set()} />}

      {isAuction && canSubmit && (
        <form className="gameplay-bid-form" onSubmit={(event) => void submitAuction(event)}>
          <label>
            {t('auction')}
            <select value={selectedAuctionAction} disabled={busy} onChange={(event) => setSelectedAuctionAction(event.target.value)}>
              {auctionActions.map((option) => <option key={auctionActionKey(option.action)} value={auctionActionKey(option.action)}>{auctionLabel(option.action)}</option>)}
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={busy || selectedAuctionAction === '' || onSubmitAuctionAction === undefined}>
            {t('submitAuctionAction')}
          </button>
        </form>
      )}

      {isEstimate && canSubmit && (
        <form className="gameplay-bid-form" onSubmit={(event) => void submitEstimate(event)}>
          <label>
            {t('estimate')}
            <select value={selectedEstimate} disabled={busy} onChange={(event) => setSelectedEstimate(event.target.value)}>
              {estimates.map((estimate) => <option key={estimate} value={estimate}>{estimate}</option>)}
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={busy || selectedEstimate === ''}>{t('submitEstimate')}</button>
        </form>
      )}
    </section>
  );
}
