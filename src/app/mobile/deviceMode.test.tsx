import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  COARSE_POINTER_QUERY,
  MOBILE_PORTRAIT_QUERY,
  useMobilePortraitScoreSheet,
  useMobileScoreEntry,
} from './deviceMode.js';

function installMatchMedia(initial: Readonly<Record<string, boolean>>) {
  const matches = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>();

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => {
      const queryListeners = listeners.get(query) ?? new Set();
      listeners.set(query, queryListeners);
      return {
        get matches() {
          return matches.get(query) ?? false;
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          queryListeners.add(listener);
        },
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          queryListeners.delete(listener);
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList;
    }),
  });

  return {
    set(query: string, value: boolean) {
      matches.set(query, value);
      for (const listener of listeners.get(query) ?? []) {
        listener({ matches: value, media: query } as MediaQueryListEvent);
      }
    },
  };
}

function DeviceModeProbe() {
  const mobileEntry = useMobileScoreEntry();
  const portraitGate = useMobilePortraitScoreSheet();
  return <output>{`${mobileEntry}:${portraitGate}`}</output>;
}

describe('mobile device mode', () => {
  it('reports coarse-pointer entry and reacts to portrait changes', () => {
    const media = installMatchMedia({
      [COARSE_POINTER_QUERY]: true,
      [MOBILE_PORTRAIT_QUERY]: true,
    });
    render(<DeviceModeProbe />);

    expect(screen.getByText('true:true')).toBeInTheDocument();
    act(() => media.set(MOBILE_PORTRAIT_QUERY, false));
    expect(screen.getByText('true:false')).toBeInTheDocument();
  });

  it('falls back to desktop mode when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: undefined,
    });
    render(<DeviceModeProbe />);
    expect(screen.getByText('false:false')).toBeInTheDocument();
  });
});
