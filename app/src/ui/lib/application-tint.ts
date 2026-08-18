/**
 * The user can pick a color to tint the whole interface with. The tint is not
 * a separate theme: it takes the neutral surfaces of the currently applied
 * theme (white-ish in light mode, gray-ish in dark mode) and gives them the
 * hue of the picked color while keeping their lightness, so light stays light
 * and dark stays dark.
 *
 * It's applied by writing the tinted values as inline custom properties on
 * `<body>`, which wins over both the `:root` (light) and the `body.theme-dark`
 * declarations and is inherited by everything in the app.
 */

/** The key under which the interface tint is persisted in localStorage. */
const applicationTintKey = 'appearance-tint-color'

/** The color the picker starts out on when the interface isn't tinted. */
export const defaultTintColor = '#0366d6'

/**
 * How much color the tint is allowed to add, expressed as sRGB chroma
 * (the distance between the highest and the lowest of the r, g and b
 * channels, 0-1). Picking a vivid color is capped here so that the tint stays
 * a tint; picking a washed out color gives an even subtler result.
 */
const maxTintChroma = 0.12

/**
 * Colors that already carry meaning (the blue of a selected row, the green of
 * an added line, ...) are left alone. Anything below this chroma counts as a
 * neutral surface that the tint may color.
 */
const maxNeutralChroma = 0.15

/**
 * Pure white and pure black can't hold any color at all, so surfaces are
 * nudged just inside those bounds before the hue is applied. This is what
 * makes the white background of the light theme tintable.
 */
const minTintLightness = 0.03
const maxTintLightness = 0.97

/**
 * The CSS variables that make up the neutral chrome of the app. Values are
 * read from the theme at runtime, so this only has to list _which_ surfaces
 * follow the tint, never what they look like.
 *
 * Variables holding an accent or a status color may be listed as well; they're
 * skipped at runtime based on how colorful they already are.
 */
const tintableVariables: ReadonlyArray<string> = [
  // App-wide surfaces
  '--background-color',
  '--base-border',
  '--contrast-border',
  '--base-box-shadow',
  '--shadow-color',
  '--overlay-background-color',

  // Boxes, lists and their borders
  '--box-background-color',
  '--box-alt-background-color',
  '--box-border-color',
  '--box-border-contrast-color',
  '--box-hover-background-color',
  '--box-selected-background-color',
  '--box-selected-border-color',
  '--box-skeleton-background-color',
  '--skeleton-background-gradient',
  '--box-overflow-shadow-background',
  '--box-overflow-shadow-background-two',
  '--no-shadow-top',
  '--no-shadow-bottom',
  '--top-shadow',
  '--bottom-shadow',
  '--list-item-hover-background-color',
  '--list-item-badge-background-color',
  '--list-item-selected-badge-background-color',
  '--list-item-selected-active-badge-background-color',
  '--branch-pill-background-color',

  // Toolbar, title bar, tab bar and app menu
  '--toolbar-background-color',
  '--toolbar-border-color',
  '--toolbar-button-background-color',
  '--toolbar-button-border-color',
  '--toolbar-button-hover-background-color',
  '--toolbar-button-hover-border-color',
  '--toolbar-button-focus-background-color',
  '--toolbar-button-active-background-color',
  '--toolbar-button-active-border-color',
  '--toolbar-badge-background-color',
  '--toolbar-badge-active-background-color',
  '--toolbar-tooltip-background-color',
  '--toolbar-tooltip-shadow-color',
  '--win32-title-bar-background-color',
  '--tab-bar-background-color',
  '--tab-bar-hover-background-color',
  '--tab-bar-count-background-color',
  '--app-menu-pane-background-color',
  '--app-menu-button-hover-background-color',
  '--app-menu-button-active-background-color',

  // Form controls
  '--secondary-button-background',
  '--secondary-button-hover-background',
  '--secondary-button-border-color',
  '--secondary-button-hover-border-color',
  '--secondary-button-focus-border-color',
  '--secondary-button-focus-shadow-color',
  '--input-icon-hover-background-color',
  '--path-segment-background',
  '--path-segment-background-focus',
  '--dialog-progress-background',

  // Diffs (the added/deleted/selected colors are semantic and stay put)
  '--diff-border-color',
  '--diff-gutter-color',
  '--diff-gutter-background-color',
  '--diff-hunk-background-color',
  '--diff-hunk-border-color',
  '--diff-hunk-gutter-color',
  '--diff-hunk-gutter-background-color',
  '--diff-empty-row-background-color',
  '--diff-empty-row-gutter-background-color',
  '--diff-hover-background-color',
  '--diff-hover-border-color',
  '--diff-hover-gutter-color',
  '--md-border-default-color',
  '--md-border-muted-color',

  // Tooltips, toasts and scroll bars
  '--tooltip-background-color',
  '--tooltip-shadow-color',
  '--title-tool-tip-background-color',
  '--title-tool-tip-shadow',
  '--toast-notification-background-color',
  '--scroll-bar-thumb-background-color',
  '--scroll-bar-thumb-background-color-active',
]

/** A color in sRGB, with channels in the 0-255 range and alpha in 0-1. */
export interface IRGBColor {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

/** Matches the hex and rgb()/rgba() colors inside a CSS value. */
const colorTokenRe = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function parseHexColor(value: string): IRGBColor | null {
  const hex = value.slice(1)
  const expand = (c: string) => parseInt(c.length === 1 ? c + c : c, 16)
  const size = hex.length === 3 || hex.length === 4 ? 1 : 2

  if (hex.length !== size * 3 && hex.length !== size * 4) {
    return null
  }

  const channels = []
  for (let i = 0; i < hex.length; i += size) {
    channels.push(expand(hex.substring(i, i + size)))
  }

  if (channels.some(isNaN)) {
    return null
  }

  const [r, g, b, a] = channels

  return { r, g, b, a: a === undefined ? 1 : a / 255 }
}

function parseFunctionalColor(value: string): IRGBColor | null {
  const args = value
    .substring(value.indexOf('(') + 1, value.lastIndexOf(')'))
    .split(/[\s,/]+/)
    .filter(x => x.length > 0)

  if (args.length < 3) {
    return null
  }

  const channels = args.slice(0, 3).map(channel =>
    channel.endsWith('%')
      ? (parseFloat(channel) * 255) / 100
      : parseFloat(channel)
  )

  if (channels.some(isNaN)) {
    return null
  }

  const alpha = args.length > 3 ? parseFloat(args[3]) : 1
  const [r, g, b] = channels

  return { r, g, b, a: isNaN(alpha) ? 1 : alpha }
}

/** Parses a hex or rgb()/rgba() color, returning null for anything else. */
export function parseColor(value: string): IRGBColor | null {
  const trimmed = value.trim()

  if (trimmed.startsWith('#')) {
    return parseHexColor(trimmed)
  }

  if (/^rgba?\(/i.test(trimmed)) {
    return parseFunctionalColor(trimmed)
  }

  return null
}

function formatColor({ r, g, b, a }: IRGBColor): string {
  const channel = (c: number) => clamp(Math.round(c), 0, 255)

  return a >= 1
    ? `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`
    : `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${Math.round(a * 1000) / 1000})`
}

/** How far apart the most and the least intense channel are (0-1). */
function getChroma({ r, g, b }: IRGBColor): number {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255
}

/** The HSL lightness of a color (0-1). */
function getLightness({ r, g, b }: IRGBColor): number {
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255
}

/** The HSL hue of a color, in degrees, or 0 for a gray. */
function getHue({ r, g, b }: IRGBColor): number {
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)

  if (delta === 0) {
    return 0
  }

  const hue =
    max === r
      ? ((g - b) / delta) % 6
      : max === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4

  return (hue * 60 + 360) % 360
}

function hslToRgb(h: number, s: number, l: number, a: number): IRGBColor {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
      ? [x, c, 0]
      : h < 180
      ? [0, c, x]
      : h < 240
      ? [0, x, c]
      : h < 300
      ? [x, 0, c]
      : [c, 0, x]

  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a }
}

/**
 * Gives a neutral surface color the hue of the tint while keeping its
 * lightness (and its alpha), which is what keeps the light theme light and the
 * dark theme dark. Colors that already carry meaning are returned untouched.
 */
export function tintSurfaceColor(base: IRGBColor, tint: IRGBColor): IRGBColor {
  if (getChroma(base) > maxNeutralChroma) {
    return base
  }

  const lightness = clamp(
    getLightness(base),
    minTintLightness,
    maxTintLightness
  )

  // How much chroma HSL can hold at this lightness; near white or near black
  // that's very little, which is exactly the subtlety we're after.
  const availableChroma = 1 - Math.abs(2 * lightness - 1)
  const chroma = Math.min(getChroma(tint), maxTintChroma, availableChroma)

  if (chroma === 0) {
    return base
  }

  return hslToRgb(getHue(tint), chroma / availableChroma, lightness, base.a)
}

/**
 * Tints every color found in a CSS value, so that values made up of more than
 * one color (borders, shadows, gradients) follow the tint as a whole.
 */
export function tintCssValue(value: string, tint: IRGBColor): string {
  return value.replace(colorTokenRe, token => {
    const color = parseColor(token)

    return color === null ? token : formatColor(tintSurfaceColor(color, tint))
  })
}

/** Returns the persisted interface tint, or null when the UI isn't tinted. */
export function getPersistedTint(): string | null {
  const tint = localStorage.getItem(applicationTintKey)

  return tint !== null && parseColor(tint) !== null ? tint : null
}

/** Stores the interface tint, passing null to go back to the plain theme. */
export function setPersistedTint(tint: string | null): void {
  if (tint === null) {
    localStorage.removeItem(applicationTintKey)
  } else {
    localStorage.setItem(applicationTintKey, tint)
  }
}

/** The variables the tint currently overrides, so they can be put back. */
let tintedVariables: ReadonlyArray<string> = []

/**
 * Applies the given tint to the currently active theme, or removes it when
 * given null. Safe to call as often as needed; it always recomputes from the
 * theme's own colors.
 */
export function applyTint(tint: string | null): void {
  const { style } = document.body

  // Start from the untinted theme, both so that the tint is computed from the
  // theme's own colors rather than from an earlier tint and so that clearing
  // the tint puts the theme back.
  for (const name of tintedVariables) {
    style.removeProperty(name)
  }

  tintedVariables = []

  const color = tint === null ? null : parseColor(tint)

  if (color === null) {
    return
  }

  // Read everything before writing anything: variables defined in terms of
  // another variable would otherwise be tinted twice.
  const computed = getComputedStyle(document.body)
  const values = tintableVariables.map(
    name => [name, computed.getPropertyValue(name).trim()] as const
  )

  const tinted = new Array<string>()

  for (const [name, value] of values) {
    if (value.length === 0) {
      continue
    }

    const tintedValue = tintCssValue(value, color)

    if (tintedValue !== value) {
      style.setProperty(name, tintedValue)
      tinted.push(name)
    }
  }

  tintedVariables = tinted
}
