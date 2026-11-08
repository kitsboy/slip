/**
 * The item marks on the counter tiles.
 *
 * The pretend shop ships six drawn marks instead of emoji — emoji render differently on every
 * device and read as clip-art on a till. A real shop's custom items fall back to their own emoji
 * (that is the shopkeeper's choice) with a plain circle when they set none.
 */
export default function ItemMark({ id, emoji }: { id: string; emoji?: string }) {
  const n = /\d+/.exec(id);
  const stroke = 'currentColor';
  const common = {
    width: 30,
    height: 30,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  // A numeric suffix picks a drawn mark; otherwise the shopkeeper's emoji stands.
  if (n) {
    switch (n[0]) {
      case '1':
        // Espresso — a cup with steam.
        return (
          <svg {...common}>
            <path d="M6 12 H17 V22 a5 5 0 0 1 -5 5 H11 a5 5 0 0 1 -5 -5 Z" />
            <path d="M17 16 a3 3 0 0 0 3-3 V11" />
            <path d="M6 10 c1 -2 3 -2 4 -4" />
          </svg>
        );
      case '2':
        // Flat white — a cup with a leaf on the milk.
        return (
          <svg {...common}>
            <path d="M5 14 H16 V23 a5 5 0 0 1 -5 5 H10 a5 5 0 0 1 -5 -5 Z" />
            <path d="M16 16 a3 3 0 0 0 3-3 V12" />
            <path d="M10 19 v5 m0 0 c-2 -1 0 -3 0 -5" />
          </svg>
        );
      case '3':
        // Croissant — a crescent.
        return (
          <svg {...common}>
            <path d="M25 8 Q19 4 13 9 Q7 14 6 22 Q14 26 21 22 Q28 17 25 8 Z" />
          </svg>
        );
      case '4':
        // Sourdough — a loaf.
        return (
          <svg {...common}>
            <path d="M6 20 M7 12 a12 9 0 0 1 18 0 Z" />
            <path d="M7 12 a12 3 0 0 0 18 0" />
            <path d="M14 14 c1 1 3 1 4 0" />
          </svg>
        );
      case '5':
        // Orange juice — a glass, its straw, a wedge.
        return (
          <svg {...common}>
            <path d="M13 10 c3 2 3 12 0 16 h-4 c-3 -4 -3 -14 0 -16 Z" />
            <path d="M7 8 l5 4 m10 0 l3 2" />
            <path d="M11 12 h-4 v2 h4 Z" />
          </svg>
        );
      case '6':
        // Beans — a coffee bean with its crease.
        return (
          <svg {...common}>
            <ellipse cx="15" cy="16" rx="9" ry="10" transform="rotate(20 15 16)" />
            <path d="M12 10 c3 3 3 9 0 12" />
          </svg>
        );
    }
  }

  return (
    <span aria-hidden className="v2-mark-emoji">
      {emoji || '•'}
    </span>
  );
}
