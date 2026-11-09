/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { PALETTE } from '@/themes/themes';

/**
 * The FlatForm mark: two layers of branching strips pinned at their nodes,
 * on a dark grey tile. Same drawing as docs/app-icon.svg and the favicon.
 */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden className="logo__mark">
      <rect width="1024" height="1024" rx="228" fill={PALETTE.grey} />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="72">
        <path d="M232 700 L392 520 L392 330 M392 520 L560 590 L700 430 L700 250 M700 430 L820 500" stroke={PALETTE.amber} />
        <path d="M240 380 L430 450 L540 330 M430 450 L470 760 L660 790 M660 790 L800 690" stroke={PALETTE.red} />
      </g>
      <g fill="#f4f1ec">
        <circle cx="392" cy="520" r="34" />
        <circle cx="700" cy="430" r="34" />
        <circle cx="430" cy="450" r="34" />
        <circle cx="660" cy="790" r="34" />
      </g>
    </svg>
  );
}
