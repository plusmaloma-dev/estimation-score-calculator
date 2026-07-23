import { useEffect, useState } from 'react';

export const COARSE_POINTER_QUERY = '(pointer: coarse)';
export const MOBILE_PORTRAIT_QUERY = '(pointer: coarse) and (orientation: portrait)';

function readMediaQuery(query: string): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMediaQuery(query));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      setMatches(false);
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const update = (event?: MediaQueryListEvent) => {
      setMatches(event?.matches ?? mediaQuery.matches);
    };
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export function useMobileScoreEntry(): boolean {
  return useMediaQuery(COARSE_POINTER_QUERY);
}

export function useMobilePortraitScoreSheet(): boolean {
  return useMediaQuery(MOBILE_PORTRAIT_QUERY);
}
