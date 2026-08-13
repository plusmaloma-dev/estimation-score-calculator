# React/Vite App Foundation Execution Notes

These notes are mandatory corrections discovered during the implementation-plan self-review.

## 1. Wrap App tests with I18nProvider

After Task 2, `App` calls `useI18n()`. Every App test must use this helper rather than rendering `<App />` directly:

```tsx
import { render } from '@testing-library/react';
import { I18nProvider } from './i18n/I18nProvider';
import type { AppServices } from './services';

function renderApp(services?: AppServices) {
  return render(
    <I18nProvider storage={window.localStorage}>
      <App services={services} />
    </I18nProvider>,
  );
}
```

Replace all occurrences of:

```tsx
render(<App />);
render(<App services={services} />);
```

with:

```tsx
renderApp();
renderApp(services);
```

`src/app/main.tsx` still wraps production `<App />` in `<I18nProvider>` exactly once.

## 2. Clear local storage between app tests

Use this complete `src/app/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
});
```

This prevents an Arabic locale or persisted score sheet from leaking between tests.

## 3. Execution precedence

Where these notes conflict with `2026-07-22-react-vite-app-foundation.md`, these notes take precedence.
