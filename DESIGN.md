---
version: alpha
name: Paply
description: iOS 26/27 Liquid Glass design system — refractive glass UI over a rich, aurora-animated backdrop.

colors:
  # Backgrounds — cool deep foundation for glass refraction
  bg-void: "#0A0C10"
  bg-surface: "#12151C"
  bg-raised: "#1A1F29"

  # Content text — high contrast on void
  content-primary: "#F4F7FB"
  content-secondary: "#AEB7C4"
  content-tertiary: "#6B7585"
  content-ghost: "rgba(244, 247, 251, 0.10)"

  # Accent system — restrained system tint; real color comes from glass refraction
  accent: "#6FA8FF"
  accent-bright: "#9CC4FF"
  accent-secondary: "#7CE0D3"

  # Signal states — semantic colors for feedback
  signal-success: "#5FD0A6"
  signal-warning: "#F2C26B"
  signal-error: "#F2796B"

  # Glow — derived from accent for halos and emphasis
  glow-core: "rgba(111, 168, 255, 0.55)"
  glow-halo: "rgba(111, 168, 255, 0.18)"

  # Glass material — frosted, semi-transparent
  glass-fill: "rgba(255, 255, 255, 0.06)"
  glass-fill-strong: "rgba(255, 255, 255, 0.10)"
  glass-stroke: "rgba(255, 255, 255, 0.14)"
  glass-stroke-bright: "rgba(255, 255, 255, 0.28)"
  glass-specular: "rgba(255, 255, 255, 0.70)"

typography:
  display:
    fontFamily: "SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontWeight: "600"
    lineHeight: "0.95"
    letterSpacing: "-0.02em"
  body:
    fontFamily: "SF Pro Text, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontWeight: "400"
    lineHeight: "1.6"
  mono:
    fontFamily: "SF Mono, ui-monospace, JetBrains Mono, Menlo, monospace"
    fontWeight: "400"
    letterSpacing: "0.02em"

spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  7: "28px"
  8: "32px"
  9: "36px"
  10: "40px"
  11: "44px"
  12: "48px"
  16: "64px"
  24: "96px"
  32: "128px"
  48: "192px"
  64: "256px"
  96: "384px"

rounded:
  subtle: "8px"
  soft: "14px"
  lg: "22px"
  pill: "999px"

components:
  glass:
    backgroundColor: "{colors.glass-fill}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    backdropFilter: "blur(18px) saturate(160%)"
    borderColor: "{colors.glass-stroke}"
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45), inset 1.2px 1.2px 0 rgba(255, 255, 255, 0.25)"
  glass-strong:
    backgroundColor: "{colors.glass-fill-strong}"
    backdropFilter: "blur(30px) saturate(180%)"
    boxShadow: "0 24px 70px rgba(0, 0, 0, 0.55), inset 1.2px 1.2px 0 rgba(255, 255, 255, 0.3)"

  button:
    height: "{spacing.11}"
    padding: "0 {spacing.6}"
    backgroundColor: "{colors.glass-fill}"
    textColor: "{colors.content-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    fontSize: "{text.16}"
    fontWeight: "600"
    transition: "transform 120ms cubic-bezier(.34, 1.56, .64, 1)"

  button-primary:
    backgroundColor: "linear-gradient(180deg, {colors.accent-bright}, {colors.accent})"
    textColor: "#06101f"
    fontWeight: "700"
    boxShadow: "0 8px 24px {colors.glow-halo}, 0 0 36px {colors.glow-halo}"

  button-ghost:
    backgroundColor: "transparent"
    borderColor: "transparent"
    boxShadow: "none"

  button-danger:
    textColor: "{colors.signal-error}"
    backgroundColor: "rgba(242, 121, 107, 0.08)"
    borderColor: "rgba(242, 121, 107, 0.4)"
    boxShadow: "none"

  button-small:
    height: "36px"
    padding: "0 {spacing.4}"
    fontSize: "{text.14}"

  input:
    backgroundColor: "rgba(255, 255, 255, 0.04)"
    textColor: "{colors.content-primary}"
    borderColor: "{colors.glass-stroke}"
    rounded: "{rounded.soft}"
    padding: "{spacing.3} {spacing.4}"
    fontSize: "{text.16}"
    fontFamily: "{typography.body.fontFamily}"
    transition: "border-color 500ms cubic-bezier(.23, .6, .32, .99), box-shadow 500ms cubic-bezier(.23, .6, .32, .99)"

  input-focus:
    borderColor: "{colors.accent}"
    backgroundColor: "rgba(255, 255, 255, 0.06)"
    boxShadow: "0 0 0 1px {colors.accent}, 0 0 22px {colors.glow-halo}"

  chip:
    backgroundColor: "rgba(255, 255, 255, 0.05)"
    textColor: "{colors.content-secondary}"
    borderColor: "{colors.glass-stroke}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
    fontSize: "{text.12}"
    fontWeight: "600"

  chip-accent:
    backgroundColor: "{colors.glow-halo}"
    textColor: "{colors.accent-bright}"
    borderColor: "rgba(111, 168, 255, 0.4)"

  chip-success:
    textColor: "{colors.signal-success}"
    borderColor: "rgba(95, 208, 166, 0.4)"

  chip-warning:
    textColor: "{colors.signal-warning}"
    borderColor: "rgba(242, 194, 107, 0.4)"

  card:
    backgroundColor: "{colors.glass-fill}"
    padding: "{spacing.6}"
    rounded: "{rounded.lg}"

text:
  12: "0.75rem"
  14: "0.875rem"
  16: "1rem"
  18: "1.125rem"
  22: "1.375rem"
  28: "1.75rem"
  36: "2.25rem"
  48: "3rem"
  64: "4rem"
  80: "5rem"
  110: "6.875rem"
  160: "10rem"
  240: "15rem"

duration:
  micro: "120ms"
  micro-exit: "350ms"
  secondary: "500ms"
  primary: "1100ms"
  page: "900ms"

easing:
  standard: "cubic-bezier(.16, 1, .3, 1)"
  emphatic: "cubic-bezier(.34, 1.56, .64, 1)"
  exit: "cubic-bezier(.7, 0, .84, 0)"
  signature: "cubic-bezier(.9, .02, .18, 1)"
  settle: "cubic-bezier(.23, .6, .32, .99)"

---

## Overview

**Paply** uses a liquid glass metaphor over a rich, cool-deep backdrop. The UI refracts an aurora-animated environment, evoking iOS 26/27's frosted aesthetic: sleek, minimal, and material-forward. Every surface is semi-transparent, every shadow is soft, and motion is restrained but deliberate.

The design system is **contrast-first**: white text on deep navy, with a single accent blue (#6FA8FF) and semantic signal colors (success/warning/error). Glass panels blur and desaturate the backdrop, creating depth without visual chaos.

## Colors

### Backgrounds

- **bg-void** (#0A0C10): The deepest foundation — never black, but rich and cool enough for glass to refract. Used as the root background.
- **bg-surface** (#12151C): Slightly raised from void; panels and modals appear here.
- **bg-raised** (#1A1F29): The highest surface layer for elevated content.

### Content & Text

- **content-primary** (#F4F7FB): Main text, ≥7:1 contrast on void. Very high luminance for readability.
- **content-secondary** (#AEB7C4): Secondary text, captions, metadata. ≥4.5:1 on void.
- **content-tertiary** (#6B7585): Disabled text, hints, labels. Only for ≥18px text or decorative use.
- **content-ghost**: Faint decoration; never used for text.

### Accent & Signal

- **accent** (#6FA8FF): Primary interaction color. Used for buttons, links, active states.
- **accent-bright** (#9CC4FF): Lighter accent for gradients and emphasis.
- **accent-secondary** (#7CE0D3): Secondary teal accent, used sparingly for secondary actions.
- **signal-success** (#5FD0A6): Positive feedback — sent, completed, approved.
- **signal-warning** (#F2C26B): Caution — limit reached, action required.
- **signal-error** (#F2796B): Danger — blocked, failed, error.

### Glass & Glow

- **glass-fill**: Semi-transparent white overlay (6% opacity) — base for all glass panels.
- **glass-fill-strong**: Higher opacity (10%) for elevated modals and strong cards.
- **glass-stroke**: Border color for glass panels (14% opacity).
- **glow-core** & **glow-halo**: Derived from accent, used for focus rings and emphasis glows.

## Typography

- **Display**: "SF Pro Display" with -0.02em letter spacing and 0.95 line height. Used for h1–h3 headings.
- **Body**: "SF Pro Text", the primary font for all UI text. 1.6 line height for readability.
- **Mono**: "SF Mono" for code, logs, and monospaced content.

Text sizes range from 12px (captions) to 240px (hero). See the `text` scale in tokens.

## Layout

Spacing uses a 4px base unit (`--space-1`). Common sizes:
- `space-2` (8px): gap between inline elements
- `space-4` (16px): padding in buttons, cards
- `space-6` (24px): padding in panels
- `space-8` (32px): padding in large cards
- `space-16` (64px): vertical section spacing

Borders have soft, rounded corners:
- `radius-subtle` (8px): small inputs, detailed elements
- `radius-soft` (14px): input fields
- `radius-lg` (22px): cards, panels
- `radius-pill` (999px): buttons, chips

## Elevation & Depth

Glass panels achieve depth through:

1. **Backdrop Filter**: `blur(18px) saturate(160%)` for `.glass`; `blur(30px) saturate(180%)` for `.glass-strong`.
2. **Shadows**: Soft, dark shadows. `box-shadow: 0 12px 40px rgba(0,0,0,0.45)` for base glass.
3. **Borders**: 1px border in `glass-stroke` (14% white) to define edges.
4. **Specular Sheen**: `::before` pseudo-element with a subtle white gradient (top-left), `mix-blend-mode: screen`, to simulate light catching the glass edge.

## Animation

- **dur-micro** (120ms): Micro-interactions (button press, hover).
- **dur-micro-exit** (350ms): Slightly slower exit animations.
- **dur-secondary** (500ms): Reveal animations, panel transitions.
- **dur-primary** (1100ms): Page-level transitions.
- **ease-standard** (`cubic-bezier(.16, 1, .3, 1)`): Default ease, snappy and natural.
- **ease-emphatic**: Bouncy ease for delightful interactions.
- **ease-settle**: Relaxed ease for calm, settling motions.

Reduced-motion: All animations are disabled if `prefers-reduced-motion` is set.

## Components

### Glass Panels

All interactive surfaces use `.glass` or `.glass-strong`:
- Buttons, inputs, cards, modals.
- Never a flat color; always frosted and interactive with the backdrop.

### Buttons

- **Default** (`.btn`): Glass fill, white text, pill-shaped. 44px tall, 16px font.
- **Primary** (`.btn-primary`): Blue gradient, dark text (#06101f), glowing shadow. Action button.
- **Ghost** (`.btn-ghost`): Transparent background, no border, no shadow. For secondary actions.
- **Danger** (`.btn-danger`): Error red, transparent background. Destructive actions.
- **Small** (`.btn-sm`): 36px tall, 14px font. For compact layouts.
- **Loading state**: `[data-loading="true"]` shows a sweeping progress bar instead of spinner.

All buttons transition smoothly on hover/active. Focus state: blue ring with glow.

### Inputs

Text inputs (`.input`, `.textarea`, `select`) share a common style:
- Subtle background (4% white opacity).
- Soft border (`radius-soft`).
- Focus: Blue border + blue glow shadow.
- Placeholder: Tertiary text color.

### Chips

Small, inline labels (`.chip`):
- Tight padding (4px 12px), pill-shaped, monospace font.
- Variants: `.chip-accent` (blue glow), `.chip-ok` (green), `.chip-warn` (yellow).

### Cards

Containers with glass styling and consistent padding:
- `.card`: `space-6` padding (24px).
- `.card-pad-lg`: `space-8` padding (32px) for larger cards.

## Shapes

Rounded corners are applied consistently:
- Buttons: `radius-pill` (full rounding).
- Inputs: `radius-soft` (14px, subtle).
- Cards/Panels: `radius-lg` (22px, prominent).

## Do's and Don'ts

### Do:

✓ **Use the glass palette.** Always pull colors from tokens. No hardcoded hex values in new code.

✓ **Respect the glass metaphor.** Semi-transparency, soft shadows, and refraction are core. Don't flatten.

✓ **Use animation sparingly.** Motion should feel intentional, never fussy. Prefer `ease-standard` and `dur-secondary` for most interactions.

✓ **Prioritize text contrast.** `content-primary` on `bg-void` is 7:1; don't weaken it. Use `content-secondary` only where contrast remains ≥4.5:1.

✓ **Stack with Flexbox.** Use `.stack` (flex column), `.row` (flex align-center) for layout. Gaps use spacing tokens.

✓ **Localize text.** All UI text lives in `lib/i18n.ts`. Use the `useT()` hook or `getT()` server function.

### Don't:

✗ **Hardcode colors or sizes.** No `#FFFFFF`, `16px`, `24px` in inline styles unless it's a truly one-off design deviation.

✗ **Mix glass and flat.** Don't put flat color panels next to frosted glass panels in the same section.

✗ **Use outline buttons.** There is no outline variant; use `.btn-ghost` for secondary actions.

✗ **Add more signal colors.** We have 3 (success/warning/error). If you need a 4th, reconsider the hierarchy.

✗ **Disable reduced-motion.** Animation is always respect-motion-aware via `@media (prefers-reduced-motion: reduce)`.

✗ **Over-animate.** A single transform or opacity transition is enough. Avoid stacking multiple animations on the same element.

## Implementation Notes

### CSS Variable Pattern

All design tokens are CSS custom properties (e.g., `var(--content-primary)`). This allows:
- Easy dark/light mode toggling (swap `:root` values).
- Consistent theming across all components.
- Agent-friendly token references in code.

### Glass Rendering

The glass effect is GPU-accelerated:
- `backdrop-filter` with `blur()` and `saturate()`.
- `-webkit-` prefix for Safari support.
- Inset shadows for depth, specular sheen via `::before` pseudo-element.
- No expensive JavaScript or per-frame SVG; the expensive real-refraction lens is isolated to the hero (LiquidLens.tsx).

### Aurora Backdrop

The foundation animates subtly with `.app-aurora::before` and `::after` (blur 55px, very low opacity radial gradients). The animation drifts over 36–44 seconds. This is GPU-cheap and creates a calm, single "atmosphere" feeling.

### Layout Grid

`.container` centers content with a max-width of 1120px. Use `.stack`, `.row`, and gap classes for Flexbox layouts. No external grid library; plain Flexbox + gaps is sufficient.

---

Last updated: June 2026 | Maintained as canonical design reference for Paply.
