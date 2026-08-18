import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  IRGBColor,
  parseColor,
  tintCssValue,
  tintSurfaceColor,
} from '../../src/ui/lib/application-tint'

const blue = '#0366d6'

/** The HSL lightness (0-1) of a color, mirroring what the tint preserves. */
function lightnessOf({ r, g, b }: IRGBColor) {
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255
}

/** The HSL hue (in degrees) of a color. */
function hueOf({ r, g, b }: IRGBColor) {
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

function parse(value: string): IRGBColor {
  const color = parseColor(value)
  assert.notEqual(color, null, `expected ${value} to parse`)
  return color!
}

describe('parseColor', () => {
  it('parses the color notations the themes are written in', () => {
    assert.deepEqual(parse('#fff'), { r: 255, g: 255, b: 255, a: 1 })
    assert.deepEqual(parse('#24292e'), { r: 36, g: 41, b: 46, a: 1 })
    assert.deepEqual(parse('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 })
    assert.deepEqual(parse('rgba(36, 41, 46, 0.6)'), {
      r: 36,
      g: 41,
      b: 46,
      a: 0.6,
    })
  })

  it('rejects anything that is not a plain color', () => {
    assert.equal(parseColor('transparent'), null)
    assert.equal(parseColor('1px solid'), null)
    assert.equal(parseColor('#12345'), null)
  })
})

describe('tintSurfaceColor', () => {
  it('keeps a light surface light and a dark surface dark', () => {
    const tint = parse(blue)
    const white = tintSurfaceColor(parse('#ffffff'), tint)
    const dark = tintSurfaceColor(parse('#24292e'), tint)

    // White can't hold a hue, so it's nudged just below pure white.
    assert.ok(lightnessOf(white) > 0.96, `${JSON.stringify(white)} is light`)
    assert.ok(Math.abs(lightnessOf(dark) - 41 / 255) < 0.01)
  })

  it('gives neutral surfaces the hue of the tint', () => {
    const tint = parse(blue)

    for (const surface of ['#ffffff', '#f6f8fa', '#24292e', '#1f2428']) {
      const tinted = tintSurfaceColor(parse(surface), tint)
      assert.ok(
        Math.abs(hueOf(tinted) - hueOf(tint)) < 1,
        `${surface} should end up at the tint's hue`
      )
    }
  })

  it('caps how much color a vivid tint adds', () => {
    const chroma = ({ r, g, b }: IRGBColor) =>
      (Math.max(r, g, b) - Math.min(r, g, b)) / 255

    const tinted = tintSurfaceColor(parse('#24292e'), parse('#ff0000'))

    assert.ok(chroma(tinted) <= 0.121, `${JSON.stringify(tinted)} stays subtle`)
  })

  it('leaves colors that carry meaning alone', () => {
    const tint = parse(blue)

    for (const meaningful of ['#28a745', '#d73a49', '#f66a0a']) {
      assert.deepEqual(
        tintSurfaceColor(parse(meaningful), tint),
        parse(meaningful)
      )
    }
  })

  it('does nothing when the picked color is a gray', () => {
    assert.deepEqual(
      tintSurfaceColor(parse('#24292e'), parse('#808080')),
      parse('#24292e')
    )
  })

  it('preserves transparency', () => {
    const tinted = tintSurfaceColor(parse('rgba(27, 31, 35, 0.65)'), parse(blue))

    assert.equal(tinted.a, 0.65)
  })
})

describe('tintCssValue', () => {
  it('tints every color in a composite value', () => {
    const tinted = tintCssValue('1px solid #e1e4e8', parse(blue))

    assert.match(tinted, /^1px solid rgb\(\d+, \d+, \d+\)$/)
    assert.notEqual(tinted, '1px solid #e1e4e8')
  })

  it('tints the stops of a gradient', () => {
    const tinted = tintCssValue(
      'linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgb(255, 255, 255) 90%)',
      parse(blue)
    )

    assert.match(
      tinted,
      /^linear-gradient\(180deg, rgba\(\d+, \d+, \d+, 0\) 0%, rgb\(\d+, \d+, \d+\) 90%\)$/
    )
  })

  it('leaves values without a color untouched', () => {
    assert.equal(tintCssValue('6px', parse(blue)), '6px')
  })
})
