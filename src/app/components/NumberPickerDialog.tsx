import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface NumberPickerDialogProps {
  readonly title: string;
  readonly value?: number;
  readonly suggestedValue?: number;
  readonly max: 12 | 13;
  readonly onSelect: (value: number) => void;
  readonly onClear: () => void;
  readonly onCancel: () => void;
}

export function NumberPickerDialog({
  title,
  value,
  suggestedValue,
  max,
  onSelect,
  onClear,
  onCancel,
}: NumberPickerDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const values = Array.from({ length: max + 1 }, (_, index) => index);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const selected = dialog.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    const suggested = dialog.querySelector<HTMLButtonElement>('.number-picker-value--suggested');
    const firstNumber = dialog.querySelector<HTMLButtonElement>('.number-picker-value');
    (selected ?? suggested ?? firstNumber)?.focus();
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      returnFocusRef.current?.focus();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="number-picker-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section className="number-picker-panel">
        <h3 id={titleId}>{title}</h3>
        <div className="number-picker-grid">
          {values.map((option) => {
            const isSuggested = suggestedValue === option;
            return (
              <button
                key={option}
                className={isSuggested
                  ? 'number-picker-value number-picker-value--suggested'
                  : 'number-picker-value'}
                type="button"
                aria-label={`Choose ${option}${isSuggested ? ', matches estimate' : ''}`}
                aria-pressed={value === option}
                onClick={() => onSelect(option)}
              >
                <span>{option}</span>
                {isSuggested && <small aria-hidden="true">Est.</small>}
              </button>
            );
          })}
        </div>
        <div className="number-picker-actions">
          <button type="button" className="secondary-button" aria-label="Clear value" onClick={onClear}>
            Clear
          </button>
          <button type="button" className="secondary-button" aria-label="Cancel number entry" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </dialog>,
    document.body,
  );
}
