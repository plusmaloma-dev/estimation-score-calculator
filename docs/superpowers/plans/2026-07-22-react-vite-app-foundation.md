# React/Vite App Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable, mobile-first React/Vite browser app that defaults to English, switches to Arabic RTL, creates four-player score sheets, persists them in local storage, lists recent sessions, and reopens a selected session.

**Architecture:** Keep the existing framework-neutral scoring and persistence code unchanged. Add a thin React application under `src/app/` that instantiates `LocalStorageScoreSheetRepository` and `BrowserUiShellService`, owns only navigation and draft-form state, and delegates all score-sheet creation and session loading to the existing shell service. This plan intentionally stops at a score-sheet placeholder screen; the live table is implemented by the next plan.

**Tech Stack:** React, React DOM, Vite, TypeScript, Vitest, Testing Library, jsdom, existing Node test suite.

## Global Constraints

- Mobile-first responsive web app.
- English is the default language.
- Arabic is available through an explicit language switch and uses RTL layout.
- Exactly four unique, non-empty player names are required.
- Rule set must be selected before creation and becomes locked after creation.
- Persist sessions through the existing `LocalStorageScoreSheetRepository`.
- Preserve the framework-neutral scoring engine; React must not reproduce scoring formulas.
- Existing Node tests and CI must remain green.
- Use `HOUSE_RULES_V1` and `FEDERATION_2026` from `src/scoring/ruleSets.ts`.
- For this prototype, each player id is the trimmed player name so existing session metadata displays readable names without changing persistence contracts.

---

## File Map

### New files

- `index.html` — Vite HTML entry point.
- `vite.config.ts` — React plugin and Vitest jsdom configuration.
- `tsconfig.app.json` — browser/JSX TypeScript configuration.
- `src/app/main.tsx` — React root bootstrap.
- `src/app/App.tsx` — application composition and screen navigation.
- `src/app/App.css` — mobile-first shell styles.
- `src/app/services.ts` — browser service construction.
- `src/app/routes.ts` — screen identifiers and navigation state.
- `src/app/i18n/types.ts` — locale and translation-key types.
- `src/app/i18n/translations.ts` — English and Arabic dictionaries.
- `src/app/i18n/I18nProvider.tsx` — locale state, translation lookup, and document direction.
- `src/app/components/LanguageSwitch.tsx` — explicit EN/AR control.
- `src/app/screens/HomeScreen.tsx` — recent sessions and new-game action.
- `src/app/screens/NewGameScreen.tsx` — four-player setup and rule-set selection.
- `src/app/screens/ScoreSheetPlaceholderScreen.tsx` — proves a created or reopened session can be displayed.
- `src/app/test/setup.ts` — Testing Library matchers and cleanup.
- `src/app/App.test.tsx` — end-to-end component coverage for the foundation flow.
- `src/app/i18n/I18nProvider.test.tsx` — language and RTL behavior.

### Modified files

- `package.json` — React/Vite dependencies and split core/app scripts.
- `.gitignore` — Vite output and local files if not already ignored.
- `README.md` — local app commands and foundation scope.
- `BACKLOG.md` — mark US-220 foundation slice in progress/completed after verification.
- `PROJECT_LOG.md` — record red/green CI evidence and final PR details.

---

### Task 1: Add the React/Vite Toolchain and a Rendered App Root

**Files:**
- Modify: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.app.json`
- Create: `src/app/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.css`
- Create: `src/app/test/setup.ts`
- Create: `src/app/App.test.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing TypeScript source under `src/` and Node tests under `tests/`.
- Produces: `App(): JSX.Element`, `npm run dev`, `npm run test:app`, and a Vite production build in `dist-app/`.

- [ ] **Step 1: Install runtime and development dependencies**

Run:

```bash
npm install react react-dom
npm install --save-dev vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom
```

Expected: `package.json` and `package-lock.json` include the new dependencies.

- [ ] **Step 2: Replace the scripts block with split core/app commands**

Use this scripts object in `package.json`:

```json
{
  "clean": "node -e \"fs.rmSync('dist', { recursive: true, force: true }); fs.rmSync('dist-app', { recursive: true, force: true })\"",
  "dev": "vite",
  "lint": "npm run typecheck",
  "typecheck:core": "tsc --noEmit",
  "typecheck:app": "tsc -p tsconfig.app.json --noEmit",
  "typecheck": "npm run typecheck:core && npm run typecheck:app",
  "test:core": "node -e \"fs.rmSync('dist', { recursive: true, force: true })\" && tsc --outDir dist && node --test dist/tests/*.test.js",
  "test:app": "vitest run",
  "test": "npm run test:core && npm run test:app",
  "build": "vite build --outDir dist-app",
  "preview": "vite preview",
  "ci": "npm run typecheck && npm test && npm run build"
}
```

- [ ] **Step 3: Add the browser TypeScript configuration**

Create `tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src/app/**/*.ts", "src/app/**/*.tsx", "vite.config.ts"]
}
```

- [ ] **Step 4: Add Vite and Vitest configuration**

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/app/test/setup.ts'],
    include: ['src/app/**/*.test.ts', 'src/app/**/*.test.tsx'],
    css: true,
  },
});
```

- [ ] **Step 5: Add the failing app render test**

Create `src/app/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

Create `src/app/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the Estimation application heading', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Estimation' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the app test to verify red**

Run:

```bash
npm run test:app -- --run src/app/App.test.tsx
```

Expected: FAIL because `src/app/App.tsx` does not exist.

- [ ] **Step 7: Add the minimal app implementation**

Create `src/app/App.tsx`:

```tsx
import './App.css';

export function App(): JSX.Element {
  return (
    <main className="app-shell">
      <h1>Estimation</h1>
    </main>
  );
}
```

Create `src/app/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Application root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Create `index.html`:

```html
<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0d6656" />
    <title>Estimation Score Calculator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

Create `src/app/App.css`:

```css
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #152321;
  background: #f2f5f4;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
select {
  font: inherit;
}

button {
  min-height: 44px;
}

.app-shell {
  width: min(100%, 72rem);
  min-height: 100vh;
  margin: 0 auto;
  padding: 1rem;
}
```

Append to `.gitignore` if missing:

```text
dist-app/
.vite/
```

- [ ] **Step 8: Run verification for Task 1**

Run:

```bash
npm run typecheck
npm run test:app
npm run build
```

Expected: all commands PASS and `dist-app/index.html` exists.

- [ ] **Step 9: Commit Task 1**

```bash
git add package.json package-lock.json index.html vite.config.ts tsconfig.app.json src/app .gitignore
git commit -m "feat: add React Vite application shell"
```

---

### Task 2: Add English/Arabic Internationalization and RTL Direction

**Files:**
- Create: `src/app/i18n/types.ts`
- Create: `src/app/i18n/translations.ts`
- Create: `src/app/i18n/I18nProvider.tsx`
- Create: `src/app/i18n/I18nProvider.test.tsx`
- Create: `src/app/components/LanguageSwitch.tsx`
- Modify: `src/app/main.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `Locale = 'en' | 'ar'`, `useI18n(): { locale, direction, t, setLocale }`, and `<LanguageSwitch />`.
- Locale is stored under `egyptian-estimation:locale` and defaults to `en`.

- [ ] **Step 1: Write the failing direction and translation tests**

Create `src/app/i18n/I18nProvider.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { I18nProvider, useI18n } from './I18nProvider';

function Probe(): JSX.Element {
  const { t } = useI18n();
  return <h1>{t('app.title')}</h1>;
}

describe('I18nProvider', () => {
  it('defaults to English and switches the document to Arabic RTL', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider storage={window.localStorage}>
        <LanguageSwitch />
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Estimation' })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');

    await user.click(screen.getByRole('button', { name: 'العربية' }));

    expect(screen.getByRole('heading', { name: 'إستيميشن' })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
  });
});
```

- [ ] **Step 2: Run the test to verify red**

Run:

```bash
npm run test:app -- --run src/app/i18n/I18nProvider.test.tsx
```

Expected: FAIL because the i18n modules do not exist.

- [ ] **Step 3: Add locale and translation types**

Create `src/app/i18n/types.ts`:

```ts
export type Locale = 'en' | 'ar';

export type TranslationKey =
  | 'app.title'
  | 'language.english'
  | 'language.arabic'
  | 'home.heading'
  | 'home.subtitle'
  | 'home.startNew'
  | 'home.recentGames'
  | 'home.empty'
  | 'home.continue'
  | 'newGame.heading'
  | 'newGame.name'
  | 'newGame.ruleSet'
  | 'newGame.houseRules'
  | 'newGame.federation'
  | 'newGame.player'
  | 'newGame.create'
  | 'common.back'
  | 'scoreSheet.rounds';
```

Create `src/app/i18n/translations.ts`:

```ts
import type { Locale, TranslationKey } from './types';

export const translations: Record<Locale, Record<TranslationKey, string>> = {
  en: {
    'app.title': 'Estimation',
    'language.english': 'English',
    'language.arabic': 'العربية',
    'home.heading': 'Ready for the next game?',
    'home.subtitle': 'Create a score sheet or continue a saved table.',
    'home.startNew': 'Start a new game',
    'home.recentGames': 'Recent games',
    'home.empty': 'No saved games yet.',
    'home.continue': 'Continue game',
    'newGame.heading': 'Set up your table',
    'newGame.name': 'Game name',
    'newGame.ruleSet': 'Scoring rule set',
    'newGame.houseRules': 'House Rules V1',
    'newGame.federation': 'Federation 2026',
    'newGame.player': 'Player',
    'newGame.create': 'Create game',
    'common.back': 'Back',
    'scoreSheet.rounds': 'rounds',
  },
  ar: {
    'app.title': 'إستيميشن',
    'language.english': 'English',
    'language.arabic': 'العربية',
    'home.heading': 'جاهزون للجولة القادمة؟',
    'home.subtitle': 'أنشئ جدول نقاط أو تابع لعبة محفوظة.',
    'home.startNew': 'ابدأ لعبة جديدة',
    'home.recentGames': 'الألعاب الأخيرة',
    'home.empty': 'لا توجد ألعاب محفوظة بعد.',
    'home.continue': 'متابعة اللعبة',
    'newGame.heading': 'إعداد الطاولة',
    'newGame.name': 'اسم اللعبة',
    'newGame.ruleSet': 'نظام احتساب النقاط',
    'newGame.houseRules': 'قواعد المنزل V1',
    'newGame.federation': 'اتحاد 2026',
    'newGame.player': 'اللاعب',
    'newGame.create': 'إنشاء اللعبة',
    'common.back': 'رجوع',
    'scoreSheet.rounds': 'جولات',
  },
};
```

- [ ] **Step 4: Implement provider and language switch**

Create `src/app/i18n/I18nProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { translations } from './translations';
import type { Locale, TranslationKey } from './types';

const STORAGE_KEY = 'egyptian-estimation:locale';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface I18nValue {
  readonly locale: Locale;
  readonly direction: 'ltr' | 'rtl';
  readonly t: (key: TranslationKey) => string;
  readonly setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

export function I18nProvider({ children, storage = window.localStorage }: PropsWithChildren<{ storage?: StorageLike }>): JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(() => storage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'en');
  const direction = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    storage.setItem(STORAGE_KEY, locale);
  }, [direction, locale, storage]);

  const value = useMemo<I18nValue>(() => ({
    locale,
    direction,
    t: (key) => translations[locale][key],
    setLocale: setLocaleState,
  }), [direction, locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (value === undefined) {
    throw new Error('useI18n must be used inside I18nProvider.');
  }
  return value;
}
```

Create `src/app/components/LanguageSwitch.tsx`:

```tsx
import { useI18n } from '../i18n/I18nProvider';

export function LanguageSwitch(): JSX.Element {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="language-switch" aria-label="Language">
      <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>
        {t('language.english')}
      </button>
      <button type="button" aria-pressed={locale === 'ar'} onClick={() => setLocale('ar')}>
        {t('language.arabic')}
      </button>
    </div>
  );
}
```

Modify `src/app/main.tsx` so `<App />` is wrapped in `<I18nProvider>`.

Modify `src/app/App.tsx` to render translated title and `<LanguageSwitch />`.

- [ ] **Step 5: Run Task 2 verification**

Run:

```bash
npm run typecheck:app
npm run test:app -- --run src/app/i18n/I18nProvider.test.tsx src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/app/i18n src/app/components/LanguageSwitch.tsx src/app/main.tsx src/app/App.tsx
git commit -m "feat: add English Arabic app localization"
```

---

### Task 3: Add Browser Services and Session Navigation

**Files:**
- Create: `src/app/services.ts`
- Create: `src/app/routes.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `LocalStorageScoreSheetRepository`, `BrowserUiShellService` from `src/index.ts`.
- Produces: `AppServices`, `createBrowserServices(storage)`, and screen state `{ name: 'home' | 'new-game' | 'score-sheet'; scoreSheetId?: string }`.

- [ ] **Step 1: Extend the app test with navigation expectations**

Add to `src/app/App.test.tsx`:

```tsx
it('opens new game setup from the home screen', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: 'Start a new game' }));

  expect(screen.getByRole('heading', { name: 'Set up your table' })).toBeInTheDocument();
});
```

Add imports:

```tsx
import userEvent from '@testing-library/user-event';
```

- [ ] **Step 2: Run the navigation test to verify red**

Run:

```bash
npm run test:app -- --run src/app/App.test.tsx
```

Expected: FAIL because the home and new-game screens do not exist.

- [ ] **Step 3: Add service construction**

Create `src/app/services.ts`:

```ts
import { BrowserUiShellService, LocalStorageScoreSheetRepository, type ScoreSheetStorageLike } from '../index.js';

export interface AppServices {
  readonly shell: BrowserUiShellService;
}

export function createBrowserServices(storage: ScoreSheetStorageLike = window.localStorage): AppServices {
  const repository = new LocalStorageScoreSheetRepository(storage);
  return { shell: new BrowserUiShellService(repository) };
}
```

Create `src/app/routes.ts`:

```ts
export type AppScreen =
  | { readonly name: 'home' }
  | { readonly name: 'new-game' }
  | { readonly name: 'score-sheet'; readonly scoreSheetId: string };
```

- [ ] **Step 4: Add temporary inline screen navigation in App**

Replace `src/app/App.tsx` with:

```tsx
import { useMemo, useState } from 'react';
import { LanguageSwitch } from './components/LanguageSwitch';
import { useI18n } from './i18n/I18nProvider';
import type { AppScreen } from './routes';
import { createBrowserServices, type AppServices } from './services';
import './App.css';

export function App({ services }: { services?: AppServices }): JSX.Element {
  const resolvedServices = useMemo(() => services ?? createBrowserServices(), [services]);
  const [screen, setScreen] = useState<AppScreen>({ name: 'home' });
  const { t } = useI18n();

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>{t('app.title')}</h1>
        <LanguageSwitch />
      </header>
      {screen.name === 'home' && (
        <section>
          <h2>{t('home.heading')}</h2>
          <p>{t('home.subtitle')}</p>
          <button type="button" onClick={() => setScreen({ name: 'new-game' })}>{t('home.startNew')}</button>
        </section>
      )}
      {screen.name === 'new-game' && (
        <section>
          <h2>{t('newGame.heading')}</h2>
          <button type="button" onClick={() => setScreen({ name: 'home' })}>{t('common.back')}</button>
        </section>
      )}
      {screen.name === 'score-sheet' && <div data-testid="score-sheet-id">{screen.scoreSheetId}</div>}
      <span hidden>{resolvedServices.shell.listScoreSheets().length}</span>
    </main>
  );
}
```

- [ ] **Step 5: Verify and commit Task 3**

Run:

```bash
npm run typecheck:app
npm run test:app -- --run src/app/App.test.tsx
```

Expected: PASS.

Commit:

```bash
git add src/app/services.ts src/app/routes.ts src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: add browser services and app navigation"
```

---

### Task 4: Build the Recent-Session Home Screen

**Files:**
- Create: `src/app/screens/HomeScreen.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/App.css`

**Interfaces:**
- Consumes: `BrowserUiShellService.getSessionHistory()`.
- Produces: `<HomeScreen shell onStartNew onOpenSession />`.

- [ ] **Step 1: Add failing recent-session tests**

Replace the existing foundation test setup with an in-memory service factory in `src/app/App.test.tsx`:

```tsx
import { BrowserUiShellService, InMemoryScoreSheetRepository } from '../index.js';
import type { AppServices } from './services';

function createTestServices(): AppServices {
  return { shell: new BrowserUiShellService(new InMemoryScoreSheetRepository()) };
}
```

Add this test:

```tsx
it('lists and reopens a recent session', async () => {
  const user = userEvent.setup();
  const services = createTestServices();
  const created = services.shell.createScoreSheet({
    name: 'Thursday Table',
    ruleSet: 'FEDERATION_2026',
    players: [
      { id: 'Ahmed', name: 'Ahmed' },
      { id: 'Mona', name: 'Mona' },
      { id: 'Rami', name: 'Rami' },
      { id: 'Dina', name: 'Dina' },
    ],
    nowIso: '2026-07-22T10:00:00.000Z',
  });
  expect(created.valid).toBe(true);

  render(<App services={services} />);

  expect(screen.getByText('Thursday Table')).toBeInTheDocument();
  expect(screen.getByText('Ahmed, Mona, Rami, Dina')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Continue game' }));

  expect(screen.getByRole('heading', { name: 'Thursday Table' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify red**

Run:

```bash
npm run test:app -- --run src/app/App.test.tsx
```

Expected: FAIL because session cards and reopen navigation are not implemented.

- [ ] **Step 3: Implement HomeScreen**

Create `src/app/screens/HomeScreen.tsx`:

```tsx
import type { BrowserUiShellService } from '../../index.js';
import { useI18n } from '../i18n/I18nProvider';

interface HomeScreenProps {
  readonly shell: BrowserUiShellService;
  readonly onStartNew: () => void;
  readonly onOpenSession: (scoreSheetId: string) => void;
}

export function HomeScreen({ shell, onStartNew, onOpenSession }: HomeScreenProps): JSX.Element {
  const { t } = useI18n();
  const sessions = shell.getSessionHistory().sessions;

  return (
    <section className="screen-stack" aria-labelledby="home-heading">
      <div className="hero-block">
        <h2 id="home-heading">{t('home.heading')}</h2>
        <p>{t('home.subtitle')}</p>
      </div>
      <button className="primary-button" type="button" onClick={onStartNew}>{t('home.startNew')}</button>
      <div className="section-heading"><h3>{t('home.recentGames')}</h3></div>
      {sessions.length === 0 ? <p className="empty-state">{t('home.empty')}</p> : sessions.map((session) => (
        <article className="session-card" key={session.id}>
          <div>
            <h4>{session.name}</h4>
            <p>{session.players.join(', ')}</p>
            <p>{session.roundCount} {t('scoreSheet.rounds')} · {session.updatedAtLabel}</p>
          </div>
          <button type="button" onClick={() => onOpenSession(session.id)}>{t('home.continue')}</button>
        </article>
      ))}
    </section>
  );
}
```

Modify `App.tsx` to render `HomeScreen` and route `onOpenSession(id)` to `{ name: 'score-sheet', scoreSheetId: id }`.

- [ ] **Step 4: Add mobile home styles**

Append to `src/app/App.css`:

```css
.app-header,
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.language-switch {
  display: flex;
  gap: 0.35rem;
}

.language-switch button[aria-pressed="true"] {
  background: #dff1ec;
  border-color: #0d6656;
  color: #0d6656;
}

.screen-stack {
  display: grid;
  gap: 1rem;
}

.hero-block h2 {
  margin-bottom: 0.35rem;
  font-size: clamp(1.75rem, 7vw, 2.5rem);
}

.hero-block p,
.session-card p {
  color: #60706c;
}

.primary-button {
  border: 0;
  border-radius: 0.8rem;
  background: #0d6656;
  color: white;
  font-weight: 700;
  padding: 0.8rem 1rem;
}

.session-card {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid #d4ddda;
  border-radius: 1rem;
  background: white;
}

.session-card h4,
.section-heading h3 {
  margin: 0;
}

@media (min-width: 48rem) {
  .session-card {
    grid-template-columns: 1fr auto;
    align-items: center;
  }
}
```

- [ ] **Step 5: Verify and commit Task 4**

Run:

```bash
npm run typecheck:app
npm run test:app -- --run src/app/App.test.tsx
```

Expected: PASS.

Commit:

```bash
git add src/app/screens/HomeScreen.tsx src/app/App.tsx src/app/App.test.tsx src/app/App.css
git commit -m "feat: add recent session home screen"
```

---

### Task 5: Build Four-Player Game Setup and Session Reopen Placeholder

**Files:**
- Create: `src/app/screens/NewGameScreen.tsx`
- Create: `src/app/screens/ScoreSheetPlaceholderScreen.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/App.css`

**Interfaces:**
- Consumes: `BrowserUiShellService.createScoreSheet()` and `.openSession()`.
- Produces: `<NewGameScreen shell onCancel onCreated />` and `<ScoreSheetPlaceholderScreen shell scoreSheetId onBack />`.

- [ ] **Step 1: Add failing game creation tests**

Add to `src/app/App.test.tsx`:

```tsx
it('creates a four-player Federation score sheet and opens it', async () => {
  const user = userEvent.setup();
  const services = createTestServices();
  render(<App services={services} />);

  await user.click(screen.getByRole('button', { name: 'Start a new game' }));
  await user.type(screen.getByLabelText('Game name'), 'Thursday Table');
  await user.click(screen.getByLabelText('Federation 2026'));

  const playerInputs = screen.getAllByLabelText(/Player [1-4]/);
  for (const [index, name] of ['Ahmed', 'Mona', 'Rami', 'Dina'].entries()) {
    await user.type(playerInputs[index], name);
  }

  await user.click(screen.getByRole('button', { name: 'Create game' }));

  expect(screen.getByRole('heading', { name: 'Thursday Table' })).toBeInTheDocument();
  expect(screen.getByText('Federation 2026')).toBeInTheDocument();
  expect(screen.getByText('Ahmed, Mona, Rami, Dina')).toBeInTheDocument();
});

it('shows setup validation errors without creating a session', async () => {
  const user = userEvent.setup();
  const services = createTestServices();
  render(<App services={services} />);

  await user.click(screen.getByRole('button', { name: 'Start a new game' }));
  await user.click(screen.getByRole('button', { name: 'Create game' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Score-sheet name is required.');
  expect(services.shell.getSessionHistory().sessions).toHaveLength(0);
});
```

- [ ] **Step 2: Run the tests to verify red**

Run:

```bash
npm run test:app -- --run src/app/App.test.tsx
```

Expected: FAIL because the setup form and placeholder screen do not exist.

- [ ] **Step 3: Implement NewGameScreen**

Create `src/app/screens/NewGameScreen.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { FEDERATION_2026, HOUSE_RULES_V1, type BrowserUiShellService, type ScoringRuleSetId } from '../../index.js';
import { useI18n } from '../i18n/I18nProvider';

interface NewGameScreenProps {
  readonly shell: BrowserUiShellService;
  readonly onCancel: () => void;
  readonly onCreated: (scoreSheetId: string) => void;
}

export function NewGameScreen({ shell, onCancel, onCreated }: NewGameScreenProps): JSX.Element {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [ruleSet, setRuleSet] = useState<ScoringRuleSetId>(HOUSE_RULES_V1);
  const [players, setPlayers] = useState(['', '', '', '']);
  const [errors, setErrors] = useState<readonly string[]>([]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = shell.createScoreSheet({
      name,
      ruleSet,
      players: players.map((playerName) => ({ id: playerName.trim(), name: playerName.trim() })),
    });
    setErrors(result.errors);
    if (result.valid && result.scoreSheet !== undefined) {
      onCreated(result.scoreSheet.id);
    }
  }

  return (
    <form className="screen-stack setup-form" onSubmit={submit}>
      <div className="screen-title-row">
        <button type="button" onClick={onCancel}>{t('common.back')}</button>
        <h2>{t('newGame.heading')}</h2>
      </div>
      {errors.length > 0 && <div className="error-summary" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
      <label>{t('newGame.name')}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <fieldset>
        <legend>{t('newGame.ruleSet')}</legend>
        <label><input type="radio" name="ruleSet" checked={ruleSet === HOUSE_RULES_V1} onChange={() => setRuleSet(HOUSE_RULES_V1)} />{t('newGame.houseRules')}</label>
        <label><input type="radio" name="ruleSet" checked={ruleSet === FEDERATION_2026} onChange={() => setRuleSet(FEDERATION_2026)} />{t('newGame.federation')}</label>
      </fieldset>
      {players.map((player, index) => (
        <label key={index}>{t('newGame.player')} {index + 1}<input value={player} onChange={(event) => setPlayers((current) => current.map((value, playerIndex) => playerIndex === index ? event.target.value : value))} /></label>
      ))}
      <button className="primary-button" type="submit">{t('newGame.create')}</button>
    </form>
  );
}
```

- [ ] **Step 4: Implement the score-sheet placeholder**

Create `src/app/screens/ScoreSheetPlaceholderScreen.tsx`:

```tsx
import { FEDERATION_2026, type BrowserUiShellService } from '../../index.js';
import { useI18n } from '../i18n/I18nProvider';

interface ScoreSheetPlaceholderScreenProps {
  readonly shell: BrowserUiShellService;
  readonly scoreSheetId: string;
  readonly onBack: () => void;
}

export function ScoreSheetPlaceholderScreen({ shell, scoreSheetId, onBack }: ScoreSheetPlaceholderScreenProps): JSX.Element {
  const { t } = useI18n();
  const session = shell.openSession(scoreSheetId);
  if (!session.valid || session.scoreSheet === undefined) {
    return <div role="alert">{session.errors.join(' ')}</div>;
  }

  const ruleSetLabel = session.scoreSheet.gameInput.ruleSet === FEDERATION_2026 ? t('newGame.federation') : t('newGame.houseRules');

  return (
    <section className="screen-stack">
      <button type="button" onClick={onBack}>{t('common.back')}</button>
      <h2>{session.scoreSheet.name}</h2>
      <p>{ruleSetLabel}</p>
      <p>{session.scoreSheet.playerOrder.join(', ')}</p>
      <p>{session.scoreSheet.roundCount} {t('scoreSheet.rounds')}</p>
    </section>
  );
}
```

Modify `App.tsx` to render `NewGameScreen` and `ScoreSheetPlaceholderScreen`, passing the shell and navigation callbacks.

- [ ] **Step 5: Add setup form styles**

Append to `src/app/App.css`:

```css
.setup-form label,
.setup-form fieldset {
  display: grid;
  gap: 0.4rem;
}

.setup-form input[type="text"],
.setup-form input:not([type]) {
  width: 100%;
  min-height: 44px;
  padding: 0.7rem 0.8rem;
  border: 1px solid #bac8c4;
  border-radius: 0.7rem;
  background: white;
}

.setup-form fieldset {
  border: 1px solid #d4ddda;
  border-radius: 0.8rem;
  background: white;
  padding: 0.9rem;
}

.screen-title-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.error-summary {
  border: 1px solid #b42318;
  border-radius: 0.8rem;
  background: #fff4f2;
  color: #8f1d14;
  padding: 0.75rem;
}

.error-summary p {
  margin: 0.2rem 0;
}
```

- [ ] **Step 6: Run full Task 5 verification**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected:
- Core Node tests PASS.
- App tests PASS.
- Vite production build PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/app/screens src/app/App.tsx src/app/App.test.tsx src/app/App.css
git commit -m "feat: add four player game setup flow"
```

---

### Task 6: Document, Run CI, and Prepare the Foundation PR

**Files:**
- Modify: `README.md`
- Modify: `BACKLOG.md`
- Modify: `PROJECT_LOG.md`

**Interfaces:**
- Produces: documented local workflow and evidence that the foundation slice is ready for review.

- [ ] **Step 1: Add README app commands**

Add a Browser App section:

```markdown
## Browser App

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The first frontend slice supports English/Arabic switching, local recent sessions, four-player setup, rule-set locking, and reopening saved sessions.

Production verification:

```bash
npm run ci
npm run preview
```
```

- [ ] **Step 2: Update backlog state**

Update US-220 to show:

```markdown
### US-220A — React/Vite Application Foundation
Status: **Done**

### US-220B — Live Score Sheet
Status: **Ready**

### US-220C — Round Editing and Completion
Status: **Planned**
```

- [ ] **Step 3: Run final verification**

Run:

```bash
npm ci
npm run ci
```

Expected:
- Typecheck passes for core and app.
- All existing Node tests pass.
- All Vitest component tests pass.
- Vite build succeeds.

- [ ] **Step 4: Commit documentation and tracking**

```bash
git add README.md BACKLOG.md PROJECT_LOG.md
git commit -m "docs: record frontend foundation delivery"
```

- [ ] **Step 5: Open or update the draft pull request**

Use title:

```text
Add React Vite application foundation
```

PR body must include:

```markdown
## Summary
- adds React/Vite app shell
- adds English default and Arabic RTL switch
- adds local-storage recent-session home
- adds four-player game setup and rule-set selection
- adds session reopen placeholder for the next live-table slice

## Verification
- npm run typecheck
- npm test
- npm run build
```

- [ ] **Step 6: Confirm CI and mark ready**

Expected: GitHub Actions `Validate` job passes on Node 22 using `npm run ci`.

---

## Self-Review

### Spec coverage

- Mobile-first browser app: Tasks 1, 4, and 5.
- English default: Task 2.
- Arabic RTL: Task 2.
- Session home: Task 4.
- Four-player setup: Task 5.
- Rule-set selection and lock: Task 5 delegates to existing shell persistence.
- Local storage: Task 3 service construction.
- Reopen session: Tasks 4 and 5.
- Existing engine remains framework-neutral: all tasks import the shell and do not implement scoring.
- Core test regression: Tasks 1, 5, and 6.

### Intentionally deferred to Plan 2

- Live player-column/round-row score table.
- Federation auction entry and all-pass UI.
- Estimate, actual tricks, trump, Risk, With, and O/U entry.
- Ranking badges and cumulative totals.

### Intentionally deferred to Plan 3

- Completed-round edit dialog.
- Manual score overrides and audit metadata.
- Downstream cumulative recalculation.
- Analytics/export override integration.

### Placeholder scan

No `TBD`, `TODO`, “implement later”, or undefined interface placeholders remain.

### Type consistency

- `AppServices.shell` consistently uses `BrowserUiShellService`.
- Route state consistently uses `scoreSheetId`.
- Rule-set constants use `HOUSE_RULES_V1` and `FEDERATION_2026`.
- App tests inject `InMemoryScoreSheetRepository`; production uses `LocalStorageScoreSheetRepository`.
