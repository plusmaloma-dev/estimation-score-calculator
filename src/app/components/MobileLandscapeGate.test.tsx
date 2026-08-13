import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobilePortraitScoreSheet } from '../mobile/deviceMode.js';
import { MobileLandscapeGate } from './MobileLandscapeGate.js';

vi.mock('../mobile/deviceMode.js', () => ({
  useMobilePortraitScoreSheet: vi.fn(() => false),
}));

const portrait = vi.mocked(useMobilePortraitScoreSheet);

beforeEach(() => portrait.mockReturnValue(false));

describe('MobileLandscapeGate', () => {
  it('shows a blocking rotate message only in mobile portrait', () => {
    portrait.mockReturnValue(true);
    render(<MobileLandscapeGate><p>Score sheet content</p></MobileLandscapeGate>);

    expect(screen.getByRole('dialog', { name: 'Landscape required' })).toBeVisible();
    expect(screen.getByText('Rotate your device to landscape')).toBeInTheDocument();
  });

  it('preserves mounted child state while portrait is entered and left', async () => {
    const user = userEvent.setup();
    const view = render(
      <MobileLandscapeGate>
        <label>Draft <input aria-label="Draft" /></label>
      </MobileLandscapeGate>,
    );
    await user.type(screen.getByLabelText('Draft'), '5');

    portrait.mockReturnValue(true);
    view.rerender(
      <MobileLandscapeGate>
        <label>Draft <input aria-label="Draft" /></label>
      </MobileLandscapeGate>,
    );
    expect(screen.getByLabelText('Draft')).toHaveValue('5');

    portrait.mockReturnValue(false);
    view.rerender(
      <MobileLandscapeGate>
        <label>Draft <input aria-label="Draft" /></label>
      </MobileLandscapeGate>,
    );
    expect(screen.queryByRole('dialog', { name: 'Landscape required' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Draft')).toHaveValue('5');
  });
});
