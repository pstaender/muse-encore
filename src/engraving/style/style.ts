/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/style/style.h/.cpp
 */

import { Color } from '../../framework/draw/types/color'
import { PointF, ScaleF, SizeF } from '../../framework/draw/types/geometry'
import { Font, FontType } from '../../framework/draw/types/font'
import { Spatium } from '../types/dimension'
import { P_TYPE, type PropertyValue } from '../types/propertyvalue'
import {
    Align, AlignH, ChordStylePreset, DirectionV, DPMM, FontStyle, GlissandoStyle, GlissandoType, HookType, LHTappingSymbol,
    LineType, MeasureNumberPlacement, NoteSpellingType, ParenthesesMode, PlacementH, PlacementV, RepeatPlayCountPreset,
    RHTappingSymbol, TextStyleType, TieDotsPlacement, TiePlacement, TimeSigPlacement, TimeSigStyle, TimeSigVSMargin,
    fontStyleAdd, fontStyleRemove,
} from '../types/types'
import { TConv } from '../types/typesconv'
import { XmlReader } from '../rw/xmlreader'
import { Pid } from '../dom/propertydata'
import { fontProvider } from '../infrastructure/engravingcontext'
import { Sid, STYLE_VALUES } from './styledef'
import { allTextStyles, textStyle } from './textstyle'

export { Sid }

const STYLES = Sid.STYLES

let s_nameToSid: Map<string, Sid> | null = null

/** CompatUtils::ALIGN_VALS_TO_CONVERT */
const ALIGN_VALS_TO_CONVERT = new Map<Sid, Sid>([
    [Sid.defaultAlign, Sid.defaultPosition],
    [Sid.titleAlign, Sid.titlePosition],
    [Sid.subTitleAlign, Sid.subTitlePosition],
    [Sid.composerAlign, Sid.composerPosition],
    [Sid.lyricistAlign, Sid.lyricistPosition],
    [Sid.lyricsEvenAlign, Sid.lyricsEvenPosition],
    [Sid.lyricsOddAlign, Sid.lyricsOddPosition],
    [Sid.fingeringAlign, Sid.fingeringPosition],
    [Sid.lhGuitarFingeringAlign, Sid.lhGuitarFingeringPosition],
    [Sid.rhGuitarFingeringAlign, Sid.rhGuitarFingeringPosition],
    [Sid.hammerOnPullOffTappingAlign, Sid.hammerOnPullOffTappingPosition],
    [Sid.stringNumberAlign, Sid.stringNumberPosition],
    [Sid.staffTextAlign, Sid.staffTextPosition],
    [Sid.fretDiagramFingeringAlign, Sid.fretDiagramFingeringPosition],
    [Sid.fretDiagramFretNumberAlign, Sid.fretDiagramFretNumberPosition],
    [Sid.harpPedalDiagramAlign, Sid.harpPedalDiagramPosition],
    [Sid.harpPedalTextDiagramAlign, Sid.harpPedalTextDiagramPosition],
    [Sid.longInstrumentAlign, Sid.longInstrumentPosition],
    [Sid.shortInstrumentAlign, Sid.shortInstrumentPosition],
    [Sid.partInstrumentAlign, Sid.partInstrumentPosition],
    [Sid.dynamicsAlign, Sid.dynamicsPosition],
    [Sid.expressionAlign, Sid.expressionPosition],
    [Sid.tempoAlign, Sid.tempoPosition],
    [Sid.tempoChangeAlign, Sid.tempoChangePosition],
    [Sid.metronomeAlign, Sid.metronomePosition],
    [Sid.measureNumberAlign, Sid.measureNumberPosition],
    [Sid.mmRestRangeAlign, Sid.mmRestRangePosition],
    [Sid.translatorAlign, Sid.translatorPosition],
    [Sid.tupletAlign, Sid.tupletPosition],
    [Sid.systemTextAlign, Sid.systemTextPosition],
    [Sid.chordSymbolAAlign, Sid.chordSymPosition],
    [Sid.repeatLeftAlign, Sid.repeatLeftPosition],
    [Sid.repeatRightAlign, Sid.repeatRightPosition],
    [Sid.frameAlign, Sid.framePosition],
    [Sid.textLineTextAlign, Sid.textLinePosition],
    [Sid.noteLineAlign, Sid.noteLinePosition],
    [Sid.glissandoAlign, Sid.glissandoPosition],
    [Sid.ottavaTextAlignAbove, Sid.ottavaPosition],
    [Sid.voltaAlign, Sid.voltaPosition],
    [Sid.pedalTextAlign, Sid.pedalPosition],
    [Sid.letRingTextAlign, Sid.letRingPosition],
    [Sid.palmMuteTextAlign, Sid.palmMutePosition],
    [Sid.hairpinTextAlign, Sid.hairpinPosition],
    [Sid.bendAlign, Sid.bendPosition],
    [Sid.headerAlign, Sid.headerPosition],
    [Sid.footerAlign, Sid.footerPosition],
    [Sid.copyrightAlign, Sid.copyrightPosition],
    [Sid.pageNumberAlign, Sid.pageNumberPosition],
    [Sid.instrumentChangeAlign, Sid.instrumentChangePosition],
    [Sid.stickingAlign, Sid.stickingPosition],
    [Sid.user1Align, Sid.user1Position],
    [Sid.user2Align, Sid.user2Position],
    [Sid.user3Align, Sid.user3Position],
    [Sid.user4Align, Sid.user4Position],
    [Sid.user5Align, Sid.user5Position],
    [Sid.user6Align, Sid.user6Position],
    [Sid.user7Align, Sid.user7Position],
    [Sid.user8Align, Sid.user8Position],
    [Sid.user9Align, Sid.user9Position],
    [Sid.user10Align, Sid.user10Position],
    [Sid.user11Align, Sid.user11Position],
    [Sid.user12Align, Sid.user12Position],
])

const PRE_470_DPI = 360
/** TempoText::DEFAULT_SYM_SIZE_RATIO */
const TEMPO_DEFAULT_SYM_SIZE_RATIO = 5.0 / 3.0

function parseEnum<T>(map: Record<string, T>, s: string, def: T): T {
    return map[s] ?? def
}

export class MStyle {
    private m_values: PropertyValue[] = new Array(STYLES).fill(undefined)
    private m_precomputedValues: number[] = new Array(STYLES).fill(0)

    clone(): MStyle {
        const s = new MStyle()
        s.m_values = [...this.m_values]
        s.m_precomputedValues = [...this.m_precomputedValues]
        return s
    }

    value(idx: Sid): PropertyValue {
        if (idx === Sid.NOSTYLE) {
            return undefined
        }
        const val = this.m_values[idx]
        if (val !== undefined) {
            return val
        }
        return STYLE_VALUES[idx].defaultValue
    }

    valueMM(idx: Sid): number {
        if (idx === Sid.NOSTYLE) {
            return 0
        }
        return this.m_precomputedValues[idx]
    }

    styleV(idx: Sid): PropertyValue { return this.value(idx) }
    styleS(idx: Sid): Spatium { return this.value(idx) as Spatium }
    styleMM(idx: Sid): number { return this.valueMM(idx) }
    styleSt(idx: Sid): string { return this.value(idx) as string }
    styleB(idx: Sid): boolean { return !!this.value(idx) }
    styleD(idx: Sid): number { return Number(this.value(idx)) }
    styleI(idx: Sid): number {
        const v = this.value(idx)
        return typeof v === 'boolean' ? (v ? 1 : 0) : Math.trunc(Number(v))
    }
    styleAlign(idx: Sid): Align { return this.value(idx) as Align }
    stylePoint(idx: Sid): PointF { return this.value(idx) as PointF }
    styleColor(idx: Sid): Color { return this.value(idx) as Color }

    set(t: Sid, val: PropertyValue): void {
        if (t === Sid.NOSTYLE) {
            return
        }
        // PropertyValue in C++ converts between REAL and SPATIUM on access
        const type = STYLE_VALUES[t].type
        if (type === P_TYPE.SPATIUM && typeof val === 'number') {
            val = new Spatium(val)
        } else if (type === P_TYPE.REAL && val instanceof Spatium) {
            val = val.val()
        }
        this.m_values[t] = val
        if (t === Sid.spatium) {
            this.precomputeValues()
        } else if (STYLE_VALUES[t].type === P_TYPE.SPATIUM) {
            const spatium = Number(this.value(Sid.spatium))
            this.m_precomputedValues[t] = (val as Spatium).val() * spatium
        }
    }

    spatium(): number { return this.styleD(Sid.spatium) }
    setSpatium(v: number): void { this.set(Sid.spatium, v) }

    defaultSpatium(): number {
        return STYLE_VALUES[Sid.spatium].defaultValue as number
    }

    precomputeValues(): void {
        const spatium = Number(this.value(Sid.spatium))
        for (const t of STYLE_VALUES) {
            if (t.type === P_TYPE.SPATIUM) {
                this.m_precomputedValues[t.sid] = (this.value(t.sid) as Spatium).val() * spatium
            }
        }
    }

    defaultStyleVersion(): number { return this.styleI(Sid.defaultsVersion) }
    setDefaultStyleVersion(v: number): void { this.set(Sid.defaultsVersion, v) }

    static valueType(i: Sid): P_TYPE { return STYLE_VALUES[i].type }
    static valueName(i: Sid): string { return STYLE_VALUES[i].xmlName }

    static styleIdx(name: string): Sid {
        if (!s_nameToSid) {
            s_nameToSid = new Map()
            for (const st of STYLE_VALUES) {
                s_nameToSid.set(st.xmlName, st.sid)
            }
        }
        return s_nameToSid.get(name) ?? Sid.NOSTYLE
    }

    // ---------------------------------------------------------------------------------
    // read
    // ---------------------------------------------------------------------------------

    /** reads a full style document (<museScore><Style>...</Style></museScore>) */
    readDocument(data: string | Uint8Array | ArrayBuffer): boolean {
        const e = new XmlReader(data)
        while (e.readNextStartElement()) {
            if (e.name() === 'museScore') {
                const versionTag = e.attribute('version').replace('.', '')
                const mscVersion = parseInt(versionTag, 10) || 0
                while (e.readNextStartElement()) {
                    if (e.name() === 'Style') {
                        this.read(e, mscVersion)
                    } else {
                        e.unknown()
                    }
                }
            }
        }
        return true
    }

    readProperties(e: XmlReader): boolean {
        const tag = e.name()
        const idx = MStyle.styleIdx(tag)
        if (idx === Sid.NOSTYLE) {
            return this.readStyleValCompat(e)
        }
        const type = STYLE_VALUES[idx].type
        switch (type) {
        case P_TYPE.SPATIUM:
            this.set(idx, new Spatium(e.readDouble()))
            break
        case P_TYPE.REAL:
            this.set(idx, e.readDouble())
            break
        case P_TYPE.BOOL:
            this.set(idx, e.readInt() !== 0)
            break
        case P_TYPE.INT:
            this.set(idx, e.readInt())
            break
        case P_TYPE.DIRECTION_V:
            this.set(idx, e.readInt() as DirectionV)
            break
        case P_TYPE.STRING:
            this.set(idx, e.readText())
            break
        case P_TYPE.ALIGN:
            this.set(idx, TConv.fromXmlAlign(e.readText(), new Align()))
            break
        case P_TYPE.ALIGN_H:
            this.set(idx, TConv.fromXmlAlignH(e.readText(), AlignH.HCENTER))
            break
        case P_TYPE.POINT: {
            const x = e.doubleAttribute('x', 0.0)
            const y = e.doubleAttribute('y', 0.0)
            this.set(idx, new PointF(x, y))
            e.readText()
            break
        }
        case P_TYPE.SIZE: {
            const x = e.doubleAttribute('w', 0.0)
            const y = e.doubleAttribute('h', 0.0)
            this.set(idx, new SizeF(x, y))
            e.readText()
            break
        }
        case P_TYPE.SCALE: {
            const sx = e.doubleAttribute('w', 0.0)
            const sy = e.doubleAttribute('h', 0.0)
            this.set(idx, new ScaleF(sx, sy))
            e.readText()
            break
        }
        case P_TYPE.COLOR: {
            const c = new Color()
            c.setRed(e.intAttribute('r'))
            c.setGreen(e.intAttribute('g'))
            c.setBlue(e.intAttribute('b'))
            c.setAlpha(e.intAttribute('a', 255))
            this.set(idx, c)
            e.readText()
            break
        }
        case P_TYPE.PLACEMENT_V:
            this.set(idx, (parseInt(e.readText(), 10) || 0) as PlacementV)
            break
        case P_TYPE.PLACEMENT_H:
            this.set(idx, (parseInt(e.readText(), 10) || 0) as PlacementH)
            break
        case P_TYPE.HOOK_TYPE:
            this.set(idx, (parseInt(e.readText(), 10) || 0) as HookType)
            break
        case P_TYPE.LINE_TYPE:
            this.set(idx, TConv.fromXmlLineType(e.readText(), LineType.SOLID))
            break
        case P_TYPE.CLEF_TO_BARLINE_POS:
            this.set(idx, e.readInt())
            break
        case P_TYPE.TIE_PLACEMENT:
            this.set(idx, TConv.fromXmlTiePlacement(e.readText(), TiePlacement.AUTO))
            break
        case P_TYPE.TIE_DOTS_PLACEMENT:
            this.set(idx, TConv.fromXmlTieDotsPlacement(e.readText(), TieDotsPlacement.AUTO))
            break
        case P_TYPE.GLISS_STYLE:
            this.set(idx, (parseInt(e.readText(), 10) || 0) as GlissandoStyle)
            break
        case P_TYPE.GLISS_TYPE:
            this.set(idx, (parseInt(e.readText(), 10) || 0) as GlissandoType)
            break
        case P_TYPE.TIMESIG_PLACEMENT:
            this.set(idx, TConv.fromXmlTimeSigPlacement(e.readText(), TimeSigPlacement.NORMAL))
            break
        case P_TYPE.TIMESIG_STYLE:
            this.set(idx, TConv.fromXmlTimeSigStyle(e.readText(), TimeSigStyle.NORMAL))
            break
        case P_TYPE.TIMESIG_MARGIN:
            this.set(idx, TConv.fromXmlTimeSigVSMargin(e.readText(), TimeSigVSMargin.RIGHT_ALIGN_TO_BARLINE))
            break
        case P_TYPE.NOTE_SPELLING_TYPE:
            this.set(idx, TConv.fromXmlNoteSpellingType(e.readText(), NoteSpellingType.STANDARD))
            break
        case P_TYPE.CHORD_PRESET_TYPE:
            this.set(idx, TConv.fromXmlChordStylePreset(e.readText(), ChordStylePreset.STANDARD))
            break
        case P_TYPE.PARENTHESES_MODE:
            this.set(idx, parseEnum({ none: ParenthesesMode.NONE, left: ParenthesesMode.LEFT, right: ParenthesesMode.RIGHT,
                both: ParenthesesMode.BOTH }, e.readText(), ParenthesesMode.NONE))
            break
        case P_TYPE.LH_TAPPING_SYMBOL:
            this.set(idx, parseEnum({ dot: LHTappingSymbol.DOT, circledT: LHTappingSymbol.CIRCLED_T }, e.readText(),
                LHTappingSymbol.DOT))
            break
        case P_TYPE.RH_TAPPING_SYMBOL:
            this.set(idx, parseEnum({ T: RHTappingSymbol.T, plus: RHTappingSymbol.PLUS }, e.readText(), RHTappingSymbol.T))
            break
        case P_TYPE.TEXT_STYLE:
            this.set(idx, TConv.fromXmlTextStyleType(e.readText(), TextStyleType.DEFAULT))
            break
        case P_TYPE.PLAY_COUNT_PRESET:
            this.set(idx, TConv.fromXmlRepeatPlayCountPreset(e.readText(), RepeatPlayCountPreset.X_N))
            break
        case P_TYPE.MEASURE_NUMBER_PLACEMENT:
            this.set(idx, TConv.fromXmlMeasureNumberPlacement(e.readText(), MeasureNumberPlacement.ABOVE_SYSTEM))
            break
        default:
            e.skipCurrentElement()
            break
        }
        return true
    }

    /**
     * Read obsolete style values which may appear in files
     * produced by older versions of MuseScore.
     */
    private readStyleValCompat(e: XmlReader): boolean {
        const tag = e.name()
        if (tag === 'tempoOffset') { // pre-3.0-beta
            const val = new PointF(e.doubleAttribute('x', 0.0), e.doubleAttribute('y', 0.0))
            this.set(Sid.tempoPosAbove, val)
            this.set(Sid.tempoPosBelow, val.clone())
            e.readText()
            return true
        }
        return this.readTextStyleValCompat(e)
    }

    /**
     * Handle transition from separate bold, underline, strike
     * and italic style properties to the single *FontStyle property set.
     */
    private readTextStyleValCompat(e: XmlReader): boolean {
        const styleNamesEndings: [string, FontStyle][] = [
            ['FontBold', FontStyle.Bold],
            ['FontItalic', FontStyle.Italic],
            ['FontUnderline', FontStyle.Underline],
            ['FontStrike', FontStyle.Strike],
        ]
        const tag = e.name()
        let readFontStyle = FontStyle.Normal
        let typeName = ''
        for (const [ending, fs] of styleNamesEndings) {
            if (tag.endsWith(ending)) {
                readFontStyle = fs
                typeName = tag.slice(0, tag.length - ending.length)
                break
            }
        }
        if (readFontStyle === FontStyle.Normal) {
            return false
        }
        const sid = MStyle.styleIdx(typeName + 'FontStyle')
        if (sid === Sid.NOSTYLE) {
            return false
        }
        const readVal = (parseInt(e.readText(), 10) || 0) !== 0
        const val = this.value(sid)
        let newFontStyle = val !== undefined ? (val as FontStyle) : FontStyle.Normal
        newFontStyle = readVal ? fontStyleAdd(newFontStyle, readFontStyle) : fontStyleRemove(newFontStyle, readFontStyle)
        this.set(sid, newFontStyle)
        return true
    }

    read(e: XmlReader, mscVersion: number): void {
        while (e.readNextStartElement()) {
            const tag = e.name()

            if (tag === 'TextStyle') {
                e.readText() // obsolete
            } else if (tag === 'ottavaHook') { // obsolete, for 3.0dev bw. compatibility
                const y = Math.abs(e.readDouble())
                this.set(Sid.ottavaHookAbove, y)
                this.set(Sid.ottavaHookBelow, -y)
            } else if (tag === 'Spatium' || tag === 'spatium') {
                this.set(Sid.spatium, e.readDouble() * DPMM)
            } else if (tag === 'page-layout') { // obsolete
                // TODO(port): compat::readPageFormat206 (only for 2.x files)
                e.skipCurrentElement()
            } else if (tag === 'displayInConcertPitch') {
                this.set(Sid.concertPitch, e.readBool())
            } else if (tag === 'ChordList') {
                // TODO(port): ReadChordListHook
                e.skipCurrentElement()
            } else if (tag === 'lyricsDashMaxLegth') { // pre-3.6 typo
                this.set(Sid.lyricsDashMaxLength, new Spatium(e.readDouble()))
            } else if (tag === 'dontHidStavesInFirstSystm') { // pre-3.6.3/4.0 typo
                this.set(Sid.dontHideStavesInFirstSystem, e.readBool())
            } else if (tag === 'minSpreadSpread') { // pre-4.4 typo
                this.set(Sid.minStaffSpread, new Spatium(e.readDouble()))
            } else if (tag === 'maxSpreadSpread') { // pre-4.4 typo
                this.set(Sid.maxStaffSpread, new Spatium(e.readDouble()))
            } else if (tag === 'beamDistance') { // beamDistance maps to useWideBeams in 4.0
                this.set(Sid.useWideBeams, e.readDouble() > 0.75)
            } else if (tag === 'hairpinWidth') { // pre-4.4 typo
                this.set(Sid.hairpinLineWidth, new Spatium(e.readDouble()))
            } else if (tag === 'chordSymbolPosAbove') { // pre-4.4 typo
                this.set(Sid.chordSymbolAPosAbove, e.readPoint())
            } else if (tag === 'chordSymbolPosBelow') { // pre-4.4 typo
                this.set(Sid.chordSymbolAPosBelow, e.readPoint())
            } else if (tag === 'firstSystemInsNameVisibility') { // pre-4.4 typo
                this.set(Sid.firstSystemInstNameVisibility, e.readInt())
            } else if ((tag === 'articulationMinDistance'
                        || tag === 'propertyDistanceHead'
                        || tag === 'propertyDistanceStem'
                        || tag === 'propertyDistance'
                        || tag === 'bracketDistance')
                       && mscVersion < 400) {
                // Ignoring pre-4.0 articulation style and brackets distance settings. Using the new defaults instead
                e.skipCurrentElement()
            } else if (tag === 'pedalListStyle') { // pre-3.6.3/4.0 typo
                this.set(Sid.pedalLineStyle, TConv.fromXmlLineType(e.readText(), LineType.SOLID))
            } else if (tag === 'chordlineThickness' && mscVersion < 410) {
                // Ignoring pre-4.1 value as it was wrong (it wasn't user-editable anyway)
                e.skipCurrentElement()
            } else if (tag === 'pedalText' && mscVersion < 420) {
                // Ignore old default
                const pedText = e.readText()
                if (pedText.length) {
                    this.set(Sid.pedalText, pedText)
                }
            } else if (tag === 'pedalContinueText' && mscVersion < 420) {
                // Ignore old default
                const pedContText = e.readText()
                if (pedContText.length) {
                    this.set(Sid.pedalText, pedContText)
                }
            } else if (tag === 'ArpeggioNoteDistance') { // pre-4.4 typo
                this.set(Sid.arpeggioNoteDistance, new Spatium(e.readDouble()))
            } else if (tag === 'ArpeggioAccidentalDistance') { // pre-4.4 typo
                this.set(Sid.arpeggioAccidentalDistance, new Spatium(e.readDouble()))
            } else if (tag === 'ArpeggioAccidentalDistanceMin') { // pre-4.4 typo
                this.set(Sid.arpeggioAccidentalDistanceMin, new Spatium(e.readDouble()))
            } else if (tag === 'ArpeggioLineWidth') { // pre-x.4 typo
                this.set(Sid.arpeggioLineWidth, new Spatium(e.readDouble()))
            } else if (tag === 'ArpeggioHookLen') { // pre-x.4 typo
                this.set(Sid.arpeggioHookLen, new Spatium(e.readDouble()))
            } else if (tag === 'ArpeggioHiddenInStdIfTab') { // pre-x.4 typo
                this.set(Sid.arpeggioHiddenInStdIfTab, e.readBool())
            } else if ((tag === 'slurEndWidth'
                        || tag === 'slurMidWidth'
                        || tag === 'slurDottedWidth'
                        || tag === 'slurMinDistance')
                       && mscVersion < 430) {
                // Pre-4.3 scores used identical style values for slurs and ties.
                // When opening older scores, use the same values for both.
                const val = new Spatium(e.readDouble())
                if (tag === 'slurEndWidth') {
                    this.set(Sid.tieEndWidth, val)
                    this.set(Sid.slurEndWidth, val)
                } else if (tag === 'slurMidWidth') {
                    this.set(Sid.tieMidWidth, val)
                    this.set(Sid.slurMidWidth, val)
                } else if (tag === 'slurDottedWidth') {
                    this.set(Sid.tieDottedWidth, val)
                    this.set(Sid.slurDottedWidth, val)
                } else if (tag === 'slurMinDistance') {
                    this.set(Sid.tieMinDistance, val)
                    this.set(Sid.slurMinDistance, val)
                }
            } else if (tag === 'measureNumberOffset' && mscVersion < 440) { // pre-4.4 typo
                this.set(Sid.measureNumberPosAbove, e.readPoint())
            } else if (tag === 'measureNumberPosAbove' && mscVersion < 440) { // pre-4.4 typo
                this.set(Sid.mmRestRangePosAbove, e.readPoint())
            } else if (tag === 'ottavaTextAlign') {
                e.skipCurrentElement() // obsolete
            } else if (tag === 'tremoloStrokeStyle') { // pre-4.4 typo
                this.set(Sid.tremoloStyle, e.readInt())
            } else if (tag === 'systemFontFace') { // pre-4.4 typo
                this.set(Sid.systemTextFontFace, e.readText())
            } else if (tag === 'systemFontSize') { // pre-4.4 typo
                this.set(Sid.systemTextFontSize, e.readDouble())
            } else if (tag === 'systemFontSpatiumDependent') { // pre-4.4 typo
                this.set(Sid.systemTextFontSpatiumDependent, e.readInt() !== 0)
            } else if (tag === 'systemFontStyle') { // pre-4.4 typo
                this.set(Sid.systemTextFontStyle, e.readInt())
            } else if (tag === 'systemAlign') { // pre-4.4 typo
                this.set(Sid.systemTextAlign, TConv.fromXmlAlign(e.readText(), new Align()))
            } else if (tag === 'systemOffsetType') { // pre-4.4 typo
                this.set(Sid.systemTextOffsetType, e.readInt())
            } else if (tag === 'systemPlacement') { // pre-4.4 typo
                this.set(Sid.systemTextPlacement, (parseInt(e.readText(), 10) || 0) as PlacementV)
            } else if (tag === 'systemPosAbove') { // pre-4.4 typo
                this.set(Sid.systemTextPosAbove, e.readPoint())
            } else if (tag === 'systemPosBelow') { // pre-4.4 typo
                this.set(Sid.systemTextPosBelow, e.readPoint())
            } else if (tag === 'systemMinDistance') { // pre-4.4 typo
                this.set(Sid.systemTextMinDistance, new Spatium(e.readDouble()))
            } else if (tag === 'systemFrameType') { // pre-4.4 typo
                this.set(Sid.systemTextFrameType, e.readInt())
            } else if (tag === 'systemFramePadding') { // pre-4.4 typo
                this.set(Sid.systemTextFramePadding, e.readDouble())
            } else if (tag === 'systemFrameWidth') { // pre-4.4 typo
                this.set(Sid.systemTextFrameWidth, e.readDouble())
            } else if (tag === 'systemFrameRound') { // pre-4.4 typo
                this.set(Sid.systemTextFrameRound, e.readDouble())
            } else if (tag === 'systemFrameFgColor') { // pre-4.4 typo
                this.set(Sid.systemTextFrameFgColor, e.readColor())
            } else if (tag === 'systemFrameBgColor') { // pre-4.4 typo
                this.set(Sid.systemTextFrameBgColor, e.readColor())
            } else if (tag === 'staffFontFace') { // pre-4.4 typo
                this.set(Sid.staffTextFontFace, e.readText())
            } else if (tag === 'staffFontSize') { // pre-4.4 typo
                this.set(Sid.staffTextFontSize, e.readDouble())
            } else if (tag === 'staffFontSpatiumDependent') { // pre-4.4 typo
                this.set(Sid.staffTextFontSpatiumDependent, e.readBool())
            } else if (tag === 'staffFontStyle') { // pre-4.4 typo
                this.set(Sid.staffTextFontStyle, e.readInt())
            } else if (tag === 'staffAlign') { // pre-4.4 typo
                this.set(Sid.staffTextAlign, TConv.fromXmlAlign(e.readText(), new Align()))
            } else if (tag === 'staffOffsetType') { // pre-4.4 typo
                this.set(Sid.staffTextOffsetType, e.readInt())
            } else if (tag === 'staffPlacement') { // pre-4.4 typo
                this.set(Sid.staffTextPlacement, (parseInt(e.readText(), 10) || 0) as PlacementV)
            } else if (tag === 'staffTextPosAbove' && mscVersion <= 410) { // pre-4.4 typo
                const staffTextPosAboveY = e.readDouble()
                this.set(Sid.staffTextPosAbove, new PointF(0.0, staffTextPosAboveY))
            } else if (tag === 'staffPosAbove') { // pre-4.4 typo
                this.set(Sid.staffTextPosAbove, e.readPoint())
            } else if (tag === 'staffPosBelow') { // pre-4.4 typo
                this.set(Sid.staffTextPosBelow, e.readPoint())
            } else if (tag === 'staffTextMinDistance' && mscVersion <= 410) { // pre-4.4 typo
                this.set(Sid.staffTextMinDistance, new Spatium(e.readDouble()))
            } else if (tag === 'staffMinDistance') { // pre-4.4 typo
                this.set(Sid.staffTextMinDistance, new Spatium(e.readDouble()))
            } else if (tag === 'staffFrameType') { // pre-4.4 typo
                this.set(Sid.staffTextFrameType, e.readInt())
            } else if (tag === 'staffFramePadding') { // pre-4.4 typo
                this.set(Sid.staffTextFramePadding, e.readDouble())
            } else if (tag === 'staffFrameWidth') { // pre-4.4 typo
                this.set(Sid.staffTextFrameWidth, e.readDouble())
            } else if (tag === 'staffFrameRound') { // pre-4.4 typo
                this.set(Sid.staffTextFrameRound, e.readDouble())
            } else if (tag === 'staffFrameFgColor') { // pre-4.4 typo
                this.set(Sid.staffTextFrameFgColor, e.readColor())
            } else if (tag === 'staffFrameBgColor') { // pre-4.4 typo
                this.set(Sid.staffTextFrameBgColor, e.readColor())
            } else if (tag === 'dymanicsShowTabCommon') { // pre-4.4 typo in gp-style.mss
                this.set(Sid.dynamicsShowTabCommon, e.readInt() !== 0)
            } else if (tag === 'tupletOufOfStaff') {
                this.set(Sid.tupletOutOfStaff, e.readInt() !== 0)
            } else if (tag === 'pedalBeginTextOffset'
                       || tag === 'letRingBeginTextOffset'
                       || tag === 'palmMuteBeginTextOffset'
                       || tag === 'defaultFontSpatiumDependent'
                       || tag === 'usePre_3_6_defaults') {
                e.skipCurrentElement() // obsolete
            } else if ((tag === 'articulationAnchorDefault' || tag === 'articulationAnchorLuteFingering'
                        || tag === 'articulationAnchorOther') && mscVersion < 410) {
                const sid = MStyle.styleIdx(tag)
                this.set(sid, translateToNewArticulationAnchor(e.readInt()))
            } else if (tag === 'lineEndToSystemEndDistance') { // renamed in 4.5
                this.set(Sid.lineEndToBarlineDistance, new Spatium(e.readDouble()))
            } else if (tag === 'useStandardNoteNames') { // These settings were collapsed into one enum in 4.6
                if (e.readBool()) {
                    this.set(Sid.chordSymbolSpelling, NoteSpellingType.STANDARD)
                }
            } else if (tag === 'useGermanNoteNames') {
                if (e.readBool()) {
                    this.set(Sid.chordSymbolSpelling, NoteSpellingType.GERMAN)
                }
            } else if (tag === 'useFullGermanNoteNames') {
                if (e.readBool()) {
                    this.set(Sid.chordSymbolSpelling, NoteSpellingType.GERMAN_PURE)
                }
            } else if (tag === 'useSolfeggioNoteNames') {
                if (e.readBool()) {
                    this.set(Sid.chordSymbolSpelling, NoteSpellingType.SOLFEGGIO)
                }
            } else if (tag === 'useFrenchNoteNames') {
                if (e.readBool()) {
                    this.set(Sid.chordSymbolSpelling, NoteSpellingType.FRENCH)
                }
            } else if (tag === 'chordModifierAdjust' && mscVersion < 460) {
                this.set(Sid.chordModifierAdjust, convertChordExtModUnits(e.readDouble()))
            } else if (tag === 'chordExtensionAdjust' && mscVersion < 460) {
                this.set(Sid.chordExtensionAdjust, convertChordExtModUnits(e.readDouble()))
            } else if (tag === 'chordDescriptionFile' && mscVersion < 460) {
                const val = e.readText()
                this.set(Sid.chordDescriptionFile, val === 'chords_std.xml' ? 'chords_legacy.xml' : val)
            } else if (tag === 'chordStyle' && mscVersion < 460) {
                const val = e.readText()
                if (val === 'std') {
                    this.set(Sid.chordStyle, ChordStylePreset.LEGACY)
                } else {
                    this.set(Sid.chordStyle, TConv.fromXmlChordStylePreset(val, ChordStylePreset.STANDARD))
                }
            } else if (tag === 'fretFrets' && mscVersion < 460) {
                e.skipCurrentElement()
            } else if (tag === 'measureNumberHPlacement' && mscVersion < 460) {
                // Before 460 PlacementH was used instead of AlignH, and was written as integer.
                const hPlacement = e.readInt() as PlacementH
                const hAlign = hPlacement === PlacementH.LEFT ? AlignH.LEFT
                    : hPlacement === PlacementH.CENTER ? AlignH.HCENTER : AlignH.RIGHT
                this.set(Sid.measureNumberHPlacement, hAlign)
                if (hAlign !== AlignH.LEFT) {
                    // In this case it was assumed to be centered on the measure
                    this.set(Sid.measureNumberAlignToBarline, false)
                }
            } else if (tag === 'mmRestRangeHPlacement' && mscVersion < 460) {
                const hPlacement = e.readInt() as PlacementH
                const hAlign = hPlacement === PlacementH.LEFT ? AlignH.LEFT
                    : hPlacement === PlacementH.CENTER ? AlignH.HCENTER : AlignH.RIGHT
                this.set(Sid.mmRestRangeHPlacement, hAlign)
            } else if (tag === 'measureNumberAllStaves' || tag === 'measureNumberAllStaffs' /*old typo*/) {
                const allStaves = e.readBool()
                this.set(Sid.measureNumberPlacementMode,
                    allStaves ? MeasureNumberPlacement.ON_ALL_STAVES : MeasureNumberPlacement.ABOVE_SYSTEM)
            } else if (mscVersion < 470 && tag.includes('FrameRound')) {
                const sid = MStyle.styleIdx(tag)
                if (sid !== Sid.NOSTYLE) {
                    this.set(sid, convertPre470FrameRadius(e.readDouble()))
                } else {
                    e.skipCurrentElement()
                }
            } else if (!this.readProperties(e)) {
                e.unknown()
            }
        }

        if (mscVersion < 470) {
            this.set(Sid.dividerLeftAlignToSystemBarline, false)
            this.set(Sid.dividerRightAlignToSystemBarline, false)

            // Musical symbol size
            setMusicSymbolSize470(this)

            // Make sure new position styles are initially the same as align values
            // Exclude text styles which had align & position separated in 4.6
            setPositionStylesFromAlign(this, [Sid.chordSymbolAAlign, Sid.chordSymbolBAlign, Sid.romanNumeralAlign,
                Sid.nashvilleNumberAlign, Sid.repeatLeftAlign, Sid.repeatRightAlign])

            if (this.value(Sid.chordStyle) === ChordStylePreset.JAZZ) {
                this.set(Sid.harmonyParenUseSmuflSym, true)
            }
        }

        if (mscVersion < 460) {
            const verticalChordAlign = (this.value(Sid.maxChordShiftAbove) as Spatium).val() !== 0
                                       || (this.value(Sid.maxChordShiftBelow) as Spatium).val() !== 0
                                       || (this.value(Sid.maxFretShiftAbove) as Spatium).val() !== 0
                                       || (this.value(Sid.maxFretShiftBelow) as Spatium).val() !== 0
            this.set(Sid.verticallyAlignChordSymbols, verticalChordAlign)
            // Make sure new position styles are initially the same as align values
            setPositionStylesFromAlign(this, [])

            if (this.value(Sid.measureNumberPosition) === AlignH.HCENTER) {
                this.set(Sid.measureNumberHPlacement, AlignH.HCENTER)
            }

            if (this.value(Sid.pedalPlacement) === PlacementV.BELOW
                && (this.value(Sid.pedalHookHeight) as Spatium).val() < 0) {
                this.set(Sid.pedalHookHeight, (this.value(Sid.pedalHookHeight) as Spatium).neg())
            }
            if ((this.value(Sid.ottavaHookBelow) as Spatium).val() < 0) {
                this.set(Sid.ottavaHookBelow, (this.value(Sid.ottavaHookBelow) as Spatium).neg())
            }
            this.set(Sid.repeatPlayCountShow, false)

            this.set(Sid.harmonyHarmonyDistance, this.value(Sid.minHarmonyDistance))
        }

        if (mscVersion === 450) {
            // 450 spacing was a bit narrower
            this.set(Sid.spacingDensity, 1.30)
        }

        if (mscVersion < 450) {
            // Didn't exist before 4.5. Default to false for compatibility.
            this.set(Sid.scaleRythmicSpacingForSmallNotes, false)
            this.set(Sid.maskBarlinesForText, false)
            this.set(Sid.showCourtesiesRepeats, false)
            this.set(Sid.showCourtesiesOtherJumps, false)
            this.set(Sid.showCourtesiesAfterCancellingRepeats, false)
            this.set(Sid.showCourtesiesAfterCancellingOtherJumps, false)
            this.set(Sid.changesBeforeBarlineRepeats, false)
            this.set(Sid.changesBeforeBarlineOtherJumps, false)
        }

        if (mscVersion < 420) {
            // This style didn't exist before version 4.2. For files older than 4.2, defaults
            // to INSIDE for compatibility. For files 4.2 and newer, defaults to OUTSIDE.
            this.set(Sid.tiePlacementChord, TiePlacement.INSIDE)
        }

        // TODO(port): readChordListHook->validate()
    }
}

// ---------------------------------------------------------------------------------
// compat helpers (src/engraving/rw/compat/compatutils.cpp)
// ---------------------------------------------------------------------------------

function translateToNewArticulationAnchor(anchor: number): number {
    switch (anchor) {
    case 0: // ArticulationAnchor::TOP_STAFF
    case 3: // ArticulationAnchor::TOP_CHORD
        return 0 // ArticulationAnchor::TOP
    case 1: // ArticulationAnchor::BOTTOM_STAFF
    case 4: // ArticulationAnchor::BOTTOM_CHORD
        return 1 // ArticulationAnchor::BOTTOM
    default:
        return 2 // ArticulationAnchor::AUTO
    }
}

function convertChordExtModUnits(val: number): number {
    // Pre 4.6 this value was in 1/5 of a spatium
    // After 4.6 this is in % of root cap height
    const DEFAULT_SPATIUM = STYLE_VALUES[Sid.spatium].defaultValue as number
    const f = new Font('Edwin', FontType.Text)
    f.setPointSizeF(10)
    const DEFAULT_FONT_CAP_HEIGHT = fontProvider().capHeight(f) || 121
    return ((val / 5) * DEFAULT_SPATIUM) / DEFAULT_FONT_CAP_HEIGHT
}

function convertPre470FrameRadius(frameRadius: number): Spatium {
    // The frame radius used to be expressed in raster units and divided by 2 at drawing. Since 4.7 it is expressed in spatium.
    const DPI = 1200
    const baseSpatium = STYLE_VALUES[Sid.spatium].defaultValue as number
    return new Spatium(frameRadius * (DPI / PRE_470_DPI) / baseSpatium / 2)
}

export function positionStyleFromAlign(align: Sid): Sid {
    return ALIGN_VALS_TO_CONVERT.get(align) ?? Sid.NOSTYLE
}

function setPositionStylesFromAlign(style: MStyle, ignoreSids: Sid[]): void {
    for (const st of STYLE_VALUES) {
        if (ignoreSids.includes(st.sid)) {
            continue
        }
        const positionSid = positionStyleFromAlign(st.sid)
        if (positionSid === Sid.NOSTYLE) {
            continue
        }
        const val = (style.value(st.sid) as Align).horizontal
        style.set(positionSid, val)
    }
}

function setMusicSymbolSize470(style: MStyle): void {
    // Music symbols have their own point size in 4.7
    // Initialize this to the text type's default font size
    for (const textStyleType of allTextStyles()) {
        if (textStyleType === TextStyleType.REPEAT_LEFT || textStyleType === TextStyleType.REPEAT_RIGHT) {
            continue
        }
        const ts = textStyle(textStyleType)
        if (!ts) {
            continue
        }
        let musicSymbolSizeSid = Sid.NOSTYLE
        let fontSizeSid = Sid.NOSTYLE
        for (const p of ts) {
            if (p.pid === Pid.MUSIC_SYMBOL_SIZE) {
                musicSymbolSizeSid = p.sid
            }
            if (p.pid === Pid.FONT_SIZE) {
                fontSizeSid = p.sid
            }
        }
        if (musicSymbolSizeSid === Sid.NOSTYLE || fontSizeSid === Sid.NOSTYLE) {
            continue
        }
        let size = Number(style.value(fontSizeSid))
        if (textStyleType === TextStyleType.TEMPO) {
            size *= TEMPO_DEFAULT_SYM_SIZE_RATIO
        }
        style.set(musicSymbolSizeSid, size)
    }
}
