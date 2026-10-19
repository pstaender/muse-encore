/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/internal/engravingfont.h/.cpp and engravingfontsprovider.h/.cpp
 *
 * Symbol metrics are computed lazily (C++ computes them for all symbols on load).
 */

import { PointF, RectF, SizeF } from '../../framework/draw/types/geometry'
import { Font, FontHinting, FontType, FontWeight } from '../../framework/draw/types/font'
import type { Painter } from '../../framework/draw/painter'
import { PPI, DPI } from '../types/types'
import { SmuflAnchorId, SymId, type SymIdList } from '../types/symid'
import { SymNames } from '../types/symnames'
import type { PropertyValue } from '../types/propertyvalue'
import { Sid, STYLE_VALUES } from '../style/styledef'
import { fontProvider } from './engravingcontext'
import { Shape } from './shape'
import { Smufl, type SmuflCode } from './smufl'

export function DEFAULT_SMUFL_POINT_SIZE(): number {
    const DEFAULT_SPATIUM = STYLE_VALUES[Sid.spatium].defaultValue as number
    const DEFAULT_SPATIUM_IN_POINT_UNITS = DEFAULT_SPATIUM / DPI * PPI
    return 4 * DEFAULT_SPATIUM_IN_POINT_UNITS // By Smufl spec the spatium is 1/4 of the em
}

class Sym {
    computed = false
    code = 0
    bbox = new RectF()
    shapeWithCutouts: Shape | null = null
    advance = 0.0
    smuflAnchors = new Map<SmuflAnchorId, PointF>()
    subSymbolIds: SymIdList = []

    isValid(): boolean { return this.code !== 0 && this.bbox.isValid() }
    isCompound(): boolean { return this.subSymbolIds.length > 0 }
}

interface GlyphWithAlternates {
    key: string
    alternateKey: string
    alternateSymId: SymId
}

const GLYPHS_WITH_ALTERNATES: GlyphWithAlternates[] = [
    ['4stringTabClef', '4stringTabClefSerif', SymId.fourStringTabClefSerif],
    ['6stringTabClef', '6stringTabClefSerif', SymId.sixStringTabClefSerif],
    ['cClef', 'cClefFrench', SymId.cClefFrench],
    ['cClef', 'cClefFrench20C', SymId.cClefFrench20C],
    ['fClef', 'fClefFrench', SymId.fClefFrench],
    ['fClef', 'fClef19thCentury', SymId.fClef19thCentury],
    ['noteheadBlack', 'noteheadBlackOversized', SymId.noteheadBlack],
    ['noteheadHalf', 'noteheadHalfOversized', SymId.noteheadHalf],
    ['noteheadWhole', 'noteheadWholeOversized', SymId.noteheadWhole],
    ['noteheadDoubleWhole', 'noteheadDoubleWholeOversized', SymId.noteheadDoubleWhole],
    ['noteheadDoubleWholeSquare', 'noteheadDoubleWholeSquareOversized', SymId.noteheadDoubleWholeSquare],
    ['noteheadDoubleWhole', 'noteheadDoubleWholeAlt', SymId.noteheadDoubleWholeAlt],
    ['brace', 'braceSmall', SymId.braceSmall],
    ['brace', 'braceLarge', SymId.braceLarge],
    ['brace', 'braceLarger', SymId.braceLarger],
    ['flag1024thDown', 'flag1024thDownStraight', SymId.flag1024thDownStraight],
    ['flag1024thUp', 'flag1024thUpStraight', SymId.flag1024thUpStraight],
    ['flag128thDown', 'flag128thDownStraight', SymId.flag128thDownStraight],
    ['flag128thUp', 'flag128thUpStraight', SymId.flag128thUpStraight],
    ['flag16thDown', 'flag16thDownStraight', SymId.flag16thDownStraight],
    ['flag16thUp', 'flag16thUpStraight', SymId.flag16thUpStraight],
    ['flag256thDown', 'flag256thDownStraight', SymId.flag256thDownStraight],
    ['flag256thUp', 'flag256thUpStraight', SymId.flag256thUpStraight],
    ['flag32ndDown', 'flag32ndDownStraight', SymId.flag32ndDownStraight],
    ['flag32ndUp', 'flag32ndUpStraight', SymId.flag32ndUpStraight],
    ['flag512thDown', 'flag512thDownStraight', SymId.flag512thDownStraight],
    ['flag512thUp', 'flag512thUpStraight', SymId.flag512thUpStraight],
    ['flag64thDown', 'flag64thDownStraight', SymId.flag64thDownStraight],
    ['flag64thUp', 'flag64thUpStraight', SymId.flag64thUpStraight],
    ['flag8thDown', 'flag8thDownStraight', SymId.flag8thDownStraight],
    ['flag8thUp', 'flag8thUpStraight', SymId.flag8thUpStraight],
    // Time sig variants
    ...([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(n => [
        [`timeSig${n}`, `timeSig${n}Large`, SymId[`timeSig${n}Large` as keyof typeof SymId]],
        [`timeSig${n}`, `timeSig${n}Small`, SymId[`timeSig${n}Small` as keyof typeof SymId]],
        [`timeSig${n}`, `timeSig${n}Narrow`, SymId[`timeSig${n}Narrow` as keyof typeof SymId]],
    ]) as [string, string, SymId][]),
    ['timeSigBracketLeftSmall', 'timeSigBracketLeftSmallLarge', SymId.timeSigBracketLeftSmallLarge],
    ['timeSigBracketLeftSmall', 'timeSigBracketLeftSmallNarrow', SymId.timeSigBracketLeftSmallNarrow],
    ['timeSigBracketRightSmall', 'timeSigBracketRightSmallLarge', SymId.timeSigBracketRightSmallLarge],
    ['timeSigBracketRightSmall', 'timeSigBracketRightSmallNarrow', SymId.timeSigBracketRightSmallNarrow],
    ['timeSigCommon', 'timeSigCommonLarge', SymId.timeSigCommonLarge],
    ['timeSigCommon', 'timeSigCommonNarrow', SymId.timeSigCommonNarrow],
    ['timeSigCutCommon', 'timeSigCutCommonLarge', SymId.timeSigCutCommonLarge],
    ['timeSigCutCommon', 'timeSigCutCommonNarrow', SymId.timeSigCutCommonNarrow],
    ['timeSigPlus', 'timeSigPlusLarge', SymId.timeSigPlusLarge],
    ['timeSigPlus', 'timeSigPlusNarrow', SymId.timeSigPlusNarrow],
    ['timeSigPlusSmall', 'timeSigPlusSmallLarge', SymId.timeSigPlusSmallLarge],
    ['timeSigPlusSmall', 'timeSigPlusSmallNarrow', SymId.timeSigPlusSmallNarrow],
    ['timeSigFractionalSlash', 'timeSigFractionalSlashLarge', SymId.timeSigFractionalSlashLarge],
    ['timeSigFractionalSlash', 'timeSigFractionalSlashNarrow', SymId.timeSigFractionalSlashNarrow],
    ['timeSigEquals', 'timeSigEqualsLarge', SymId.timeSigEqualsLarge],
    ['timeSigEquals', 'timeSigEqualsNarrow', SymId.timeSigEqualsNarrow],
    ['timeSigMinus', 'timeSigMinusLarge', SymId.timeSigMinusLarge],
    ['timeSigMinus', 'timeSigMinusNarrow', SymId.timeSigMinusNarrow],
    ['timeSigMultiply', 'timeSigMultiplyLarge', SymId.timeSigMultiplyLarge],
    ['timeSigMultiply', 'timeSigMultiplyNarrow', SymId.timeSigMultiplyNarrow],
    ['timeSigParensLeftSmall', 'timeSigParensLeftSmallLarge', SymId.timeSigParensLeftSmallLarge],
    ['timeSigParensLeftSmall', 'timeSigParensLeftSmallNarrow', SymId.timeSigParensLeftSmallNarrow],
    ['timeSigParensRightSmall', 'timeSigParensRightSmallLarge', SymId.timeSigParensRightSmallLarge],
    ['timeSigParensRightSmall', 'timeSigParensRightSmallNarrow', SymId.timeSigParensRightSmallNarrow],
    ['timeSigParensLeft', 'timeSigParensLeftLarge', SymId.timeSigParensLeftLarge],
    ['timeSigParensLeft', 'timeSigParensLeftNarrow', SymId.timeSigParensLeftNarrow],
    ['timeSigParensRight', 'timeSigParensRightLarge', SymId.timeSigParensRightLarge],
    ['timeSigParensRight', 'timeSigParensRightNarrow', SymId.timeSigParensRightNarrow],
    ['timeSigCommaEquals', 'timeSigCommaEqualsLarge', SymId.timeSigCommaEqualsLarge],
    ['timeSigCommaEquals', 'timeSigCommaEqualsNarrow', SymId.timeSigCommaEqualsNarrow],
    ['timeSigFractionQuarter', 'timeSigFractionQuarterLarge', SymId.timeSigFractionQuarterLarge],
    ['timeSigFractionQuarter', 'timeSigFractionQuarterNarrow', SymId.timeSigFractionQuarterNarrow],
    ['timeSigFractionHalf', 'timeSigFractionHalfLarge', SymId.timeSigFractionHalfLarge],
    ['timeSigFractionHalf', 'timeSigFractionHalfNarrow', SymId.timeSigFractionHalfNarrow],
    ['timeSigFractionThreeQuarters', 'timeSigFractionThreeQuartersLarge', SymId.timeSigFractionThreeQuartersLarge],
    ['timeSigFractionThreeQuarters', 'timeSigFractionThreeQuartersNarrow', SymId.timeSigFractionThreeQuartersNarrow],
    ['timeSigFractionOneThird', 'timeSigFractionOneThirdLarge', SymId.timeSigFractionOneThirdLarge],
    ['timeSigFractionOneThird', 'timeSigFractionOneThirdNarrow', SymId.timeSigFractionOneThirdNarrow],
    ['timeSigFractionTwoThirds', 'timeSigFractionTwoThirdsLarge', SymId.timeSigFractionTwoThirdsLarge],
    ['timeSigFractionTwoThirds', 'timeSigFractionTwoThirdsNarrow', SymId.timeSigFractionTwoThirdsNarrow],
    ['timeSigX', 'timeSigXLarge', SymId.timeSigXLarge],
    ['timeSigX', 'timeSigXNarrow', SymId.timeSigXNarrow],
    ['timeSigOpenPenderecki', 'timeSigOpenPendereckiLarge', SymId.timeSigOpenPendereckiLarge],
    ['timeSigOpenPenderecki', 'timeSigOpenPendereckiNarrow', SymId.timeSigOpenPendereckiNarrow],
    ['timeSigCut2', 'timeSigCut2Large', SymId.timeSigCut2Large],
    ['timeSigCut2', 'timeSigCut2Narrow', SymId.timeSigCut2Narrow],
    ['timeSigCut3', 'timeSigCut3Large', SymId.timeSigCut3Large],
    ['timeSigCut3', 'timeSigCut3Narrow', SymId.timeSigCut3Narrow],
].map(([key, alternateKey, alternateSymId]) => ({ key, alternateKey, alternateSymId } as GlyphWithAlternates))

const COMPOSED_GLYPHS: { id: SymId; subSymbolIds: SymIdList }[] = [
    { id: SymId.ornamentPrallMordent, subSymbolIds: [
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentMiddleVerticalStroke,
        SymId.ornamentZigZagLineWithRightEnd,
    ] },
    { id: SymId.ornamentUpPrall, subSymbolIds: [
        SymId.ornamentBottomLeftConcaveStroke,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentZigZagLineWithRightEnd,
    ] },
    { id: SymId.ornamentUpMordent, subSymbolIds: [
        SymId.ornamentBottomLeftConcaveStroke,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentMiddleVerticalStroke,
        SymId.ornamentZigZagLineWithRightEnd,
    ] },
    { id: SymId.ornamentPrallDown, subSymbolIds: [
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentBottomRightConcaveStroke,
    ] },
    { id: SymId.ornamentDownMordent, subSymbolIds: [
        SymId.ornamentLeftVerticalStroke,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentMiddleVerticalStroke,
        SymId.ornamentZigZagLineWithRightEnd,
    ] },
    { id: SymId.ornamentPrallUp, subSymbolIds: [
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentTopRightConvexStroke,
    ] },
    { id: SymId.ornamentLinePrall, subSymbolIds: [
        SymId.ornamentLeftVerticalStroke,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentZigZagLineNoRightEnd,
        SymId.ornamentZigZagLineWithRightEnd,
    ] },
]

const SMUFL_ANCHOR_ID_NAMES: Record<string, SmuflAnchorId> = {
    stemDownNW: SmuflAnchorId.stemDownNW,
    stemUpSE: SmuflAnchorId.stemUpSE,
    stemDownSW: SmuflAnchorId.stemDownSW,
    stemUpNW: SmuflAnchorId.stemUpNW,
    cutOutNE: SmuflAnchorId.cutOutNE,
    cutOutNW: SmuflAnchorId.cutOutNW,
    cutOutSE: SmuflAnchorId.cutOutSE,
    cutOutSW: SmuflAnchorId.cutOutSW,
    opticalCenter: SmuflAnchorId.opticalCenter,
}

// https://w3c.github.io/smufl/latest/specification/engravingdefaults.html
const ENGRAVING_DEFAULTS_MAPPING: Record<string, { sids: Sid[]; childKeys?: string[] }> = {
    staffLineThickness: { sids: [Sid.staffLineWidth] },
    stemThickness: { sids: [Sid.stemWidth] },
    beamThickness: { sids: [Sid.beamWidth] },
    legerLineThickness: { sids: [Sid.ledgerLineWidth] },
    legerLineExtension: { sids: [Sid.ledgerLineLength] },
    slurEndpointThickness: { sids: [Sid.slurEndWidth] },
    slurMidpointThickness: { sids: [Sid.slurMidWidth] },
    tieEndpointThickness: { sids: [Sid.tieEndWidth] },
    tieMidpointThickness: { sids: [Sid.tieMidWidth] },
    thinBarlineThickness: { sids: [Sid.barWidth, Sid.doubleBarWidth] },
    thickBarlineThickness: { sids: [Sid.endBarWidth] },
    barlineSeparation: { sids: [Sid.doubleBarDistance], childKeys: ['thinThickBarlineSeparation'] },
    thinThickBarlineSeparation: { sids: [Sid.endBarDistance] },
    repeatBarlineDotSeparation: { sids: [Sid.repeatBarlineDotSeparation] },
    bracketThickness: { sids: [Sid.bracketWidth] },
    hairpinThickness: { sids: [Sid.hairpinLineWidth] },
    octaveLineThickness: { sids: [Sid.ottavaLineWidth] },
    pedalLineThickness: { sids: [Sid.pedalLineWidth] },
    repeatEndingLineThickness: { sids: [Sid.voltaLineWidth] },
    lyricLineThickness: { sids: [Sid.lyricsLineThickness] },
    tupletBracketThickness: { sids: [Sid.tupletBracketWidth] },
    hBarThickness: { sids: [Sid.mmRestHBarThickness] },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

export class EngravingFont {
    private m_loaded = false
    private m_symbols: Sym[] = []
    private m_font = new Font()
    private m_engravingDefaults = new Map<Sid, PropertyValue>()
    private m_textEnclosureThickness = 0

    constructor(private m_name: string, private m_family: string, private m_metadata: Json,
        private m_provider: EngravingFontsProvider) {}

    name(): string { return this.m_name }
    family(): string { return this.m_family }
    engravingDefaults(): Map<Sid, PropertyValue> { return this.m_engravingDefaults }
    textEnclosureThickness(): number { return this.m_textEnclosureThickness }

    ensureLoad(): void {
        if (this.m_loaded) {
            return
        }
        this.m_font.setWeight(FontWeight.Normal)
        this.m_font.setItalic(false)
        this.m_font.setFamily(this.m_family, FontType.MusicSymbol)
        this.m_font.setNoFontMerging(true)
        this.m_font.setHinting(FontHinting.PreferVerticalHinting)
        this.m_font.setPointSizeF(DEFAULT_SMUFL_POINT_SIZE())

        this.m_symbols = []
        for (let i = 0; i <= SymId.lastSym; ++i) {
            this.m_symbols.push(new Sym())
        }

        const metadata = this.m_metadata ?? {}
        this.loadGlyphsWithAnchors(metadata.glyphsWithAnchors)
        this.loadComposedGlyphs()
        this.loadStylisticAlternates(metadata.glyphsWithAlternates)
        this.loadEngravingDefaults(metadata.engravingDefaults)

        this.m_loaded = true
    }

    /** lazy replacement of the loop over all symbols in C++ ensureLoad() */
    private sym(id: SymId): Sym {
        const s = this.m_symbols[id]
        if (!s.computed) {
            s.computed = true
            if (!s.isCompound() && s.code === 0) {
                const code = Smufl.code(id)
                if (Smufl.isValid(code)) {
                    this.computeMetrics(s, code)
                }
            }
        }
        return s
    }

    private loadComposedGlyphs(): void {
        for (const c of COMPOSED_GLYPHS) {
            const sym = this.sym(c.id)
            if (!sym.isValid()) {
                sym.subSymbolIds = c.subSymbolIds
                sym.bbox = this.bboxList(c.subSymbolIds, 1.0)
            }
        }
    }

    private loadStylisticAlternates(glyphsWithAlternatesObject: Json): void {
        if (!glyphsWithAlternatesObject) {
            return
        }
        for (const glyph of GLYPHS_WITH_ALTERNATES) {
            const entry = glyphsWithAlternatesObject[glyph.key]
            if (!entry) {
                continue
            }
            const alternatesArray: Json[] = entry.alternates ?? []
            const val = alternatesArray.find(v => v.name === glyph.alternateKey)
            if (!val) {
                continue
            }
            // metrics of the standard code point first (computed eagerly in C++)
            const sym = this.sym(glyph.alternateSymId)
            const code: SmuflCode = { smuflCode: 0, musicSymBlockCode: 0 }
            if (typeof val.codepoint === 'string') {
                code.smuflCode = parseInt(val.codepoint.slice(2), 16) || 0
            }
            if (typeof val.alternateCodepoint === 'string') {
                code.musicSymBlockCode = parseInt(val.alternateCodepoint.slice(2), 16) || 0
            }
            if (code.smuflCode || code.musicSymBlockCode) {
                this.computeMetrics(sym, code)
            }
        }
    }

    private loadGlyphsWithAnchors(glyphsWithAnchors: Json): void {
        if (!glyphsWithAnchors) {
            return
        }
        const defaultSpatium = STYLE_VALUES[Sid.spatium].defaultValue as number
        for (const symName of Object.keys(glyphsWithAnchors)) {
            let symId = SymNames.symIdByName(symName)
            if (symId === SymId.noSym) {
                const alt = GLYPHS_WITH_ALTERNATES.find(a => a.alternateKey === symName)
                if (alt) {
                    symId = alt.alternateSymId
                }
            }
            if (symId === SymId.noSym) {
                continue
            }
            const sym = this.m_symbols[symId]
            const anchors = glyphsWithAnchors[symName]
            if (!anchors) {
                continue
            }
            for (const anchorId of Object.keys(anchors)) {
                const id = SMUFL_ANCHOR_ID_NAMES[anchorId]
                if (id === undefined) {
                    continue
                }
                const arr = anchors[anchorId]
                sym.smuflAnchors.set(id, new PointF(arr[0], -arr[1]).times(defaultSpatium))
            }
        }
    }

    private loadEngravingDefaults(engravingDefaultsObject: Json): void {
        if (!engravingDefaultsObject) {
            return
        }
        const applyEngravingDefault = (key: string, value: number): void => {
            const search = ENGRAVING_DEFAULTS_MAPPING[key]
            if (!search) {
                return
            }
            for (const sid of search.sids) {
                if (!this.m_engravingDefaults.has(sid)) {
                    this.m_engravingDefaults.set(sid, value)
                }
            }
            for (const childKey of search.childKeys ?? []) {
                if (!(childKey in engravingDefaultsObject)) {
                    applyEngravingDefault(childKey, value)
                }
            }
        }
        for (const key of Object.keys(engravingDefaultsObject)) {
            if (key === 'textEnclosureThickness') {
                this.m_textEnclosureThickness = Number(engravingDefaultsObject[key])
                continue
            }
            if (key === 'beamSpacing') {
                if (!this.m_engravingDefaults.has(Sid.useWideBeams)) {
                    this.m_engravingDefaults.set(Sid.useWideBeams, Number(engravingDefaultsObject[key]) > 0.75)
                }
                continue
            }
            if (typeof engravingDefaultsObject[key] === 'number') {
                applyEngravingDefault(key, engravingDefaultsObject[key])
            }
        }
        if (!this.m_engravingDefaults.has(Sid.musicalTextFont)) {
            this.m_engravingDefaults.set(Sid.musicalTextFont, `${this.m_family} Text`)
        }
    }

    private computeMetrics(sym: Sym, code: SmuflCode): void {
        const fp = fontProvider()
        if (code.smuflCode && fp.inFont(this.m_font, code.smuflCode)) {
            sym.code = code.smuflCode
        } else if (code.musicSymBlockCode && fp.inFont(this.m_font, code.musicSymBlockCode)) {
            sym.code = code.musicSymBlockCode
        }
        if (sym.code > 0) {
            sym.bbox = fp.boundingRect(this.m_font, sym.code)
            sym.advance = fp.horizontalAdvance(this.m_font, sym.code)
        }
    }

    // Symbol properties

    symCode(id: SymId): number {
        const s = this.sym(id)
        if (s.isValid()) {
            return s.code
        }
        // fallback: search in the common SMuFL table
        return Smufl.smuflCode(id)
    }

    fromCode(code: number): SymId {
        for (let i = 0; i < this.m_symbols.length; ++i) {
            if (this.sym(i as SymId).code === code) {
                return i as SymId
            }
        }
        return SymId.noSym
    }

    toString(id: SymId): string {
        return String.fromCodePoint(this.symCode(id))
    }

    isValid(id: SymId): boolean {
        return this.sym(id).isValid()
    }

    private useFallbackFont(id: SymId): boolean {
        return !this.sym(id).isValid() && !this.m_provider.isFallbackFont(this)
    }

    // Symbol bounding box

    bbox(id: SymId, mag: number | SizeF): RectF {
        const m = typeof mag === 'number' ? new SizeF(mag, mag) : mag
        if (this.useFallbackFont(id)) {
            return this.m_provider.fallbackFont().bbox(id, m)
        }
        return this.sym(id).bbox.scaled(m)
    }

    bboxList(s: SymIdList, mag: number | SizeF): RectF {
        const m = typeof mag === 'number' ? new SizeF(mag, mag) : mag
        let r = new RectF()
        let x = 0
        for (const id of s) {
            r = r.united(this.bbox(id, m).translated(x, 0))
            x += this.advance(id, m.width())
        }
        return r
    }

    shape(s: SymIdList, mag: number | SizeF): Shape {
        const m = typeof mag === 'number' ? new SizeF(mag, mag) : mag
        const sh = new Shape()
        let x = 0
        for (const id of s) {
            sh.add(new Shape(this.bbox(id, m)).translate(new PointF(x, 0)))
            x += this.advance(id, m.width())
        }
        return sh
    }

    shapeWithCutouts(id: SymId, mag: number | SizeF): Shape {
        const m = typeof mag === 'number' ? new SizeF(mag, mag) : mag
        const sym = this.sym(id)
        if (!sym.shapeWithCutouts || sym.shapeWithCutouts.empty()) {
            sym.shapeWithCutouts = this.constructShapeWithCutouts(id)
        }
        return sym.shapeWithCutouts.scaled(m)
    }

    private constructShapeWithCutouts(id: SymId): Shape {
        const boundingBox = this.bbox(id, 1.0)
        const bottom = boundingBox.bottom()
        const top = boundingBox.top()
        const left = boundingBox.left()
        const right = boundingBox.right()

        let cutOutNW = this.smuflAnchor(id, SmuflAnchorId.cutOutNW, 1.0)
        let cutOutNE = this.smuflAnchor(id, SmuflAnchorId.cutOutNE, 1.0)
        let cutOutSW = this.smuflAnchor(id, SmuflAnchorId.cutOutSW, 1.0)
        let cutOutSE = this.smuflAnchor(id, SmuflAnchorId.cutOutSE, 1.0)

        const nwNull = cutOutNW.isNull()
        const neNull = cutOutNE.isNull()
        const swNull = cutOutSW.isNull()
        const seNull = cutOutSE.isNull()

        if (nwNull && neNull && swNull && seNull) {
            return new Shape(this.bbox(id, 1.0))
        }

        if (nwNull) {
            cutOutNW = new PointF(left, top)
        }
        if (neNull) {
            cutOutNE = new PointF(right, top)
        }
        if (swNull) {
            cutOutSW = new PointF(left, bottom)
        }
        if (seNull) {
            cutOutSE = new PointF(right, bottom)
        }

        const leftInset = Math.max(cutOutNW.x(), cutOutSW.x())
        const rightInset = Math.min(cutOutNE.x(), cutOutSE.x())
        const topInset = Math.max(cutOutNW.y(), cutOutNE.y())
        const bottomInset = Math.min(cutOutSW.y(), cutOutSE.y())

        const rects: RectF[] = []
        // bottom rect
        rects.push(RectF.fromPoints(new PointF(cutOutSW.x(), bottom), new PointF(cutOutSE.x(), topInset)).normalized())

        // right rect
        let rightRectPlaced = false
        if (!seNull) {
            rects.push(RectF.fromPoints(new PointF(right, cutOutSE.y()), new PointF(leftInset, cutOutNE.y())).normalized())
            rightRectPlaced = true
        }

        // top rect
        let topRectPlaced = false
        if (!rightRectPlaced || !neNull) {
            rects.push(RectF.fromPoints(new PointF(cutOutNW.x(), top), new PointF(cutOutNE.x(), bottomInset)).normalized())
            topRectPlaced = true
        }

        // left rect
        if (!topRectPlaced || !nwNull) {
            rects.push(RectF.fromPoints(new PointF(left, cutOutSW.y()), new PointF(rightInset, cutOutNW.y())).normalized())
        }

        // center horizontal rect if needed
        if (leftInset > rightInset && topInset < bottomInset) {
            rects.push(RectF.fromPoints(new PointF(left, bottomInset), new PointF(right, topInset)).normalized())
        }

        // center vertical rect if needed
        if (leftInset < rightInset && topInset > bottomInset) {
            rects.push(RectF.fromPoints(new PointF(leftInset, bottom), new PointF(rightInset, top)).normalized())
        }

        return new Shape(rects)
    }

    // Symbol metrics

    width(id: SymId, mag: number): number { return this.bbox(id, mag).width() }
    height(id: SymId, mag: number): number { return this.bbox(id, mag).height() }

    advance(id: SymId, mag: number): number {
        if (this.useFallbackFont(id)) {
            return this.m_provider.fallbackFont().advance(id, mag)
        }
        return this.sym(id).advance * mag
    }

    widthList(s: SymIdList, mag: number): number { return this.bboxList(s, mag).width() }

    smuflAnchor(symId: SymId, anchorId: SmuflAnchorId, mag: number): PointF {
        if (this.useFallbackFont(symId)) {
            return this.m_provider.fallbackFont().smuflAnchor(symId, anchorId, mag)
        }
        const p = this.sym(symId).smuflAnchors.get(anchorId)
        return p ? p.times(mag) : new PointF()
    }

    // Draw

    draw(id: SymId, painter: Painter, mag: number | SizeF, pos: PointF, angle = 0): void {
        const m = typeof mag === 'number' ? new SizeF(mag, mag) : mag
        const sym = this.sym(id)
        if (sym.isCompound()) { // is this a compound symbol?
            this.drawList(sym.subSymbolIds, painter, m, pos, angle)
            return
        }
        if (!sym.isValid()) {
            if (!this.m_provider.isFallbackFont(this)) {
                this.m_provider.fallbackFont().draw(id, painter, m, pos, angle)
            }
            return
        }
        painter.save()
        this.m_font.setPointSizeF(DEFAULT_SMUFL_POINT_SIZE())
        painter.scale(m.width(), m.height())
        painter.setFont(this.m_font)
        if (angle !== 0) {
            const w = sym.bbox.width() / 2
            const h = sym.bbox.height() / 2
            painter.translate(w, -h)
            painter.rotate(angle)
            painter.translate(-w, h)
        }
        painter.drawSymbol(new PointF(pos.x() / m.width(), pos.y() / m.height()), this.symCode(id))
        painter.restore()
    }

    drawList(ids: SymIdList, painter: Painter, mag: number | SizeF, startPos: PointF, angle = 0): void {
        const m = typeof mag === 'number' ? new SizeF(mag, mag) : mag
        let x = startPos.x()
        for (const id of ids) {
            this.draw(id, painter, m, new PointF(x, startPos.y()), angle)
            x += this.advance(id, m.width())
        }
    }
}

// ---------------------------------------------------------------------------------
// EngravingFontsProvider
// ---------------------------------------------------------------------------------

export class EngravingFontsProvider {
    private m_symbolFonts: EngravingFont[] = []
    private m_fallbackName = 'Bravura'
    private m_fallbackFont: EngravingFont | null = null

    /** registers a SMuFL font: the font file has to be registered in the FontsDatabase with the same family */
    addInternalFont(name: string, family: string, metadata: Json): void {
        this.m_symbolFonts = this.m_symbolFonts.filter(f => f.name().toLowerCase() !== name.toLowerCase())
        this.m_symbolFonts.push(new EngravingFont(name, family, metadata, this))
        this.m_fallbackFont = null
    }

    private doFontByName(name: string): EngravingFont | null {
        const lo = name.toLowerCase()
        return this.m_symbolFonts.find(f => f.name().toLowerCase() === lo) ?? null
    }

    fontByName(name: string): EngravingFont {
        let font = this.doFontByName(name)
        if (!font) {
            font = this.doFallbackFont()
        }
        font.ensureLoad()
        return font
    }

    fonts(): EngravingFont[] { return [...this.m_symbolFonts] }

    setFallbackFont(name: string): void {
        this.m_fallbackName = name
        this.m_fallbackFont = null
    }

    private doFallbackFont(): EngravingFont {
        if (!this.m_fallbackFont) {
            this.m_fallbackFont = this.doFontByName(this.m_fallbackName) ?? this.m_symbolFonts[0] ?? null
            if (!this.m_fallbackFont) {
                throw new Error('no engraving font registered')
            }
        }
        return this.m_fallbackFont
    }

    fallbackFont(): EngravingFont {
        const font = this.doFallbackFont()
        font.ensureLoad()
        return font
    }

    isFallbackFont(f: EngravingFont): boolean {
        return this.doFallbackFont() === f
    }
}

let s_engravingFonts = new EngravingFontsProvider()

export function engravingFonts(): EngravingFontsProvider { return s_engravingFonts }

export function setEngravingFonts(p: EngravingFontsProvider): void { s_engravingFonts = p }
