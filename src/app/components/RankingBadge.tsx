import type { RankTitle } from '../scoreSheet/scoreSheetViewModel.js';

const icons: Record<RankTitle, string> = {
  KING: '♛',
  'Sub-King': '♛',
  'Sub-Kooz': '▬',
  Kooz: '▬',
};

export function RankingBadge({ title }: { readonly title: RankTitle }) {
  const className = `ranking-badge ranking-badge--${title.toLowerCase().replaceAll(' ', '-').replaceAll('_', '-')}`;
  return (
    <span className={className} aria-label={title}>
      <span className="ranking-badge__icon" aria-hidden="true">{icons[title]}</span>
      <span className="ranking-badge__label">{title}</span>
    </span>
  );
}
