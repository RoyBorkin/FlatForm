/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { PALETTE } from '@/themes/themes';

/**
 * The FlatForm mark: a flat red facet folding up into an amber one, on a navy
 * tile. Same drawing as docs/app-icon.svg and public/favicon.svg.
 */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="logo__mark">
      <rect width="64" height="64" rx="15" fill={PALETTE.navy} />
      <path d="M11 47 L30 15 L35 51 Z" fill={PALETTE.red} />
      <path d="M30 15 L54 37 L35 51 Z" fill={PALETTE.amber} />
      <path d="M30 15 L35 51" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="3.2 3" />
      <circle cx="30" cy="15" r="3.6" fill="#ffffff" />
    </svg>
  );
}
