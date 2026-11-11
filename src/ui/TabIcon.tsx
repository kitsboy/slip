/**
 * Tab icons.
 *
 * Five words at 11px have to be read one at a time; a shape is found in peripheral vision while
 * somebody is counting change. These are inline SVG paths — no icon font, no dependency, no request.
 */

import type { ReactNode } from 'react';


const PATHS: Readonly<Record<string, ReactNode>> = {
  sell: (
    <>
      <path d="M5 3h14l1.5 4H3.5L5 3Z" />
      <path d="M4 7v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7" />
      <path d="M9 12h6" />
    </>
  ),
  money: (
    <>
      <path d="M4 13V6a2 2 0 0 1 2-2h10" />
      <path d="M4 13h9l3 3h4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7Z" />
      <path d="M14 4v5" />
    </>
  ),
  books: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h11v18H6a2 2 0 0 1-2-2V5Z" />
      <path d="M8 3v18" />
    </>
  ),
  setup: (
    <>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <path d="M4 17h4" />
      <path d="M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
};

export default function TabIcon({ tab }: { readonly tab: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[tab] ?? PATHS.more}
    </svg>
  );
}
