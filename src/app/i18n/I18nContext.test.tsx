import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from './I18nContext.js';

function LanguageProbe() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div>
      <span>{language}</span>
      <h1>{t('appName')}</h1>
      <button type="button" onClick={() => setLanguage('ar')}>العربية</button>
      <button type="button" onClick={() => setLanguage('en')}>English</button>
    </div>
  );
}

describe('I18nProvider', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults to English and switches the document to Arabic RTL', async () => {
    const user = userEvent.setup();
    render(<I18nProvider><LanguageProbe /></I18nProvider>);

    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(screen.getByRole('heading', { name: 'Estimation' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'العربية' }));

    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { name: 'إستيميشن' })).toBeInTheDocument();
  });
});
