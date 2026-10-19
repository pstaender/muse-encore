// Minimal type declarations for the parts of opentype.js 2.x used by this project.

declare module 'opentype.js' {
    export interface PathCommand {
        type: 'M' | 'L' | 'C' | 'Q' | 'Z'
        x?: number
        y?: number
        x1?: number
        y1?: number
        x2?: number
        y2?: number
    }

    export interface BoundingBox {
        x1: number
        y1: number
        x2: number
        y2: number
    }

    export class Path {
        commands: PathCommand[]
        unitsPerEm?: number
        getBoundingBox(): BoundingBox
    }

    export class Glyph {
        index: number
        name?: string
        unicode?: number
        unicodes: number[]
        advanceWidth?: number
        leftSideBearing?: number
        path: Path
        getBoundingBox(): BoundingBox
        getMetrics(): { xMin: number; yMin: number; xMax: number; yMax: number; leftSideBearing: number; rightSideBearing: number }
    }

    export interface GlyphSet {
        get(index: number): Glyph
        length: number
    }

    export interface RenderOptions {
        kerning?: boolean
        features?: Record<string, boolean>
        script?: string
        language?: string
    }

    export interface Position {
        getKerningTables(script?: string, language?: string): unknown
        getKerningValue(kerningLookups: unknown, leftIndex: number, rightIndex: number): number
        getDefaultScriptName(): string
        defaultKerningTables?: unknown
    }

    export class Font {
        unitsPerEm: number
        ascender: number
        descender: number
        glyphs: GlyphSet
        names: Record<string, Record<string, string>>
        tables: {
            hhea?: { ascender: number; descender: number; lineGap: number }
            os2?: {
                sxHeight?: number
                sCapHeight?: number
                sTypoAscender: number
                sTypoDescender: number
                sTypoLineGap: number
                usWinAscent: number
                usWinDescent: number
                fsSelection: number
            }
            head?: { unitsPerEm: number }
            [key: string]: unknown
        }
        position: Position
        charToGlyphIndex(s: string): number
        charToGlyph(c: string): Glyph
        hasChar(c: string): boolean
        stringToGlyphs(s: string, options?: RenderOptions): Glyph[]
        getKerningValue(left: Glyph | number, right: Glyph | number): number
    }

    export function parse(buffer: ArrayBuffer, opt?: Record<string, unknown>): Font
}
