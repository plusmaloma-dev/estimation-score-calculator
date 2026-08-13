export type GameLifecycleDialogMode = 'round-18' | 'finish' | 'reopen';

export function GameLifecycleDialog({
  mode,
  onCancel,
  onContinue,
  onConfirm,
}: {
  readonly mode: GameLifecycleDialogMode;
  readonly onCancel: () => void;
  readonly onContinue?: () => void;
  readonly onConfirm: () => void;
}) {
  const isReopen = mode === 'reopen';
  const isRound18 = mode === 'round-18';
  const label = isRound18 ? 'Round 18 completed' : isReopen ? 'Reopen game' : 'Finish game';

  return (
    <div className="score-override-backdrop">
      <section
        className="score-override-dialog game-lifecycle-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <header className="score-override-header">
          <div>
            <h3>{label}</h3>
            <p>
              {isReopen
                ? 'Reopening returns this game to In progress so rounds and scores can be changed again.'
                : isRound18
                  ? 'Would you like to finish this game or continue playing?'
                  : 'Completing this game makes it read-only until it is reopened.'}
            </p>
          </div>
          <button type="button" className="dialog-close-button" aria-label="Cancel lifecycle action" onClick={onCancel}>×</button>
        </header>

        <footer className="score-override-actions">
          {isRound18 && onContinue !== undefined ? (
            <button type="button" className="secondary-button" onClick={onContinue}>Continue Playing</button>
          ) : (
            <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          )}
          <button type="button" className="primary-button" onClick={onConfirm}>
            {isReopen ? 'Confirm Reopen' : 'Confirm Finish'}
          </button>
        </footer>
      </section>
    </div>
  );
}
