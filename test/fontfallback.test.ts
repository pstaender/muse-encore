// SPDX-License-Identifier: GPL-3.0-only
// Characters missing in the loaded fonts (e.g. CJK text) are measured and drawn with a platform font, like Qt does.
import { afterEach, describe, expect, it } from 'vitest'
import { setFallbackFontEngine, type FallbackFont, type FallbackFontEngine } from '../src/index'
import { fontProvider } from '../src/engraving/infrastructure/engravingcontext'
import { Painter, type IPaintProvider } from '../src/framework/draw/painter'
import { Font, FontType } from '../src/framework/draw/types/font'
import { PointF, RectF } from '../src/framework/draw/types/geometry'
import { initFonts } from './helpers'

/** every character is a square of the font's pixel size */
const squareEngine: FallbackFontEngine = {
    measure: (text: string, font: FallbackFont) => {
        const n = Array.from(text).length
        return { advance: n * font.pixelSize, bbox: new RectF(0, -font.pixelSize * 0.8, n * font.pixelSize, font.pixelSize) }
    },
}

function serif(): Font {
    const f = new Font('FreeSerif', FontType.Text)
    f.setPointSizeF(10)
    return f
}

describe('font fallback', () => {
    afterEach(() => setFallbackFontEngine(null))

    it('measures missing characters with the fallback font', async () => {
        await initFonts()
        setFallbackFontEngine(squareEngine)
        const fp = fontProvider()
        const f = serif()
        const px = 10 * 1200 / 72
        const latin = fp.horizontalAdvance(f, 'arranged')
        expect(fp.horizontalAdvance(f, '抹茶arranged')).toBeCloseTo(latin + 2 * px, 3)
        expect(fp.boundingRect(f, '抹茶').width()).toBeGreaterThanOrEqual(2 * px - 1e-6)

        const fallbacks: Parameters<typeof fp.textPath>[3] = []
        fp.textPath(f, '抹茶arranged', new PointF(100, 0), fallbacks)
        expect(fallbacks).toHaveLength(1)
        expect(fallbacks![0].text).toBe('抹茶')
        expect(fallbacks![0].x).toBe(100)
        expect(fallbacks![0].font.serif).toBe(true) // FreeSerif: serif fallback (Songti on macOS, like MuseScore)
    })

    it('chooses a sans-serif fallback for sans-serif fonts', async () => {
        await initFonts()
        setFallbackFontEngine(squareEngine)
        const f = new Font('FreeSans', FontType.Text)
        f.setPointSizeF(10)
        const fallbacks: Parameters<ReturnType<typeof fontProvider>['textPath']>[3] = []
        fontProvider().textPath(f, '茶', new PointF(), fallbacks)
        expect(fallbacks![0].font.serif).toBe(false)
    })

    it('lets the paint provider draw the fallback text', async () => {
        await initFonts()
        setFallbackFontEngine(squareEngine)
        const drawn: string[] = []
        const provider: IPaintProvider = {
            drawPath: () => {},
            drawPolygon: () => {},
            drawFallbackText: (text) => { drawn.push(text) },
        }
        const p = new Painter(provider, fontProvider())
        p.setFont(serif())
        p.drawText(new PointF(0, 0), 'a抹茶b')
        expect(drawn).toEqual(['抹茶'])
    })

    it('uses the font only without a fallback engine (node)', async () => {
        await initFonts()
        setFallbackFontEngine(null)
        const fallbacks: Parameters<ReturnType<typeof fontProvider>['textPath']>[3] = []
        fontProvider().textPath(serif(), '抹茶', new PointF(), fallbacks)
        expect(fallbacks).toHaveLength(0)
    })
})
