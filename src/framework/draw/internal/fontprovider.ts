/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Replacement for src/framework/draw/internal/qfontprovider.cpp
 *
 * The desktop app measures text with Qt (QFontMetricsF) on a virtual paint
 * device of 1200 DPI. Here the same metrics are computed from the font files
 * with opentype.js, so layout is identical in the browser and in node.
 */

import * as opentype from 'opentype.js'
import { PointF, RectF } from '../types/geometry'
import { Font, FontType } from '../types/font'
import { PainterPath } from '../types/painterpath'

/** Same as mu::engraving::DPI */
const ENGRAVING_DPI = 1200
const PPI = 72

interface FaceEntry {
    family: string
    bold: boolean
    italic: boolean
    otf: opentype.Font
    glyphPaths: Map<number, PainterPath>   // in font units, y down
    glyphBBoxes: Map<number, RectF>        // in font units, y down
}

export interface GlyphRun {
    face: FaceEntry
    /** glyph indices */
    glyphs: number[]
    /** x positions of the glyph origins, in pixels of the given font */
    xs: number[]
    /** total advance */
    advance: number
    /** scale: font units -> pixels */
    scale: number
}

function key(family: string): string {
    return family.toLowerCase()
}

export class FontsDatabase {
    private m_faces = new Map<string, FaceEntry[]>()
    private m_aliases = new Map<string, string>()
    private m_defaultTextFamily = 'Edwin'
    private m_defaultSymbolFamily = 'Leland'

    addFont(family: string, data: ArrayBuffer | Uint8Array, opts: { bold?: boolean; italic?: boolean } = {}): void {
        const buffer = data instanceof Uint8Array
            ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
            : data
        const otf = opentype.parse(buffer)
        const entry: FaceEntry = {
            family,
            bold: !!opts.bold,
            italic: !!opts.italic,
            otf,
            glyphPaths: new Map(),
            glyphBBoxes: new Map(),
        }
        const list = this.m_faces.get(key(family)) ?? []
        // replace an existing face with the same style
        const idx = list.findIndex(f => f.bold === entry.bold && f.italic === entry.italic)
        if (idx >= 0) {
            list[idx] = entry
        } else {
            list.push(entry)
        }
        this.m_faces.set(key(family), list)
    }

    hasFamily(family: string): boolean {
        return this.m_faces.has(key(family)) || this.m_aliases.has(key(family))
    }

    /** Maps a font family that is not available to another one */
    addAlias(alias: string, family: string): void {
        this.m_aliases.set(key(alias), family)
    }

    setDefaultTextFamily(family: string): void { this.m_defaultTextFamily = family }
    setDefaultSymbolFamily(family: string): void { this.m_defaultSymbolFamily = family }

    face(font: Font): FaceEntry | null {
        let list = this.m_faces.get(key(font.family()))
        if (!list) {
            const alias = this.m_aliases.get(key(font.family()))
            if (alias) {
                list = this.m_faces.get(key(alias))
            }
        }
        if (!list) {
            const isSymbol = font.type() === FontType.MusicSymbol
            list = this.m_faces.get(key(isSymbol ? this.m_defaultSymbolFamily : this.m_defaultTextFamily))
        }
        if (!list || list.length === 0) {
            return null
        }
        const bold = font.bold()
        const italic = font.italic()
        return list.find(f => f.bold === bold && f.italic === italic)
               ?? list.find(f => f.bold === bold)
               ?? list.find(f => f.italic === italic)
               ?? list.find(f => !f.bold && !f.italic)
               ?? list[0]
    }
}

export class FontProvider {
    constructor(private m_db: FontsDatabase) {}

    database(): FontsDatabase { return this.m_db }

    /** Pixel size at 1200 DPI, as QFont would compute it on the engraving paint device */
    static pixelSize(f: Font): number {
        if (f.pixelSize() > 0) {
            return f.pixelSize()
        }
        return f.pointSizeF() * ENGRAVING_DPI / PPI
    }

    private scale(face: FaceEntry, f: Font): number {
        return FontProvider.pixelSize(f) / face.otf.unitsPerEm
    }

    private hhea(face: FaceEntry): { ascender: number; descender: number; lineGap: number } {
        const h = face.otf.tables.hhea
        if (h && (h.ascender !== 0 || h.descender !== 0)) {
            return h
        }
        const os2 = face.otf.tables.os2
        if (os2) {
            return { ascender: os2.sTypoAscender, descender: os2.sTypoDescender, lineGap: os2.sTypoLineGap }
        }
        return { ascender: face.otf.ascender, descender: face.otf.descender, lineGap: 0 }
    }

    lineSpacing(f: Font): number {
        const face = this.m_db.face(f)
        if (!face) {
            return 0
        }
        const h = this.hhea(face)
        return (h.ascender - h.descender + h.lineGap) * this.scale(face, f)
    }

    xHeight(f: Font): number {
        const face = this.m_db.face(f)
        if (!face) {
            return 0
        }
        const os2 = face.otf.tables.os2
        if (os2 && os2.sxHeight) {
            return os2.sxHeight * this.scale(face, f)
        }
        const r = this.charBBoxUnits(face, 'x'.codePointAt(0)!)
        return r ? r.height() * this.scale(face, f) : 0
    }

    height(f: Font): number {
        return this.ascent(f) + this.descent(f)
    }

    capHeight(f: Font): number {
        const face = this.m_db.face(f)
        if (!face) {
            return 0
        }
        const os2 = face.otf.tables.os2
        if (os2 && os2.sCapHeight) {
            return os2.sCapHeight * this.scale(face, f)
        }
        const r = this.charBBoxUnits(face, 'X'.codePointAt(0)!)
        return r ? r.height() * this.scale(face, f) : 0
    }

    ascent(f: Font): number {
        const face = this.m_db.face(f)
        if (!face) {
            return 0
        }
        return this.hhea(face).ascender * this.scale(face, f)
    }

    descent(f: Font): number {
        const face = this.m_db.face(f)
        if (!face) {
            return 0
        }
        return -this.hhea(face).descender * this.scale(face, f)
    }

    inFont(f: Font, ucs4: number): boolean {
        const face = this.m_db.face(f)
        if (!face) {
            return false
        }
        const idx = face.otf.charToGlyphIndex(String.fromCodePoint(ucs4))
        if (!idx) {
            return false
        }
        // some symbols in fonts dont have glyph (see QFontProvider::inFont)
        const bb = this.glyphBBoxUnits(face, idx)
        return bb.isValid()
    }

    horizontalAdvance(f: Font, text: string | number): number {
        const s = typeof text === 'number' ? String.fromCodePoint(text) : text
        const run = this.glyphRun(f, s)
        return run ? run.advance : 0
    }

    /**
     * For a string: QFontMetricsF::boundingRect(QString), i.e. union of the glyph ink boxes and the origin.
     * For a single code point of a music font: the exact vector bbox of the glyph.
     */
    boundingRect(f: Font, text: string | number): RectF {
        if (typeof text === 'number') {
            const face = this.m_db.face(f)
            if (!face) {
                return new RectF()
            }
            const idx = face.otf.charToGlyphIndex(String.fromCodePoint(text))
            if (!idx) {
                return new RectF()
            }
            const s = this.scale(face, f)
            const bb = this.glyphBBoxUnits(face, idx)
            return new RectF(bb.x() * s, bb.y() * s, bb.width() * s, bb.height() * s)
        }

        const run = this.glyphRun(f, text)
        if (!run) {
            return new RectF()
        }
        let x0 = 0
        let y0 = 0
        let x1 = 0
        let y1 = 0
        for (let i = 0; i < run.glyphs.length; ++i) {
            const bb = this.glyphBBoxUnits(run.face, run.glyphs[i])
            if (!bb.isValid()) {
                continue
            }
            const gx = run.xs[i] + bb.x() * run.scale
            const gy = bb.y() * run.scale
            x0 = Math.min(x0, gx)
            y0 = Math.min(y0, gy)
            x1 = Math.max(x1, gx + bb.width() * run.scale)
            y1 = Math.max(y1, gy + bb.height() * run.scale)
        }
        // logical width at least the advance
        x1 = Math.max(x1, run.advance)
        return new RectF(x0, y0, x1 - x0, y1 - y0)
    }

    /** exact ink bounding box */
    tightBoundingRect(f: Font, text: string | number): RectF {
        const s = typeof text === 'number' ? String.fromCodePoint(text) : text
        const run = this.glyphRun(f, s)
        if (!run) {
            return new RectF()
        }
        let r = new RectF()
        for (let i = 0; i < run.glyphs.length; ++i) {
            const bb = this.glyphBBoxUnits(run.face, run.glyphs[i])
            if (!bb.isValid()) {
                continue
            }
            r = r.united(new RectF(run.xs[i] + bb.x() * run.scale, bb.y() * run.scale,
                bb.width() * run.scale, bb.height() * run.scale))
        }
        return r
    }

    /** Shapes a string: glyph lookup with standard ligatures and pair kerning (like HarfBuzz in Qt would do) */
    glyphRun(f: Font, text: string): GlyphRun | null {
        const face = this.m_db.face(f)
        if (!face) {
            return null
        }
        const scale = this.scale(face, f)
        const otf = face.otf
        const isSymbol = f.type() === FontType.MusicSymbol
        let glyphs: opentype.Glyph[]
        if (isSymbol) {
            glyphs = Array.from(text).map(ch => otf.glyphs.get(otf.charToGlyphIndex(ch)))
        } else {
            try {
                glyphs = otf.stringToGlyphs(text, { features: { liga: true, rlig: true } })
            } catch {
                glyphs = Array.from(text).map(ch => otf.glyphs.get(otf.charToGlyphIndex(ch)))
            }
        }

        let kerningLookups: unknown = null
        if (!isSymbol) {
            try {
                kerningLookups = otf.position.getKerningTables(otf.position.getDefaultScriptName())
            } catch {
                kerningLookups = null
            }
        }

        const xs: number[] = []
        let x = 0
        for (let i = 0; i < glyphs.length; ++i) {
            const g = glyphs[i]
            xs.push(x)
            x += (g.advanceWidth ?? 0) * scale
            if (!isSymbol && i < glyphs.length - 1) {
                let kern = 0
                try {
                    kern = kerningLookups
                        ? otf.position.getKerningValue(kerningLookups, g.index, glyphs[i + 1].index)
                        : otf.getKerningValue(g, glyphs[i + 1])
                } catch {
                    kern = 0
                }
                x += kern * scale
            }
        }
        return { face, glyphs: glyphs.map(g => g.index), xs, advance: x, scale }
    }

    /** Path of a shaped string, with origin at the baseline start, in pixels */
    textPath(f: Font, text: string, pos: PointF = new PointF()): PainterPath {
        const path = new PainterPath()
        const run = this.glyphRun(f, text)
        if (!run) {
            return path
        }
        for (let i = 0; i < run.glyphs.length; ++i) {
            this.appendGlyph(path, run.face, run.glyphs[i], run.scale, pos.x() + run.xs[i], pos.y())
        }
        return path
    }

    /** Path of a single code point (no shaping), in pixels */
    symbolPath(f: Font, ucs4: number, pos: PointF = new PointF()): PainterPath {
        const path = new PainterPath()
        const face = this.m_db.face(f)
        if (!face) {
            return path
        }
        const idx = face.otf.charToGlyphIndex(String.fromCodePoint(ucs4))
        if (!idx) {
            return path
        }
        this.appendGlyph(path, face, idx, this.scale(face, f), pos.x(), pos.y())
        return path
    }

    private appendGlyph(path: PainterPath, face: FaceEntry, glyphIdx: number, scale: number, ox: number, oy: number): void {
        const els = this.glyphPathUnits(face, glyphIdx).elements()
        const pt = (i: number): PointF => new PointF(ox + els[i].x * scale, oy + els[i].y * scale)
        for (let i = 0; i < els.length; ++i) {
            switch (els[i].type) {
            case PainterPath.ElementType.MoveToElement:
                path.moveTo(pt(i))
                break
            case PainterPath.ElementType.LineToElement:
                path.lineTo(pt(i))
                break
            case PainterPath.ElementType.CurveToElement:
                path.cubicTo(pt(i), pt(i + 1), pt(i + 2))
                i += 2
                break
            default:
                break
            }
        }
    }

    // Font-unit cache helpers -------------------------------------------------

    private charBBoxUnits(face: FaceEntry, ucs4: number): RectF | null {
        const idx = face.otf.charToGlyphIndex(String.fromCodePoint(ucs4))
        if (!idx) {
            return null
        }
        return this.glyphBBoxUnits(face, idx)
    }

    glyphBBoxUnits(face: FaceEntry, glyphIdx: number): RectF {
        let bb = face.glyphBBoxes.get(glyphIdx)
        if (!bb) {
            bb = this.glyphPathUnits(face, glyphIdx).boundingRect()
            if (this.glyphPathUnits(face, glyphIdx).isEmpty()) {
                bb = new RectF()
            }
            face.glyphBBoxes.set(glyphIdx, bb)
        }
        return bb
    }

    /** glyph outline in font units, y axis pointing down (like Qt) */
    glyphPathUnits(face: FaceEntry, glyphIdx: number): PainterPath {
        let p = face.glyphPaths.get(glyphIdx)
        if (p) {
            return p
        }
        p = new PainterPath()
        p.setFillRule(PainterPath.FillRule.WindingFill)
        const glyph = face.otf.glyphs.get(glyphIdx)
        let cx = 0
        let cy = 0
        for (const c of glyph?.path?.commands ?? []) {
            switch (c.type) {
            case 'M':
                p.moveTo(c.x!, -c.y!)
                cx = c.x!; cy = c.y!
                break
            case 'L':
                p.lineTo(c.x!, -c.y!)
                cx = c.x!; cy = c.y!
                break
            case 'C':
                p.cubicTo(new PointF(c.x1!, -c.y1!), new PointF(c.x2!, -c.y2!), new PointF(c.x!, -c.y!))
                cx = c.x!; cy = c.y!
                break
            case 'Q': {
                // convert quadratic to cubic
                const c1x = cx + 2 / 3 * (c.x1! - cx)
                const c1y = cy + 2 / 3 * (c.y1! - cy)
                const c2x = c.x! + 2 / 3 * (c.x1! - c.x!)
                const c2y = c.y! + 2 / 3 * (c.y1! - c.y!)
                p.cubicTo(new PointF(c1x, -c1y), new PointF(c2x, -c2y), new PointF(c.x!, -c.y!))
                cx = c.x!; cy = c.y!
                break
            }
            case 'Z':
                p.closeSubpath()
                break
            }
        }
        face.glyphPaths.set(glyphIdx, p)
        return p
    }
}
