import { AppProvider, useApp } from './AppContext.js';
import { I18nProvider, useI18n } from './i18n/I18nContext.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { NewGameScreen } from './screens/NewGameScreen.js';
import { ScoreSheetScreen } from './screens/ScoreSheetScreen.js';

function AppContent() {
  const { route, activeScoreSheetId, navigate, services } = useApp();
  const { language, setLanguage, t } = useI18n();

  return (
    <main className="app-shell">
      <header className="app-header">
        <button className="brand-button" type="button" onClick={() => navigate('home')}>
          <span className="brand-mark" aria-hidden="true">♠</span>
          <h1>{t('appName')}</h1>
        </button>
        <div className="language-switch" aria-label="Language">
          <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          <button type="button" aria-pressed={language === 'ar'} onClick={() => setLanguage('ar')}>العربية</button>
        </div>
      </header>

      {route === 'home' && <HomeScreen />}
      {route === 'new-game' && <NewGameScreen />}
      {route === 'score-sheet' && activeScoreSheetId !== undefined && (
        <ScoreSheetScreen scoreSheetId={activeScoreSheetId} shell={services.shell} />
      )}
    </main>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </I18nProvider>
  );
}
