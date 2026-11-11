# The visual grammar — one page

Everything needed to lay out a new screen so it looks like it was always here. If a screen breaks one of
these lines, it is wrong, whatever it looks like.

## 1. The page

- Width: **one column, 1152px maximum**, centred. Phone: full width, 16px side padding, and the bottom
  tab bar's height plus 24px of clearance at the end of the content.
- The page background is `--v2-bg`. Cards are `--v2-card`. Anything recessed is `--v2-sunk`. Nothing
  else is a surface — no gradients, no glass, no translucent panels over content.
- Vertical rhythm: **4 / 8 / 12 / 16 / 24 / 32**. Between sections use 24; inside a card 8 or 12.

## 2. Type

| What | Size | Weight | Notes |
|---|---|---|---|
| Hero figure (money, a count) | 32px | 700 | tabular numerals, `--v2-ink` |
| Screen title | 20px | 600 | sentence case, never shouted |
| Section label (`eyebrow`) | 11px | 600 | uppercase, 0.08em tracking, `--v2-muted` |
| Body | 14px | 400 | `--v2-ink-2`, line-height 1.5, max 68 characters |
| Fine print | 11–12px | 400 | explanations, ages, raw errors |

Nothing above 18px except the hero and the money. Never use two weights of the same size to mean two
different things.

## 3. Colour, and the permission table

| Token | May appear on |
|---|---|
| `--v2-ink` (paper) | all text, rules, the focus ring |
| `--v2-ink-2` / `--v2-muted` | secondary text, labels, explanation |
| `--v2-acc` / `--v2-chip` (brass) | **one** action per screen, and nothing else |
| `--v2-yours` (rose) | the shop's own name, and a payment the engine actually saw |
| `--v2-good` / `--v2-warn` / `--v2-bad` | state only: a badge, a dot, a line of warning text |

Three rules with no exceptions:

1. **One brass fill per screen.** If a second control wants brass, it is not the primary action.
2. **Rose is a noun, brass is a verb.** Rose names the shop or the payment; brass does the thing.
3. **A colour never carries a meaning alone.** Every state also has a word next to it — "seen on
   chain", "marked paid by you", "simulated".

## 4. The block order of a screen

1. `eyebrow` — where am I.
2. Title — what this is.
3. One sentence — what it does, in plain words, or nothing.
4. The thing itself: the figure, the list, the form.
5. The reason, if something is blocked: what happened, what is safe, what to do — in that order.
6. The next action, at thumb height (48px money path, 44px floor).

A blocked primary stays **focusable** (`aria-disabled`, never `disabled`) so the line explaining it can
be read.

## 5. Components

Use the primitives; do not re-style a panel by hand. `Button` (3×3), `Money`, `Card`, `Input`,
`Select`, `Toggle`, `Chip`, `Badge`, `ItemTile`, `CartLine`, `Keypad`, `QRCard`, `StatusLine`,
`EmptyState`, `Dialog`, `Sheet`, `Notice`, `TabBar`, `DataRow`, `Progress`, `FreshnessRing`,
`Countdown`. Live at **`?gallery=1`** — a workbench, reachable only by typing the query, never linked.

- A QR is sized by its artwork (white box, `svg{width:100%;height:auto}`), never by a fixed square.
- An empty list is a teaching state: one honest line about what would fill it, one action.
- A loading control says what it is waiting for. Silence is not a loading state.

## 6. Motion

- Durations: 120ms (press), 240ms (arrival), 2.2s (a live heartbeat that repeats).
- Easings: `ease-out` for arrival, `cubic-bezier(0.2, 1.4, 0.4, 1)` for a stamp.
- Motion never carries information. If an animation is the only sign something happened, the screen is
  wrong.
- `prefers-reduced-motion` stops every animation and removes transforms; nothing becomes unreadable.

## 7. The honesty layer (frozen — a redesign may not touch it)

- Never print **Paid** unless the engine observed it. `seen` is not `paid`; `submitted` is not
  `confirmed`; a manual confirmation says "marked paid by you".
- Demo money is labelled **simulated** everywhere an amount appears.
- The footer states the version, the build and the count of requests to other servers.
- A blocked action names its blocker. A failure states what happened, what is safe, what to do.

## 8. The check before you say it is done

Open it at 320, 390 and 1440; both themes; keyboard only; and read every number out loud. If a sentence
would embarrass the shop in front of a customer, it is not finished.
