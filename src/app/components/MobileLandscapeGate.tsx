import type { ReactNode } from 'react';
import { useMobilePortraitScoreSheet } from '../mobile/deviceMode.js';

export function MobileLandscapeGate({ children }: { readonly children: ReactNode }) {
  const portraitBlocked = useMobilePortraitScoreSheet();

  return (
    <div className="mobile-landscape-shell">
      <div
        className="mobile-landscape-content"
        inert={portraitBlocked ? true : undefined}
        aria-hidden={portraitBlocked ? true : undefined}
      >
        {children}
      </div>
      {portraitBlocked && (
        <div
          className="mobile-landscape-gate"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-landscape-title"
        >
          <div className="mobile-landscape-message">
            <span className="mobile-landscape-icon" aria-hidden="true">↻</span>
            <h2 id="mobile-landscape-title">Landscape required</h2>
            <p>Rotate your device to landscape</p>
          </div>
        </div>
      )}
    </div>
  );
}
