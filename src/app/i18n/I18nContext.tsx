import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translations, type Language, type TranslationKey } from './translations.js';

const STORAGE_KEY = 'estimation-language';

interface I18nContextValue {
  readonly language: Language;
  readonly setLanguage: (language: Language) => void;
  readonly t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function loadLanguage(): Language {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'ar' ? 'ar' : 'en';
}

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(loadLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    window.localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key) => translations[language][key],
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (value === undefined) throw new Error('useI18n must be used inside I18nProvider.');
  return value;
}
