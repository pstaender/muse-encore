/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/palette/internal/palettecreator.h/.cpp: the default palettes and the master palette ("More").
 *
 * TODO(port): cells of elements not ported yet are left out: harp pedal diagrams, capo,
 * string tunings, tapping, chord brackets, text articulations (handbells), the chord diagrams of the fretboard
 * diagram palette (FretDiagram::updateDiagram needs the fret diagram patterns; only "Blank" is created).
 */

import { Fraction } from '../engraving/types/fraction'
import { SymId } from '../engraving/types/symid'
import { SymNames } from '../engraving/types/symnames'
import { TConv } from '../engraving/types/typesconv'
import { ARPEGGIO_TYPES, GLISSANDO_TYPES, PLAY_TECH_TYPES, VIBRATO_TYPES, type Item } from '../engraving/types/typesconvdata'
import {
    ArpeggioType, BarLineType, BracketType, ChordLineType, ClefType, ElementType, GlissandoType, GradualTempoChangeType, HookType, Key,
    KeyMode, LayoutBreakType, MarkerType, NoteHeadGroup, NoteHeadType, PlacementV, PlayingTechniqueType, TextStyleType, TremoloType,
    TrillType, VibratoType,
} from '../engraving/types/types'
import { Spatium } from '../engraving/types/dimension'
import { Sid } from '../engraving/style/styledef'
import { Pid, PropertyFlags } from '../engraving/dom/property'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import { Factory } from '../engraving/dom/factory'
import { scoreDummy } from '../engraving/compat/dummyelement'
import { gpaletteScore } from '../engraving/dom/palettescore'
import { ActionIconType } from '../engraving/dom/actionicon'
import { BagpipeEmbellishment } from '../engraving/dom/bagpembell'
import { AccidentalType } from '../engraving/dom/accidentaldata'
import type { Accidental } from '../engraving/dom/accidental'
import { Ambitus } from '../engraving/dom/ambitus'
import type { Arpeggio } from '../engraving/dom/arpeggio'
import type { Articulation } from '../engraving/dom/articulation'
import type { BarLine } from '../engraving/dom/barline'
import type { Bracket } from '../engraving/dom/bracket'
import { Breath } from '../engraving/dom/breath'
import type { ChordLine } from '../engraving/dom/chordline'
import type { Clef } from '../engraving/dom/clef'
import type { Dynamic } from '../engraving/dom/dynamic'
import { Expression } from '../engraving/dom/expression'
import type { Fermata } from '../engraving/dom/fermata'
import type { Fingering } from '../engraving/dom/fingering'
import type { FretDiagram } from '../engraving/dom/fret'
import { Glissando } from '../engraving/dom/glissando'
import { GradualTempoChange } from '../engraving/dom/gradualtempochange'
import { Hairpin, HairpinType } from '../engraving/dom/hairpin'
import { HammerOnPullOff } from '../engraving/dom/hammeronpulloff'
import { InstrumentChange } from '../engraving/dom/instrchange'
import { Jump, jumpTypeTable } from '../engraving/dom/jump'
import { KeySigEvent } from '../engraving/dom/key'
import type { KeySig } from '../engraving/dom/keysig'
import type { LayoutBreak } from '../engraving/dom/layoutbreak'
import { LetRing } from '../engraving/dom/letring'
import { Marker } from '../engraving/dom/marker'
import { MeasureNumber } from '../engraving/dom/measurenumber'
import { MeasureRepeat } from '../engraving/dom/measurerepeat'
import { Note } from '../engraving/dom/note'
import { NoteHead } from '../engraving/dom/notehead'
import type { Ornament } from '../engraving/dom/ornament'
import { Ottava, OttavaType } from '../engraving/dom/ottava'
import { PalmMute } from '../engraving/dom/palmmute'
import { Part } from '../engraving/dom/part'
import { Pedal } from '../engraving/dom/pedal'
import { PlayTechAnnotation } from '../engraving/dom/playtechannotation'
import { RehearsalMark } from '../engraving/dom/rehearsalmark'
import type { Slur } from '../engraving/dom/slur'
import { SpacerType, type Spacer } from '../engraving/dom/spacer'
import { StaffText, SystemText } from '../engraving/dom/stafftextbase'
import { Symbol as SymbolItem } from '../engraving/dom/symbol'
import { TempoText, TempoTextType } from '../engraving/dom/tempotext'
import { TextLine } from '../engraving/dom/textline'
import type { TextBase } from '../engraving/dom/textbase'
import { TimeSigType, type TimeSig } from '../engraving/dom/timesig'
import type { TremoloSingleChord } from '../engraving/dom/tremolosinglechord'
import type { TremoloTwoChord } from '../engraving/dom/tremolotwochord'
import { Trill } from '../engraving/dom/trill'
import { Vibrato } from '../engraving/dom/vibrato'
import { Volta, VoltaType } from '../engraving/dom/volta'
import { WhammyBar } from '../engraving/dom/whammybar'
import { SingleLayout } from '../engraving/rendering/single/singlelayout'
import { Palette, PaletteType } from './palette'
import { PaletteTree } from './palettetree'

const FRAME_MAG = 1.25

const score = gpaletteScore
const dummy = () => scoreDummy(gpaletteScore())

/** Factory::make...(parent) */
function make<T extends EngravingItem>(type: ElementType, parent: EngravingItem = dummy()): T {
    const e = Factory.createItem(type, parent)
    if (!e) {
        throw new Error(`palette: cannot create ${ElementType[type]}`)
    }
    return e as T
}

/** TConv::userName(...) of the generated tables: the source string of the capitalized user name */
function userName<T>(table: readonly Item<T>[], v: T): string {
    const it = table.find(i => i.type === v)
    return it?.tCapitalizedUserName?.str ?? it?.tUserName?.str ?? ''
}

function userNameForSymId(id: SymId): string {
    return SymNames.userNameForSymId(id).str
}

/** BarLine::barLineTable with the user names (SymNames::userNameForSymId) */
const BAR_LINE_TABLE: readonly { type: BarLineType; userName: string }[] = [
    { type: BarLineType.NORMAL, userName: userNameForSymId(SymId.barlineSingle) },
    { type: BarLineType.DOUBLE, userName: userNameForSymId(SymId.barlineDouble) },
    { type: BarLineType.START_REPEAT, userName: userNameForSymId(SymId.repeatLeft) },
    { type: BarLineType.END_REPEAT, userName: userNameForSymId(SymId.repeatRight) },
    { type: BarLineType.BROKEN, userName: userNameForSymId(SymId.barlineDashed) },
    { type: BarLineType.END, userName: userNameForSymId(SymId.barlineFinal) },
    { type: BarLineType.END_START_REPEAT, userName: userNameForSymId(SymId.repeatRightLeft) },
    { type: BarLineType.DOTTED, userName: userNameForSymId(SymId.barlineDotted) },
    { type: BarLineType.REVERSE_END, userName: userNameForSymId(SymId.barlineReverseFinal) },
    { type: BarLineType.HEAVY, userName: userNameForSymId(SymId.barlineHeavy) },
    { type: BarLineType.DOUBLE_HEAVY, userName: userNameForSymId(SymId.barlineHeavyHeavy) },
]

/** ottava.h ottavaDefault[].userName */
const OTTAVA_USER_NAMES: Record<OttavaType, string> = {
    [OttavaType.OTTAVA_8VA]: '8va alta',
    [OttavaType.OTTAVA_8VB]: '8va bassa',
    [OttavaType.OTTAVA_15MA]: '15ma alta',
    [OttavaType.OTTAVA_15MB]: '15ma bassa',
    [OttavaType.OTTAVA_22MA]: '22ma alta',
    [OttavaType.OTTAVA_22MB]: '22ma bassa',
}

/** TConv::userName(ChordLineType, straight, wavy) (CHORDLINE_TYPES) */
function chordLineTypeName(t: ChordLineType, straight: boolean, wavy: boolean): string {
    const names: Record<number, [string, string, string]> = {
        [ChordLineType.FALL]: ['Fall', 'Slide out down', 'Slide out down (rough)'],
        [ChordLineType.DOIT]: ['Doit', 'Slide out up', 'Slide out up (rough)'],
        [ChordLineType.PLOP]: ['Plop', 'Slide in above', 'Slide in above (rough)'],
        [ChordLineType.SCOOP]: ['Scoop', 'Slide in below', 'Slide in below (rough)'],
    }
    return names[t]?.[wavy ? 2 : straight ? 1 : 0] ?? ''
}

/** Spacer::subtypeUserName */
function spacerUserName(t: SpacerType): string {
    switch (t) {
    case SpacerType.UP: return 'Staff spacer up'
    case SpacerType.DOWN: return 'Staff spacer down'
    case SpacerType.FIXED: return 'Staff spacer fixed down'
    }
    return 'Unknown spacer'
}

function pedal(beginHook: HookType | null, endHook: HookType, lineVisible = true): Pedal {
    const p = new Pedal(dummy())
    if (!lineVisible) {
        p.setLineVisible(false)
    }
    if (beginHook !== null) {
        p.setBeginHookType(beginHook)
    }
    p.setEndHookType(endHook)
    p.setBeginText(p.propertyDefault(Pid.BEGIN_TEXT) as string)
    p.setContinueText(p.propertyDefault(Pid.CONTINUE_TEXT) as string)
    p.setEndText(p.propertyDefault(Pid.END_TEXT) as string)
    return p
}

function volta(type: VoltaType, text: string, ending: number): Volta {
    const v = new Volta(dummy())
    v.setVoltaType(type)
    v.setText(text)
    v.setEndings([ending])
    return v
}

export class PaletteCreator {
    static newMasterPaletteTree(): PaletteTree {
        const tree = new PaletteTree()
        tree.append(PaletteCreator.newClefsPalette())
        tree.append(PaletteCreator.newKeySigPalette())
        tree.append(PaletteCreator.newTimePalette())
        tree.append(PaletteCreator.newTempoPalette())
        tree.append(PaletteCreator.newPitchPalette())
        tree.append(PaletteCreator.newAccidentalsPalette())
        tree.append(PaletteCreator.newDynamicsPalette())
        tree.append(PaletteCreator.newArticulationsPalette())
        tree.append(PaletteCreator.newTextPalette())
        tree.append(PaletteCreator.newKeyboardPalette())
        tree.append(PaletteCreator.newRepeatsPalette())
        tree.append(PaletteCreator.newBarLinePalette())
        tree.append(PaletteCreator.newLayoutPalette())
        tree.append(PaletteCreator.newBracketsPalette())
        tree.append(PaletteCreator.newOrnamentsPalette())
        tree.append(PaletteCreator.newBreathPalette())
        tree.append(PaletteCreator.newGraceNotePalette())
        tree.append(PaletteCreator.newNoteHeadsPalette())
        tree.append(PaletteCreator.newArpeggioPalette())
        tree.append(PaletteCreator.newTremoloPalette())
        tree.append(PaletteCreator.newHarpPalette())
        tree.append(PaletteCreator.newGuitarPalette())
        tree.append(PaletteCreator.newFingeringPalette())
        tree.append(PaletteCreator.newFretboardDiagramPalette())
        tree.append(PaletteCreator.newAccordionPalette())
        tree.append(PaletteCreator.newBagpipeEmbellishmentPalette())
        tree.append(PaletteCreator.newHandbellsPalette())
        tree.append(PaletteCreator.newBeamPalette())
        tree.append(PaletteCreator.newLinesPalette())
        return tree
    }

    static newDefaultPaletteTree(): PaletteTree {
        const tree = new PaletteTree()
        tree.append(PaletteCreator.newClefsPalette(true))
        tree.append(PaletteCreator.newKeySigPalette())
        tree.append(PaletteCreator.newTimePalette(true))
        tree.append(PaletteCreator.newTempoPalette(true))
        tree.append(PaletteCreator.newPitchPalette(true))
        tree.append(PaletteCreator.newAccidentalsPalette(true))
        tree.append(PaletteCreator.newDynamicsPalette(true))
        tree.append(PaletteCreator.newArticulationsPalette(true))
        tree.append(PaletteCreator.newTextPalette(true))
        tree.append(PaletteCreator.newKeyboardPalette())
        tree.append(PaletteCreator.newRepeatsPalette(true))
        tree.append(PaletteCreator.newBarLinePalette(true))
        tree.append(PaletteCreator.newLayoutPalette(true))
        tree.append(PaletteCreator.newBracketsPalette())
        tree.append(PaletteCreator.newOrnamentsPalette(true))
        tree.append(PaletteCreator.newBreathPalette(true))
        tree.append(PaletteCreator.newGraceNotePalette())
        tree.append(PaletteCreator.newNoteHeadsPalette())
        tree.append(PaletteCreator.newArpeggioPalette())
        tree.append(PaletteCreator.newTremoloPalette())
        tree.append(PaletteCreator.newHarpPalette())
        tree.append(PaletteCreator.newGuitarPalette(true))
        tree.append(PaletteCreator.newFingeringPalette(true))
        tree.append(PaletteCreator.newFretboardDiagramPalette(true))
        tree.append(PaletteCreator.newAccordionPalette())
        tree.append(PaletteCreator.newBagpipeEmbellishmentPalette())
        tree.append(PaletteCreator.newHandbellsPalette(true))
        tree.append(PaletteCreator.newBeamPalette())
        tree.append(PaletteCreator.newLinesPalette(true))
        return tree
    }

    static newBeamPalette(): Palette {
        const sp = new Palette(PaletteType.Beam)
        sp.setName('Beam properties')
        sp.setGridSize(35, 33)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        sp.appendActionIcon(ActionIconType.BEAM_AUTO, 'beam-auto').mag = 1.4
        sp.appendActionIcon(ActionIconType.BEAM_NONE, 'beam-none').mag = 1.4
        sp.appendActionIcon(ActionIconType.BEAM_BREAK_LEFT, 'beam-break-left').mag = 1.4
        sp.appendActionIcon(ActionIconType.BEAM_BREAK_INNER_8TH, 'beam-break-inner-8th').mag = 1.4
        sp.appendActionIcon(ActionIconType.BEAM_BREAK_INNER_16TH, 'beam-break-inner-16th').mag = 1.4
        sp.appendActionIcon(ActionIconType.BEAM_JOIN, 'beam-join').mag = 1.4

        sp.appendActionIcon(ActionIconType.BEAM_FEATHERED_DECELERATE, 'beam-feathered-decelerate')
        sp.appendActionIcon(ActionIconType.BEAM_FEATHERED_ACCELERATE, 'beam-feathered-accelerate')
        return sp
    }

    static newDynamicsPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Dynamic)
        sp.setName('Dynamics')
        sp.setGridSize(defaultPalette ? 50 : 60, 28)
        sp.setDrawGrid(true)

        const defaultDynamics = [
            'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff',
            'fp', 'pf', 'sf', 'sfz', 'sff', 'sffz', 'sfp',
            'rfz', 'rf', 'fz',
        ]
        const masterDynamics = [
            'pppppp', 'ppppp', 'pppp',
            'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff',
            'ffff', 'fffff', 'ffffff',
            'fp', 'pf', 'sf', 'sfz', 'sff', 'sffz', 'sfff', 'sfffz',
            'sfp', 'sfpp', 'rfz', 'rf', 'fz', 'm', 'r', 's', 'z', 'n',
        ]
        for (const dynamicType of defaultPalette ? defaultDynamics : masterDynamics) {
            const dynamic = make<Dynamic>(ElementType.DYNAMIC, dummy().segment())
            dynamic.setDynamicType(dynamicType)
            sp.appendElement(dynamic, TConv.userNameDynamicType(dynamic.dynamicType()).str)
        }

        const hairpins = [HairpinType.CRESC_LINE, HairpinType.DIM_LINE, HairpinType.CRESC_HAIRPIN, HairpinType.DIM_HAIRPIN]
        for (const hairpinType of hairpins) {
            const hairpin = new Hairpin(dummy())
            hairpin.setHairpinType(hairpinType)
            const mag = (hairpinType === HairpinType.CRESC_LINE || hairpinType === HairpinType.DIM_LINE) ? 1 : 0.9
            const offset = hairpinType === HairpinType.CRESC_LINE ? { x: 1, y: 0.25 }
                : hairpinType === HairpinType.DIM_LINE ? { x: 1, y: 0.0 } : { x: 0, y: 0 }
            sp.appendElement(hairpin, hairpin.subtypeUserName().str, mag, offset)
        }
        return sp
    }

    static newKeySigPalette(): Palette {
        const sp = new Palette(PaletteType.KeySig)
        sp.setName('Key signatures')
        sp.setMag(0.8)
        sp.setGridSize(56, 47)
        sp.setDrawGrid(true)
        sp.setYOffset(1.0)

        for (let i = 0; i < 7; ++i) {
            const k = make<KeySig>(ElementType.KEYSIG, dummy().segment())
            k.setKey((i + 1) as Key)
            sp.appendElement(k, TConv.userNameKey(i + 1, false, false).str)
        }
        for (let i = -7; i < 0; ++i) {
            const k = make<KeySig>(ElementType.KEYSIG, dummy().segment())
            k.setKey(i as Key)
            sp.appendElement(k, TConv.userNameKey(i, false, false).str)
        }
        const k = make<KeySig>(ElementType.KEYSIG, dummy().segment())
        k.setKey(Key.C)
        sp.appendElement(k, TConv.userNameKey(Key.C, false, false).str)

        // atonal key signature
        const nke = new KeySigEvent()
        nke.setConcertKey(Key.C)
        nke.setCustom(true)
        nke.setMode(KeyMode.NONE)
        const nk = make<KeySig>(ElementType.KEYSIG, dummy().segment())
        nk.setKeySigEvent(nke)
        sp.appendElement(nk, TConv.userNameKey(Key.C, true, false).str)
        return sp
    }

    static newAccidentalsPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Accidental)
        sp.setName('Accidentals')
        sp.setGridSize(33, 36)
        sp.setDrawGrid(true)

        const end = defaultPalette ? AccidentalType.SHARP3 : AccidentalType.END
        for (let i = AccidentalType.FLAT; i < end; ++i) {
            const ac = make<Accidental>(ElementType.ACCIDENTAL)
            ac.setAccidentalType(i)
            if (ac.symId() !== SymId.noSym) {
                sp.appendElement(ac, ac.subtypeUserName().str)
            }
        }

        if (!defaultPalette) {
            sp.appendActionIcon(ActionIconType.PARENTHESES, 'add-parentheses')
            sp.appendActionIcon(ActionIconType.BRACKETS, 'add-brackets')
        }
        return sp
    }

    static newBarLinePalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.BarLine)
        sp.setName('Barlines')
        sp.setMag(0.8)
        sp.setGridSize(48, 38)
        sp.setDrawGrid(true)

        // bar line styles
        for (const bti of BAR_LINE_TABLE) {
            const b = make<BarLine>(ElementType.BAR_LINE, dummy().segment())
            b.setBarLineType(bti.type)
            sp.appendElement(b, bti.userName)
        }

        // bar line spans
        if (!defaultPalette) {
            // BARLINE_SPAN_TICK1_FROM ... (barline.h)
            const spans = [
                { from: -1, to: -7, userName: userNameForSymId(SymId.barlineTick) },
                { from: -2, to: -6, userName: 'Tick barline 2' }, // Not in SMuFL
                { from: 2, to: -2, userName: userNameForSymId(SymId.barlineShort) },
                { from: 1, to: -1, userName: 'Short barline 2' }, // Not in SMuFL
            ]
            for (const span of spans) {
                const b = make<BarLine>(ElementType.BAR_LINE, dummy().segment())
                b.setBarLineType(BarLineType.NORMAL)
                b.setSpanFrom(span.from)
                b.setSpanTo(span.to)
                sp.appendElement(b, span.userName)
            }
        }
        return sp
    }

    static newRepeatsPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Repeat)
        sp.setName('Repeats & jumps')
        sp.setMag(0.75)
        sp.setGridSize(100, 28)
        sp.setDrawGrid(true)

        const defaultMeasureRepeats = [{ id: SymId.repeat1Bar, measuresCount: 1 }]
        const masterMeasureRepeats = [
            { id: SymId.repeat1Bar, measuresCount: 1 },
            { id: SymId.repeat2Bars, measuresCount: 2 },
            { id: SymId.repeat4Bars, measuresCount: 4 },
        ]
        for (const repeat of defaultPalette ? defaultMeasureRepeats : masterMeasureRepeats) {
            const rm = new MeasureRepeat(dummy().segment())
            rm.mutldata().symId = repeat.id
            rm.setNumMeasures(repeat.measuresCount)
            sp.appendElement(rm, userNameForSymId(repeat.id))
        }

        const defaultMarkers = [MarkerType.SEGNO, MarkerType.CODA, MarkerType.FINE, MarkerType.TOCODA, MarkerType.TOCODASYM]
        const allMarkers = [
            MarkerType.SEGNO, MarkerType.VARSEGNO, MarkerType.CODA, MarkerType.VARCODA, MarkerType.CODETTA, MarkerType.FINE,
            MarkerType.TOCODA, MarkerType.TOCODASYM, MarkerType.DA_CODA, MarkerType.DA_DBLCODA, MarkerType.USER,
        ]
        for (const markerType of defaultPalette ? defaultMarkers : allMarkers) {
            if (markerType === MarkerType.CODETTA || markerType === MarkerType.USER) { // Codetta not in SMuFL
                continue
            }
            const mk = new Marker(dummy().measure())
            mk.setMarkerType(markerType)
            mk.styleChanged()
            sp.appendElement(mk, TConv.userNameMarkerType(markerType).str)
        }

        const defaultJumpTypeTable = jumpTypeTable.slice(0, 6)
        for (const item of defaultPalette ? defaultJumpTypeTable : jumpTypeTable) {
            const jp = new Jump(dummy().measure())
            jp.setJumpType(item.type)
            sp.appendElement(jp, TConv.userNameJumpType(item.type).str)
        }

        for (const bti of BAR_LINE_TABLE) {
            if (bti.type !== BarLineType.START_REPEAT && bti.type !== BarLineType.END_REPEAT && bti.type !== BarLineType.END_START_REPEAT) {
                continue
            }
            const b = make<BarLine>(ElementType.BAR_LINE, dummy().segment())
            b.setBarLineType(bti.type)
            const cell = sp.appendElement(b, bti.userName)
            cell.drawStaff = false
        }

        sp.appendElement(volta(VoltaType.CLOSED, '1.', 1), 'Prima volta')
        sp.appendElement(volta(VoltaType.OPEN, '2.', 2), 'Seconda volta, open')
        sp.appendElement(volta(VoltaType.CLOSED, '2.', 2), 'Seconda volta')
        sp.appendElement(volta(VoltaType.CLOSED, '3.', 3), 'Terza volta')

        if (!defaultPalette) {
            for (const t of [VibratoType.VIBRATO_SAWTOOTH, VibratoType.VIBRATO_SAWTOOTH_WIDE]) {
                const vibrato = new Vibrato(dummy())
                vibrato.setVibratoType(t)
                sp.appendElement(vibrato, userName(VIBRATO_TYPES, t))
            }
        }
        return sp
    }

    static newLayoutPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Layout)
        sp.setName('Layout')
        sp.setGridSize(42, 36)
        sp.setDrawGrid(true)

        for (const layoutBreakType of [LayoutBreakType.LINE, LayoutBreakType.PAGE, LayoutBreakType.SECTION]) {
            const lb = make<LayoutBreak>(ElementType.LAYOUT_BREAK, dummy().measure())
            lb.setLayoutBreakType(layoutBreakType)
            sp.appendElement(lb, TConv.userNameLayoutBreakType(layoutBreakType).str)
        }
        if (!defaultPalette) {
            const lb = make<LayoutBreak>(ElementType.LAYOUT_BREAK, dummy().measure())
            lb.setLayoutBreakType(LayoutBreakType.NOBREAK)
            sp.appendElement(lb, TConv.userNameLayoutBreakType(LayoutBreakType.NOBREAK).str)
        }

        sp.appendActionIcon(ActionIconType.SYSTEM_LOCK, 'toggle-system-lock')

        for (const spacerType of [SpacerType.DOWN, SpacerType.UP, SpacerType.FIXED]) {
            const spacer = make<Spacer>(ElementType.SPACER, dummy().measure())
            spacer.setSpacerType(spacerType)
            spacer.setGap(new Spatium(3))
            const cell = sp.appendElement(spacer, spacerUserName(spacerType))
            cell.mag = 0.7
        }

        sp.appendActionIcon(ActionIconType.VFRAME, 'insert-vbox', FRAME_MAG)
        sp.appendActionIcon(ActionIconType.HFRAME, 'insert-hbox', FRAME_MAG)
        sp.appendActionIcon(ActionIconType.TFRAME, 'insert-textframe', FRAME_MAG)
        sp.appendActionIcon(ActionIconType.FFRAME, 'insert-fretframe', FRAME_MAG)
        sp.appendActionIcon(ActionIconType.STAFF_TYPE_CHANGE, 'insert-staff-type-change')
        sp.appendActionIcon(ActionIconType.MEASURE, 'insert-measure')
        return sp
    }

    private static fingering(text: string, style: TextStyleType | null, init = false): Fingering {
        const f = make<Fingering>(ElementType.FINGERING, dummy().note())
        if (style !== null) {
            if (init) {
                f.initTextStyleType(style)
            } else {
                f.setTextStyleType(style)
            }
        }
        f.setXmlText(text)
        return f
    }

    private static appendGuitarFingerings(sp: Palette, defaultPalette: boolean): void {
        for (const c of 'pimac') {
            sp.appendElement(PaletteCreator.fingering(c, TextStyleType.RH_GUITAR_FINGERING), 'RH guitar fingering %1')
        }
        for (const c of '012345T') {
            sp.appendElement(PaletteCreator.fingering(c, TextStyleType.LH_GUITAR_FINGERING), 'LH guitar fingering %1')
        }
        for (const c of defaultPalette ? '123456' : '0123456789') {
            sp.appendElement(PaletteCreator.fingering(c, TextStyleType.STRING_NUMBER, true), 'String number %1')
        }
    }

    private static articulation(sym: SymId): Articulation {
        const s = make<Articulation>(ElementType.ARTICULATION, dummy().chord())
        s.setSymId(sym)
        return s
    }

    static newFingeringPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Fingering)
        sp.setName('Fingerings')
        sp.setMag(1.5)
        sp.setGridSize(28, 30)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        for (const c of '012345') {
            sp.appendElement(PaletteCreator.fingering(c, null), 'Fingering %1')
        }
        PaletteCreator.appendGuitarFingerings(sp, defaultPalette)

        const defaultLute = [SymId.stringsThumbPosition]
        const masterLute = [
            SymId.stringsThumbPosition,
            SymId.luteFingeringRHThumb, SymId.luteFingeringRHFirst,
            SymId.luteFingeringRHSecond, SymId.luteFingeringRHThird,
        ]
        // include additional symbol-based fingerings (temporarily?) implemented as articulations
        for (const i of defaultPalette ? defaultLute : masterLute) {
            const s = PaletteCreator.articulation(i)
            sp.appendElement(s, s.subtypeUserName().str)
        }
        return sp
    }

    static newTremoloPalette(): Palette {
        const sp = new Palette(PaletteType.Tremolo)
        sp.setName('Tremolos')
        sp.setGridSize(27, 40)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        for (let i = TremoloType.R8; i <= TremoloType.BUZZ_ROLL; ++i) {
            const tremolo = make<TremoloSingleChord>(ElementType.TREMOLO_SINGLECHORD, dummy().chord())
            tremolo.setTremoloType(i)
            sp.appendElement(tremolo, tremolo.subtypeUserName().str)
        }
        for (let i = TremoloType.C8; i <= TremoloType.C64; ++i) {
            const tremolo = make<TremoloTwoChord>(ElementType.TREMOLO_TWOCHORD, dummy().chord())
            tremolo.setTremoloType(i)
            sp.appendElement(tremolo, tremolo.subtypeUserName().str)
        }

        // include additional symbol-based tremolo articulations, implemented as articulations
        for (const i of [SymId.tremoloDivisiDots2, SymId.tremoloDivisiDots3, SymId.tremoloDivisiDots4, SymId.tremoloDivisiDots6]) {
            const s = PaletteCreator.articulation(i)
            sp.appendElement(s, s.subtypeUserName().str)
        }
        return sp
    }

    static newNoteHeadsPalette(): Palette {
        const sp = new Palette(PaletteType.NoteHead)
        sp.setName('Noteheads')
        sp.setMag(1.3)
        sp.setGridSize(33, 36)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        for (let i = 0; i < NoteHeadGroup.HEAD_DO_WALKER; ++i) {
            // HEAD_BREVIS_ALT shows up only for brevis value
            const sym = Note.noteHeadSym(0, i, i === NoteHeadGroup.HEAD_BREVIS_ALT ? NoteHeadType.HEAD_BREVIS : NoteHeadType.HEAD_HALF)
            const nh = new NoteHead(dummy().note())
            nh.setSym(sym)
            sp.appendElement(nh, TConv.userNameNoteHeadGroup(i).str)
        }

        sp.appendActionIcon(ActionIconType.PARENTHESES, 'add-parentheses')
        return sp
    }

    static newArticulationsPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Articulation)
        sp.setName('Articulations')
        sp.setGridSize(42, 25)
        sp.setDrawGrid(true)

        const slur = make<Slur>(ElementType.SLUR)
        sp.appendElement(slur, 'Slur')

        // do not include additional symbol-based fingerings (temporarily?) implemented as articulations
        const defaultArticulations = [
            SymId.articAccentAbove,
            SymId.articStaccatoAbove,
            SymId.articStaccatissimoAbove,
            SymId.articTenutoAbove,
            SymId.articTenutoStaccatoAbove,
            SymId.articMarcatoAbove,
            SymId.articAccentStaccatoAbove,
            SymId.articMarcatoStaccatoAbove,
            SymId.articMarcatoTenutoAbove,
            SymId.articStaccatissimoStrokeAbove,
            SymId.articStaccatissimoWedgeAbove,
            SymId.articStressAbove,
            SymId.articTenutoAccentAbove,
            SymId.articUnstressAbove,
            SymId.brassMuteOpen,
            SymId.brassMuteClosed,
            SymId.stringsHarmonic,
            SymId.stringsUpBow,
            SymId.stringsDownBow,
        ]
        const masterArticulations = [
            SymId.articAccentAbove,
            SymId.articStaccatoAbove,
            SymId.articStaccatissimoAbove,
            SymId.articTenutoAbove,
            SymId.articTenutoStaccatoAbove,
            SymId.articMarcatoAbove,
            SymId.articAccentStaccatoAbove,
            SymId.articMarcatoStaccatoAbove,
            SymId.articMarcatoTenutoAbove,
            SymId.articStaccatissimoStrokeAbove,
            SymId.articStaccatissimoWedgeAbove,
            SymId.articStressAbove,
            SymId.articTenutoAccentAbove,
            SymId.articUnstressAbove,

            SymId.articSoftAccentAbove, // supplemental articulations
            SymId.articSoftAccentStaccatoAbove,
            SymId.articSoftAccentTenutoAbove,
            SymId.articSoftAccentTenutoStaccatoAbove,

            SymId.guitarFadeIn,
            SymId.guitarFadeOut,
            SymId.guitarVolumeSwell,
            SymId.wiggleSawtooth,
            SymId.wiggleSawtoothWide,
            SymId.wiggleVibratoLargeFaster,
            SymId.wiggleVibratoLargeSlowest,
            SymId.brassMuteOpen,
            SymId.brassMuteClosed,
            SymId.stringsHarmonic,
            SymId.stringsUpBow,
            SymId.stringsDownBow,
            SymId.pluckedSnapPizzicatoAbove,
            SymId.pictHalfOpen2,
        ]
        for (const articulationType of defaultPalette ? defaultArticulations : masterArticulations) {
            const artic = PaletteCreator.articulation(articulationType)
            sp.appendElement(artic, artic.subtypeUserName().str)
        }
        return sp
    }

    static newOrnamentsPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Ornament)
        sp.setName('Ornaments')
        sp.setGridSize(73, 27)
        sp.setMag(1)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        const defaultOrnaments = [
            SymId.ornamentTurn, SymId.ornamentTurnInverted, SymId.ornamentTrill, SymId.ornamentShortTrill, SymId.ornamentMordent,
        ]
        const masterOrnaments = [
            SymId.ornamentTurn,
            SymId.ornamentTurnInverted,
            SymId.ornamentTurnSlash,
            SymId.ornamentTurnUp,
            SymId.ornamentTurnUpS,
            SymId.ornamentTrill,
            SymId.ornamentShortTrill,
            SymId.ornamentMordent,
            SymId.ornamentHaydn,
            SymId.ornamentTremblement,
            SymId.ornamentPrallMordent,
            SymId.ornamentUpPrall,
            SymId.ornamentPrecompMordentUpperPrefix, // SymId::ornamentDownPrall,
            SymId.ornamentUpMordent,
            SymId.ornamentDownMordent,
            SymId.ornamentPrallDown,
            SymId.ornamentPrallUp,
            SymId.ornamentLinePrall,
            SymId.ornamentPrecompSlide,
            SymId.ornamentShake3,
            SymId.ornamentShakeMuffat1,
            SymId.ornamentTremblementCouperin,
            SymId.ornamentPinceCouperin,
        ]
        for (const ornamentType of defaultPalette ? defaultOrnaments : masterOrnaments) {
            const ornament = make<Ornament>(ElementType.ORNAMENT, dummy().chord())
            ornament.setSymId(ornamentType)
            const mag = ornament.symId() === SymId.ornamentTrill ? 1.0 : 1.2
            sp.appendElement(ornament, ornament.subtypeUserName().str, mag)
        }

        for (const trillType of [TrillType.TRILL_LINE, TrillType.UPPRALL_LINE, TrillType.DOWNPRALL_LINE, TrillType.PRALLPRALL_LINE]) {
            const trill = new Trill(dummy())
            trill.setTrillType(trillType)
            const mag = (trillType === TrillType.TRILL_LINE || trillType === TrillType.PRALLPRALL_LINE) ? 1.0 : 0.8
            sp.appendElement(trill, TConv.userNameTrillType(trillType).str, mag)
        }
        return sp
    }

    static newAccordionPalette(): Palette {
        const sp = new Palette(PaletteType.Accordion)
        sp.setName('Accordion')
        sp.setGridSize(42, 25)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        const art = [
            SymId.accdnCombDot,
            SymId.accdnCombLH2RanksEmpty,
            SymId.accdnCombLH3RanksEmptySquare,
            SymId.accdnCombRH3RanksEmpty,
            SymId.accdnCombRH4RanksEmpty,
            SymId.accdnDiatonicClef,
            SymId.accdnLH2Ranks16Round,
            SymId.accdnLH2Ranks8Plus16Round,
            SymId.accdnLH2Ranks8Round,
            SymId.accdnLH2RanksFullMasterRound,

            SymId.accdnLH2RanksMasterPlus16Round,
            SymId.accdnLH2RanksMasterRound,
            SymId.accdnLH3Ranks2Plus8Square,
            SymId.accdnLH3Ranks2Square,
            SymId.accdnLH3Ranks8Square,
            SymId.accdnLH3RanksDouble8Square,
            SymId.accdnLH3RanksTuttiSquare,
            SymId.accdnPull,
            SymId.accdnPush,
            SymId.accdnRH3RanksAccordion,

            SymId.accdnRH3RanksAuthenticMusette,
            SymId.accdnRH3RanksBandoneon,
            SymId.accdnRH3RanksBassoon,
            SymId.accdnRH3RanksClarinet,
            SymId.accdnRH3RanksDoubleTremoloLower8ve,
            SymId.accdnRH3RanksDoubleTremoloUpper8ve,
            SymId.accdnRH3RanksFullFactory,
            SymId.accdnRH3RanksHarmonium,
            SymId.accdnRH3RanksImitationMusette,
            SymId.accdnRH3RanksLowerTremolo8,

            SymId.accdnRH3RanksMaster,
            SymId.accdnRH3RanksOboe,
            SymId.accdnRH3RanksOrgan,
            SymId.accdnRH3RanksPiccolo,
            SymId.accdnRH3RanksTremoloLower8ve,
            SymId.accdnRH3RanksTremoloUpper8ve,
            SymId.accdnRH3RanksTwoChoirs,
            SymId.accdnRH3RanksUpperTremolo8,
            SymId.accdnRH3RanksViolin,
            SymId.accdnRH4RanksAlto,

            SymId.accdnRH4RanksBassAlto,
            SymId.accdnRH4RanksMaster,
            SymId.accdnRH4RanksSoftBass,
            SymId.accdnRH4RanksSoftTenor,
            SymId.accdnRH4RanksSoprano,
            SymId.accdnRH4RanksTenor,
            SymId.accdnRicochet2,
            SymId.accdnRicochet3,
            SymId.accdnRicochet4,
            SymId.accdnRicochet5,

            SymId.accdnRicochet6,
            SymId.accdnRicochetStem2,
            SymId.accdnRicochetStem3,
            SymId.accdnRicochetStem4,
            SymId.accdnRicochetStem5,
            SymId.accdnRicochetStem6,
        ]
        for (const i of art) {
            const s = new SymbolItem(dummy())
            s.setSym(i)
            sp.appendElement(s, userNameForSymId(i))
        }
        return sp
    }

    private static s_bracketItemOwner: ReturnType<typeof Factory.createStaff> | null = null

    static newBracketsPalette(): Palette {
        const sp = new Palette(PaletteType.Bracket)
        sp.setName('Brackets')
        sp.setMag(0.7)
        sp.setGridSize(40, 60)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        const types: [BracketType, string][] = [
            [BracketType.NORMAL, 'Bracket'],
            [BracketType.BRACE, 'Brace'],
            [BracketType.SQUARE, 'Square'],
            [BracketType.LINE, 'Line'],
        ]

        if (!PaletteCreator.s_bracketItemOwner) {
            const bracketItemOwnerPart = new Part(score())
            PaletteCreator.s_bracketItemOwner = Factory.createStaff(bracketItemOwnerPart)
        }
        const bracketItemOwner = PaletteCreator.s_bracketItemOwner
        bracketItemOwner.setBracketType(types.length - 1, BracketType.NORMAL)

        for (let i = 0; i < types.length; ++i) {
            const b1 = make<Bracket>(ElementType.BRACKET)
            const bi1 = bracketItemOwner.brackets()[i]
            bi1.setBracketType(types[i][0])
            b1.setBracketItem(bi1)
            sp.appendElement(b1, types[i][1]) // Bracket, Brace, Square, Line
        }
        return sp
    }

    static newBreathPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Breath)
        sp.setName('Breaths & pauses')
        sp.setGridSize(40, 40)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        // Fermatas
        const defaultFermatas = [SymId.fermataAbove, SymId.fermataShortAbove, SymId.fermataLongAbove]
        const masterFermatas = [
            SymId.fermataAbove,
            SymId.fermataShortAbove,
            SymId.fermataLongAbove,
            SymId.fermataLongHenzeAbove,
            SymId.fermataShortHenzeAbove,
            SymId.fermataVeryLongAbove,
            SymId.fermataVeryShortAbove,
        ]
        for (const i of defaultPalette ? defaultFermatas : masterFermatas) {
            const f = make<Fermata>(ElementType.FERMATA, dummy().segment())
            f.setSymIdAndTimeStretch(i)
            sp.appendElement(f, f.subtypeUserName().str)
        }

        // Breaths
        for (const breath of Breath.BREATH_LIST) {
            if ((breath.id === SymId.chantCaesura || breath.id === SymId.caesuraSingleStroke) && defaultPalette) {
                continue
            }
            const a = make<Breath>(ElementType.BREATH, dummy().segment())
            a.setSymId(breath.id)
            a.setPause(breath.pause)
            sp.appendElement(a, userNameForSymId(breath.id))
        }
        return sp
    }

    static newArpeggioPalette(): Palette {
        const sp = new Palette(PaletteType.Arpeggio)
        sp.setName('Arpeggios & glissandos')
        sp.setGridSize(42, 44)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        for (let i = 0; i < 6; ++i) {
            if (i === ArpeggioType.BRACKET) {
                // Deprecated, now handled by CHORD_BRACKET
                continue
            }
            const a = make<Arpeggio>(ElementType.ARPEGGIO, dummy().chord())
            a.setArpeggioType(i)
            sp.appendElement(a, userName(ARPEGGIO_TYPES, i as ArpeggioType))
        }

        for (let i = 0; i < 2; ++i) {
            const a = new Glissando(dummy())
            a.setGlissandoType(i)
            if (a.glissandoType() !== (a.style().styleV(Sid.glissandoType) as GlissandoType)) {
                a.setPropertyFlags(Pid.GLISS_TYPE, PropertyFlags.UNSTYLED)
            }
            sp.appendElement(a, userName(GLISSANDO_TYPES, i as GlissandoType))
        }

        // fall and doits
        const chordLineTypes = [ChordLineType.FALL, ChordLineType.DOIT, ChordLineType.PLOP, ChordLineType.SCOOP]
        for (const [straight, wavy] of [[false, false], [true, false], [true, true]]) {
            for (const chordLineType of chordLineTypes) {
                const cl = make<ChordLine>(ElementType.CHORDLINE, dummy().chord())
                cl.setChordLineType(chordLineType)
                if (straight) {
                    cl.setStraight(true)
                }
                if (wavy) {
                    cl.setWavy(true)
                }
                sp.appendElement(cl, chordLineTypeName(chordLineType, straight, wavy))
            }
        }
        return sp
    }

    static newClefsPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Clef)
        sp.setName('Clefs')
        sp.setMag(0.8)
        sp.setGridSize(36, 55)
        sp.setDrawGrid(true)
        sp.setYOffset(1.0)

        const clefsDefault = [
            ClefType.G, ClefType.G8_VA, ClefType.G15_MA, ClefType.G8_VB, ClefType.C3,
            ClefType.C4, ClefType.F, ClefType.F_8VA,
            ClefType.F8_VB, ClefType.PERC, ClefType.TAB, ClefType.TAB4,
        ]
        const clefsMaster = [
            ClefType.G, ClefType.G8_VA, ClefType.G15_MA, ClefType.G8_VB, ClefType.G15_MB, ClefType.G8_VB_O,
            ClefType.G8_VB_C, ClefType.G8_VB_P, ClefType.G_1, ClefType.C1, ClefType.C2, ClefType.C3,
            ClefType.C4, ClefType.C4_8VB, ClefType.C5, ClefType.C_19C, ClefType.C1_F18C, ClefType.C3_F18C, ClefType.C4_F18C,
            ClefType.C1_F20C, ClefType.C3_F20C, ClefType.C4_F20C,
            ClefType.F, ClefType.F_8VA, ClefType.F_15MA,
            ClefType.F8_VB, ClefType.F15_MB, ClefType.F_B, ClefType.F_C, ClefType.F_F18C, ClefType.F_19C,
            ClefType.PERC,
            ClefType.PERC2, ClefType.TAB, ClefType.TAB4, ClefType.TAB_SERIF, ClefType.TAB4_SERIF,
        ]
        for (const clefType of defaultPalette ? clefsDefault : clefsMaster) {
            const clef = make<Clef>(ElementType.CLEF, dummy().segment())
            clef.setClefType(clefType)
            sp.appendElement(clef, TConv.userNameClefType(clefType).str)
        }
        return sp
    }

    static newGraceNotePalette(): Palette {
        const sp = new Palette(PaletteType.GraceNote)
        sp.setName('Grace notes')
        sp.setMag(1.35)
        sp.setGridSize(45, 40)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        sp.appendActionIcon(ActionIconType.ACCIACCATURA, 'acciaccatura')
        sp.appendActionIcon(ActionIconType.APPOGGIATURA, 'appoggiatura')
        sp.appendActionIcon(ActionIconType.GRACE4, 'grace4')
        sp.appendActionIcon(ActionIconType.GRACE16, 'grace16')
        sp.appendActionIcon(ActionIconType.GRACE32, 'grace32')
        sp.appendActionIcon(ActionIconType.GRACE8_AFTER, 'grace8after')
        sp.appendActionIcon(ActionIconType.GRACE16_AFTER, 'grace16after')
        sp.appendActionIcon(ActionIconType.GRACE32_AFTER, 'grace32after')
        return sp
    }

    static newBagpipeEmbellishmentPalette(): Palette {
        const sp = new Palette(PaletteType.BagpipeEmbellishment)
        sp.setName('Bagpipe embellishments')
        sp.setMag(0.8)
        sp.setYOffset(2.0)
        sp.setGridSize(55, 72)
        sp.setDrawGrid(true)
        sp.setVisible(false)
        for (let i = 0; i < TConv.embellishmentsCount(); ++i) {
            const b = new BagpipeEmbellishment(dummy())
            b.setEmbelType(i)
            // TODO: pass TranslatableString
            sp.appendElement(b, TConv.userNameEmbellishmentType(i).str)
        }

        return sp
    }

    static newLinesPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Line)
        sp.setName('Lines')
        sp.setMag(0.8)
        sp.setGridSize(75, 28)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        const slur = make<Slur>(ElementType.SLUR)
        sp.appendElement(slur, 'Slur')

        for (const hairpinType of [HairpinType.CRESC_HAIRPIN, HairpinType.DIM_HAIRPIN, HairpinType.CRESC_LINE, HairpinType.DIM_LINE]) {
            const hairpin = new Hairpin(dummy())
            hairpin.setHairpinType(hairpinType)
            sp.appendElement(hairpin, hairpin.subtypeUserName().str)
        }

        sp.appendElement(volta(VoltaType.CLOSED, '1.', 1), 'Prima volta')
        if (!defaultPalette) {
            sp.appendElement(volta(VoltaType.CLOSED, '2.', 2), 'Seconda volta')
            sp.appendElement(volta(VoltaType.CLOSED, '3.', 3), 'Terza volta')
        }
        sp.appendElement(volta(VoltaType.OPEN, '2.', 2), 'Seconda volta, open')

        const ottavasDefault = [OttavaType.OTTAVA_8VA, OttavaType.OTTAVA_8VB, OttavaType.OTTAVA_15MA]
        const ottavasMaster = [
            OttavaType.OTTAVA_8VA, OttavaType.OTTAVA_8VB, OttavaType.OTTAVA_15MA, OttavaType.OTTAVA_15MB,
            OttavaType.OTTAVA_22MA, OttavaType.OTTAVA_22MB,
        ]
        for (const ottavaType of defaultPalette ? ottavasDefault : ottavasMaster) {
            const ottava = new Ottava(dummy())
            ottava.setOttavaType(ottavaType)
            ottava.styleChanged()
            sp.appendElement(ottava, OTTAVA_USER_NAMES[ottavaType])
        }

        sp.appendElement(pedal(null, HookType.HOOK_90), 'Pedal (with ped and line)')
        sp.appendElement(pedal(null, HookType.ROSETTE, false), 'Pedal (with ped and asterisk)')
        sp.appendElement(pedal(HookType.HOOK_90, HookType.HOOK_90), 'Pedal (straight hooks)')
        if (!defaultPalette) {
            sp.appendElement(pedal(HookType.HOOK_90, HookType.HOOK_45), 'Pedal (angled end hook)')
            sp.appendElement(pedal(HookType.HOOK_45, HookType.HOOK_45), 'Pedal (both hooks angled)')
            sp.appendElement(pedal(HookType.HOOK_45, HookType.HOOK_90), 'Pedal (angled start hook)')
        }

        const trillTypes = [TrillType.TRILL_LINE, TrillType.UPPRALL_LINE, TrillType.DOWNPRALL_LINE, TrillType.PRALLPRALL_LINE]
        const defaultTrills = [TrillType.TRILL_LINE, TrillType.DOWNPRALL_LINE, TrillType.PRALLPRALL_LINE]
        for (const trillType of defaultPalette ? defaultTrills : trillTypes) {
            const trill = new Trill(dummy())
            trill.setTrillType(trillType)
            sp.appendElement(trill, TConv.userNameTrillType(trillType).str)
        }

        const staffTextLine = new TextLine(dummy())
        staffTextLine.setBeginText('Staff')
        staffTextLine.setEndHookType(HookType.HOOK_90)
        sp.appendElement(staffTextLine, 'Staff text line')

        sp.appendElement(PaletteCreator.systemTextLine(), 'System text line')

        if (!defaultPalette) {
            const textLine = new TextLine(dummy())
            textLine.setBeginText('VII')
            textLine.setEndHookType(HookType.HOOK_90)
            sp.appendElement(textLine, 'Text line')
        }

        const line = new TextLine(dummy())
        line.setDiagonal(true)
        sp.appendElement(line, 'Line')

        const rightArrowLine = new TextLine(dummy())
        rightArrowLine.setDiagonal(true)
        rightArrowLine.setEndHookType(HookType.ARROW)
        sp.appendElement(rightArrowLine, 'Line (right arrowhead)')

        const leftArrowLine = new TextLine(dummy())
        leftArrowLine.setDiagonal(true)
        leftArrowLine.setBeginHookType(HookType.ARROW)
        sp.appendElement(leftArrowLine, 'Line (left arrowhead)')

        sp.appendActionIcon(ActionIconType.NOTE_ANCHORED_LINE, 'add-noteline', 2)

        sp.appendElement(new Ambitus(dummy().segment()), 'Ambitus')
        sp.appendElement(new LetRing(dummy()), 'Let ring')

        const vibratoTable = [
            VibratoType.GUITAR_VIBRATO, VibratoType.GUITAR_VIBRATO_WIDE, VibratoType.VIBRATO_SAWTOOTH, VibratoType.VIBRATO_SAWTOOTH_WIDE,
        ]
        const defaultVibratoTable = [VibratoType.GUITAR_VIBRATO, VibratoType.VIBRATO_SAWTOOTH]
        for (const vibratoType of defaultPalette ? defaultVibratoTable : vibratoTable) {
            const vibrato = new Vibrato(dummy())
            vibrato.setVibratoType(vibratoType)
            sp.appendElement(vibrato, userName(VIBRATO_TYPES, vibratoType))
        }

        sp.appendElement(new PalmMute(dummy()), 'Palm mute')

        // TODO(port): ChordBracket ("Chord bracket", "... (play with left hand)", "... (play with right hand)")
        return sp
    }

    private static systemTextLine(): TextLine {
        const systemTextLine = new TextLine(dummy(), true)
        SingleLayout.setLineLength(systemTextLine, 12 * score().style().spatium())
        systemTextLine.setBeginText('System')
        systemTextLine.setEndHookType(HookType.HOOK_90)
        return systemTextLine
    }

    static newTempoPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Tempo)
        sp.setName('Tempo')
        sp.setMag(0.65)
        sp.setGridSize(90, 30)
        sp.setDrawGrid(true)

        interface TempoPattern {
            pattern: string
            name: string
            f: number
            relative: boolean
            italian: boolean
            followText: boolean
            basic: boolean
            masterOnly: boolean
        }
        const tp = (pattern: string, name: string, f: number, relative: boolean, italian: boolean, followText: boolean,
            basic: boolean, masterOnly: boolean): TempoPattern => ({ pattern, name, f, relative, italian, followText, basic, masterOnly })

        const tps: TempoPattern[] = [
            tp('<sym>metNoteHalfUp</sym> = 80', 'Half note = 80 BPM', 80.0 / 30.0, false, false, true, true, false),
            tp('<sym>metNoteQuarterUp</sym> = 80', 'Quarter note = 80 BPM', 80.0 / 60.0, false, false, true, true, false),
            tp('<sym>metNote8thUp</sym> = 80', 'Eighth note = 80 BPM', 80.0 / 120.0, false, false, true, true, false),
            tp('<sym>metNoteHalfUp</sym><sym>space</sym><sym>metAugmentationDot</sym> = 80', 'Dotted half note = 80 BPM',
                120 / 30.0, false, false, true, false, false),
            tp('<sym>metNoteQuarterUp</sym><sym>space</sym><sym>metAugmentationDot</sym> = 80', 'Dotted quarter note = 80 BPM',
                120 / 60.0, false, false, true, true, false),
            tp('<sym>metNote8thUp</sym><sym>space</sym><sym>metAugmentationDot</sym> = 80', 'Dotted eighth note = 80 BPM',
                120 / 120.0, false, false, true, false, false),

            tp('Grave', 'Grave', 35.0 / 60.0, false, true, false, false, false),
            tp('Largo', 'Largo', 50.0 / 60.0, false, true, false, false, false),
            tp('Lento', 'Lento', 52.5 / 60.0, false, true, false, false, false),
            tp('Larghetto', 'Larghetto', 63.0 / 60.0, false, true, false, false, true),
            tp('Adagio', 'Adagio', 71.0 / 60.0, false, true, false, false, false),
            tp('Andante', 'Andante', 92.0 / 60.0, false, true, false, false, false),
            tp('Andantino', 'Andantino', 94.0 / 60.0, false, true, false, false, true),
            tp('Moderato', 'Moderato', 114.0 / 60.0, false, true, false, false, false),
            tp('Allegretto', 'Allegretto', 116.0 / 60.0, false, true, false, false, false),
            tp('Allegro', 'Allegro', 144.0 / 60.0, false, true, false, false, false),
            tp('Vivace', 'Vivace', 172.0 / 60.0, false, true, false, false, false),
            tp('Presto', 'Presto', 187.0 / 60.0, false, true, false, false, false),
            tp('Prestissimo', 'Prestissimo', 200.0 / 60.0, false, true, false, false, true),

            tp('<sym>metNoteQuarterUp</sym> = <sym>metNoteQuarterUp</sym><sym>space</sym><sym>metAugmentationDot</sym>',
                'Metric modulation: quarter note = dotted quarter note', 3.0 / 2.0, true, false, true, false, false),
            tp('<sym>metNoteQuarterUp</sym><sym>space</sym><sym>metAugmentationDot</sym> = <sym>metNoteQuarterUp</sym>',
                'Metric modulation: dotted quarter note = quarter note', 2.0 / 3.0, true, false, true, false, false),
            tp('<sym>metNoteHalfUp</sym> = <sym>metNoteQuarterUp</sym>',
                'Metric modulation: half note = quarter note', 1.0 / 2.0, true, false, true, false, false),
            tp('<sym>metNoteQuarterUp</sym> = <sym>metNoteHalfUp</sym>',
                'Metric modulation: quarter note = half note', 2.0 / 1.0, true, false, true, false, false),
            tp('<sym>metNote8thUp</sym> = <sym>metNote8thUp</sym>',
                'Metric modulation: eighth note = eighth note', 1.0 / 1.0, true, false, true, false, false),
            tp('<sym>metNoteQuarterUp</sym> = <sym>metNoteQuarterUp</sym>',
                'Metric modulation: quarter note = quarter note', 1.0 / 1.0, true, false, true, false, false),
            tp('<sym>metNote8thUp</sym><sym>space</sym><sym>metAugmentationDot</sym> = <sym>metNoteQuarterUp</sym>',
                'Metric modulation: dotted eighth note = quarter note', 4.0 / 3.0, true, false, true, false, false),
        ]
        // NOTE: like C++, all patterns are in the default palette too (basic/masterOnly are not used)
        void defaultPalette
        for (const p of tps) {
            const tt = new TempoText(dummy().segment())
            tt.setFollowText(p.followText)
            tt.setXmlText(p.pattern)
            if (p.relative) {
                tt.setRelative(p.f)
                sp.appendElement(tt, p.name, 1.5)
            } else if (p.italian) {
                tt.setTempo(p.f)
                sp.appendElement(tt, p.name, 1.3)
            } else {
                tt.setTempo(p.f)
                sp.appendElement(tt, p.name, 1.5)
            }
        }

        const DEFAULT_TEMPO_CHANGE: [GradualTempoChangeType, string][] = [
            [GradualTempoChangeType.Accelerando, 'accel.'],
            [GradualTempoChangeType.Allargando, 'allarg.'],
            [GradualTempoChangeType.Rallentando, 'rall.'],
            [GradualTempoChangeType.Ritardando, 'rit.'],
        ]
        // std::map: sorted by the enum value
        const MASTER_TEMPO_CHANGE: [GradualTempoChangeType, string][] = ([
            [GradualTempoChangeType.Accelerando, 'accel.'],
            [GradualTempoChangeType.Allargando, 'allarg.'],
            [GradualTempoChangeType.Calando, 'calando'],
            [GradualTempoChangeType.Lentando, 'lentando'],
            [GradualTempoChangeType.Morendo, 'morendo'],
            [GradualTempoChangeType.Precipitando, 'precipitando'],
            [GradualTempoChangeType.Rallentando, 'rall.'],
            [GradualTempoChangeType.Ritardando, 'rit.'],
            [GradualTempoChangeType.Smorzando, 'smorz.'],
            [GradualTempoChangeType.Sostenuto, 'sost.'],
            [GradualTempoChangeType.Stringendo, 'string.'],
        ] as [GradualTempoChangeType, string][]).sort((a, b) => a[0] - b[0])
        DEFAULT_TEMPO_CHANGE.sort((a, b) => a[0] - b[0])

        for (const [type, text] of defaultPalette ? DEFAULT_TEMPO_CHANGE : MASTER_TEMPO_CHANGE) {
            const item = new GradualTempoChange(dummy())
            item.setTempoChangeType(type)
            item.setBeginText(text)
            item.setContinueText(`(${text})`)
            sp.appendElement(item, text, 1.3).yoffset = 0.4
        }

        const aTempoStr = 'a tempo'
        const aTempoTxt = new TempoText(dummy().segment())
        aTempoTxt.setFollowText(true)
        aTempoTxt.setXmlText(aTempoStr)
        aTempoTxt.setTempoTextType(TempoTextType.A_TEMPO)
        sp.appendElement(aTempoTxt, aTempoStr, 1.3)

        const tempoPrimoStr = 'tempo primo'
        const tempoPrimoTxt = new TempoText(dummy().segment())
        tempoPrimoTxt.setFollowText(true)
        tempoPrimoTxt.setXmlText(tempoPrimoStr)
        tempoPrimoTxt.setTempoTextType(TempoTextType.TEMPO_PRIMO)
        sp.appendElement(tempoPrimoTxt, tempoPrimoStr, 1.3)

        let stxt = new SystemText(dummy().segment())
        stxt.initTextStyleType(TextStyleType.TEMPO)
        stxt.setXmlText('Swing')
        stxt.setSwing(true)
        let cell = sp.appendElement(stxt, 'Swing', 1.3)
        cell.yoffset = 0.4
        cell.setElementTranslated(true)

        stxt = new SystemText(dummy().segment())
        stxt.initTextStyleType(TextStyleType.TEMPO)
        // System text to switch from swing rhythm back to straight rhythm
        stxt.setXmlText('Straight')
        // need to be true to enable the "Off" option
        stxt.setSwing(true)
        // 0 (swingUnit) turns of swing; swingRatio is set to default
        stxt.setSwingParameters(0, stxt.style().styleI(Sid.swingRatio))
        cell = sp.appendElement(stxt, 'Straight', 1.3)
        cell.yoffset = 0.4
        cell.setElementTranslated(true)
        return sp
    }

    private static playTechAnnotation(xmlText: string, type: PlayingTechniqueType, style: TextStyleType | null = null): PlayTechAnnotation {
        const pta = new PlayTechAnnotation(dummy().segment())
        if (style !== null) {
            pta.setTextStyleType(style)
        }
        pta.setXmlText(xmlText)
        pta.setTechniqueType(type)
        return pta
    }

    static newTextPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Text)
        sp.setName('Text')
        sp.setGridSize(100, 28)
        sp.setMag(0.85)
        sp.setDrawGrid(true)

        const st = new StaffText(dummy().segment())
        st.setXmlText('Staff text')
        sp.appendElement(st, 'Staff text').setElementTranslated(true)

        const staffTextLine = new TextLine(dummy())
        staffTextLine.setBeginText('Staff')
        staffTextLine.setEndHookType(HookType.HOOK_90)
        sp.appendElement(staffTextLine, 'Staff text line')

        const stxt = new SystemText(dummy().segment())
        stxt.setXmlText('System text')
        sp.appendElement(stxt, 'System text').setElementTranslated(true)

        sp.appendElement(PaletteCreator.systemTextLine(), 'System text line')

        const expressionText = new Expression(dummy().segment())
        expressionText.setTextStyleType(TextStyleType.EXPRESSION)
        expressionText.setXmlText('expression')
        expressionText.setPlacement(PlacementV.BELOW)
        sp.appendElement(expressionText, 'Expression text').setElementTranslated(true)

        const is = new InstrumentChange(dummy().segment())
        is.setXmlText('Change instr.')
        sp.appendElement(is, 'Instrument change').setElementTranslated(true)

        const rhm = new RehearsalMark(dummy().segment())
        rhm.setXmlText('B1')
        sp.appendElement(rhm, 'Rehearsal mark')

        const playTechName = (t: PlayingTechniqueType): string => userName(PLAY_TECH_TYPES, t)
        const playTechAnnotations: { xmlText: string; type: PlayingTechniqueType; expressionType?: boolean; userName?: string }[] = [
            { xmlText: 'legato', type: PlayingTechniqueType.Legato },
            { xmlText: 'pizz.', type: PlayingTechniqueType.Pizzicato },
            { xmlText: 'arco', type: PlayingTechniqueType.Natural, userName: 'Arco' },
            { xmlText: 'tremolo', type: PlayingTechniqueType.Tremolo, expressionType: true },
            // For brass and plucked string instruments: staff text that prescribes to use mute while playing
            { xmlText: 'mute', type: PlayingTechniqueType.Mute },
            // For brass and plucked string instruments: staff text that prescribes to play without mute
            { xmlText: 'open', type: PlayingTechniqueType.Open },
            { xmlText: 'distort', type: PlayingTechniqueType.Distortion },
            { xmlText: 'overdrive', type: PlayingTechniqueType.Overdrive },
            { xmlText: 'harmonics', type: PlayingTechniqueType.Harmonics },
            { xmlText: 'jazz tone', type: PlayingTechniqueType.JazzTone },
            { xmlText: 'normal', type: PlayingTechniqueType.Natural },
        ]
        for (const a of playTechAnnotations) {
            const pta = PaletteCreator.playTechAnnotation(a.xmlText, a.type, a.expressionType ? TextStyleType.EXPRESSION : null)
            // "Arco" is in the "palette" context (C++ TranslatableString("palette", "Arco")); the cell context is the
            // element's (engraving/playtechtype), which has no "Arco": the English text is shown then
            sp.appendElement(pta, a.userName ?? playTechName(a.type)).setElementTranslated(true)
        }

        if (!defaultPalette) {
            // Measure numbers, unlike other elements (but like most text elements), are not copied directly into the score
            // when drop. Instead, they simply set the corresponding measure's MeasureNumberMode to SHOW
            const meaNum = new MeasureNumber(dummy().measure())
            meaNum.setProperty(Pid.TEXT_STYLE, TextStyleType.STAFF) // Make the element bigger in the palettes
            meaNum.setXmlText('Measure number')
            sp.appendElement(meaNum, 'Measure number').setElementTranslated(true)

            const playTechAnnotationsMaster: [string, PlayingTechniqueType][] = [
                ['détaché', PlayingTechniqueType.Detache],
                ['martelé', PlayingTechniqueType.Martele],
                ['col legno', PlayingTechniqueType.ColLegno],
                ['sul pont.', PlayingTechniqueType.SulPonticello],
                ['sul tasto', PlayingTechniqueType.SulTasto],
                ['vibrato', PlayingTechniqueType.Vibrato],
            ]
            for (const [xmlText, type] of playTechAnnotationsMaster) {
                sp.appendElement(PaletteCreator.playTechAnnotation(xmlText, type), playTechName(type)).setElementTranslated(true)
            }
        }
        return sp
    }

    static newTimePalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.TimeSig)
        sp.setName('Time signatures')
        sp.setMag(0.8)
        sp.setGridSize(42, 38)
        sp.setDrawGrid(true)

        interface TS { numerator: number; denominator: number; type: TimeSigType; name: string }
        const defaultTimeSignatureList: TS[] = [
            { numerator: 2, denominator: 4, type: TimeSigType.NORMAL, name: '2/4' },
            { numerator: 3, denominator: 4, type: TimeSigType.NORMAL, name: '3/4' },
            { numerator: 4, denominator: 4, type: TimeSigType.NORMAL, name: '4/4' },
            { numerator: 5, denominator: 4, type: TimeSigType.NORMAL, name: '5/4' },
            { numerator: 6, denominator: 4, type: TimeSigType.NORMAL, name: '6/4' },
            { numerator: 3, denominator: 8, type: TimeSigType.NORMAL, name: '3/8' },
            { numerator: 4, denominator: 8, type: TimeSigType.NORMAL, name: '4/8' },
            { numerator: 5, denominator: 8, type: TimeSigType.NORMAL, name: '5/8' },
            { numerator: 6, denominator: 8, type: TimeSigType.NORMAL, name: '6/8' },
            { numerator: 7, denominator: 8, type: TimeSigType.NORMAL, name: '7/8' },
            { numerator: 9, denominator: 8, type: TimeSigType.NORMAL, name: '9/8' },
            { numerator: 12, denominator: 8, type: TimeSigType.NORMAL, name: '12/8' },
            { numerator: 4, denominator: 4, type: TimeSigType.FOUR_FOUR, name: 'Common time' },
            { numerator: 2, denominator: 2, type: TimeSigType.ALLA_BREVE, name: 'Cut time' },
            { numerator: 2, denominator: 2, type: TimeSigType.NORMAL, name: '2/2' },
            { numerator: 3, denominator: 2, type: TimeSigType.NORMAL, name: '3/2' },
        ]
        const masterTimeSignatureList: TS[] = [
            ...defaultTimeSignatureList,
            { numerator: 4, denominator: 2, type: TimeSigType.NORMAL, name: '4/2' },
            { numerator: 2, denominator: 2, type: TimeSigType.CUT_BACH, name: 'Cut time (Bach)' },
            { numerator: 9, denominator: 8, type: TimeSigType.CUT_TRIPLE, name: 'Cut triple time (9/8)' },
        ]
        for (const ts of defaultPalette ? defaultTimeSignatureList : masterTimeSignatureList) {
            const timeSignature = make<TimeSig>(ElementType.TIMESIG, dummy().segment())
            timeSignature.setSig(new Fraction(ts.numerator, ts.denominator), ts.type)
            sp.appendElement(timeSignature, ts.name)
        }
        return sp
    }

    static newFretboardDiagramPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.FretboardDiagram)
        sp.setName('Fretboard diagrams')
        sp.setGridSize(42, 45)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        const fret = make<FretDiagram>(ElementType.FRET_DIAGRAM, dummy().segment())
        fret.clear()
        sp.appendElement(fret, 'Blank')
        // TODO(port): the diagrams of C, Cm, C7 ... B7 (FretDiagram::setHarmony + updateDiagram)

        if (!defaultPalette) {
            sp.appendActionIcon(ActionIconType.FFRAME, 'insert-fretframe', FRAME_MAG)
        }
        return sp
    }

    static newGuitarPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Guitar)
        sp.setName('Guitar')
        sp.setGridSize(60, 33)
        sp.setMag(1.2)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        const capoLine = new TextLine(dummy())
        capoLine.setBeginText('VII')
        capoLine.setEndHookType(HookType.HOOK_90)
        sp.appendElement(capoLine, 'Barré line', 0.8)

        sp.appendElement(new PalmMute(dummy()), 'Palm mute', 0.8)
        sp.appendElement(new LetRing(dummy()), 'Let ring', 0.8)
        sp.appendElement(new WhammyBar(dummy()), 'Whammy bar', 0.8)

        for (const vibratoType of [VibratoType.GUITAR_VIBRATO, VibratoType.GUITAR_VIBRATO_WIDE]) {
            const vibrato = new Vibrato(dummy())
            vibrato.setVibratoType(vibratoType)
            sp.appendElement(vibrato, userName(VIBRATO_TYPES, vibratoType))
        }

        sp.appendActionIcon(ActionIconType.DIVE, 'dive', 1.5)
        sp.appendActionIcon(ActionIconType.PRE_DIVE, 'pre-dive', 1.5)
        sp.appendActionIcon(ActionIconType.DIP, 'dip', 1.4)
        sp.appendActionIcon(ActionIconType.SCOOP, 'scoop', 1.5)

        sp.appendActionIcon(ActionIconType.STANDARD_BEND, 'standard-bend', 1.5)
        sp.appendActionIcon(ActionIconType.PRE_BEND, 'pre-bend', 1.5)
        sp.appendActionIcon(ActionIconType.GRACE_NOTE_BEND, 'grace-note-bend', 1.4)
        sp.appendActionIcon(ActionIconType.SLIGHT_BEND, 'slight-bend', 1.5)

        PaletteCreator.appendGuitarFingerings(sp, defaultPalette)

        // TODO(port): Tapping ("Left-hand tapping", "Right-hand tapping")

        sp.appendElement(new HammerOnPullOff(dummy()), 'Hammer-on / pull-off', 0.8)

        const luteSymbols = [
            SymId.stringsThumbPosition,
            SymId.luteFingeringRHThumb, SymId.luteFingeringRHFirst,
            SymId.luteFingeringRHSecond, SymId.luteFingeringRHThird,
        ]
        for (const i of luteSymbols) {
            const s = PaletteCreator.articulation(i)
            sp.appendElement(s, s.subtypeUserName().str)
        }

        // TODO(port): Capo, StringTunings

        const playTechAnnotations: [string, PlayingTechniqueType][] = [
            ['distort', PlayingTechniqueType.Distortion],
            ['overdrive', PlayingTechniqueType.Overdrive],
            ['harmonics', PlayingTechniqueType.Harmonics],
            ['jazz tone', PlayingTechniqueType.JazzTone],
            ['normal', PlayingTechniqueType.Natural],
        ]
        for (const [xmlText, type] of playTechAnnotations) {
            sp.appendElement(PaletteCreator.playTechAnnotation(xmlText, type), userName(PLAY_TECH_TYPES, type), 0.8).setElementTranslated(true)
        }

        sp.appendActionIcon(ActionIconType.FFRAME, 'insert-fretframe', FRAME_MAG)
        return sp
    }

    static newKeyboardPalette(): Palette {
        const sp = new Palette(PaletteType.Keyboard)
        sp.setName('Keyboard')
        sp.setGridSize(73, 30)
        sp.setDrawGrid(true)

        sp.appendElement(pedal(null, HookType.ROSETTE, false), 'Pedal (with ped and asterisk)')
        sp.appendElement(pedal(null, HookType.HOOK_90), 'Pedal (with ped and line)')
        sp.appendElement(pedal(HookType.HOOK_90, HookType.HOOK_90), 'Pedal (straight hooks)')
        sp.appendElement(pedal(HookType.HOOK_90, HookType.HOOK_45), 'Pedal (angled end hook)')
        sp.appendElement(pedal(HookType.HOOK_45, HookType.HOOK_45), 'Pedal (both hooks angled)')
        sp.appendElement(pedal(HookType.HOOK_45, HookType.HOOK_90), 'Pedal (angled start hook)')

        // TODO(port): ChordBracket ("Chord bracket", "... (play with left hand)", "... (play with right hand)")
        return sp
    }

    static newPitchPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Pitch)
        sp.setName('Pitch')
        sp.setGridSize(100, 30)
        sp.setDrawGrid(true)
        sp.setMag(0.8)

        const ottavasDefault = [OttavaType.OTTAVA_8VA, OttavaType.OTTAVA_8VB, OttavaType.OTTAVA_15MA, OttavaType.OTTAVA_15MB]
        const ottavasMaster = [
            OttavaType.OTTAVA_8VA, OttavaType.OTTAVA_8VB, OttavaType.OTTAVA_15MA, OttavaType.OTTAVA_15MB,
            OttavaType.OTTAVA_22MA, OttavaType.OTTAVA_22MB,
        ]
        for (const ottavaType of defaultPalette ? ottavasDefault : ottavasMaster) {
            const ottava = new Ottava(dummy())
            ottava.setOttavaType(ottavaType)
            ottava.styleChanged()
            sp.appendElement(ottava, OTTAVA_USER_NAMES[ottavaType])
        }

        sp.appendElement(new Ambitus(dummy().segment()), 'Ambitus')
        return sp
    }

    static newHarpPalette(): Palette {
        const sp = new Palette(PaletteType.Harp)
        sp.setName('Harp')
        sp.setGridSize(90, 30)
        sp.setDrawGrid(true)
        sp.setVisible(false)
        // TODO(port): HarpPedalDiagram ("Harp pedal diagram", "Harp pedal text diagram")
        return sp
    }

    static newHandbellsPalette(defaultPalette = false): Palette {
        const sp = new Palette(PaletteType.Handbells)
        sp.setName('Handbells')
        sp.setGridSize(42, 25)
        sp.setDrawGrid(true)
        sp.setVisible(false)

        const standardHandbellsArticSymbols = [
            SymId.handbellsMartellato,
            SymId.handbellsMartellatoLift,
            SymId.handbellsMalletBellSuspended,
            SymId.handbellsMalletBellOnTable,
            SymId.handbellsMalletLft,
            SymId.handbellsPluckLift,
            SymId.handbellsGyro,
        ]
        for (const symId of standardHandbellsArticSymbols) {
            const artic = PaletteCreator.articulation(symId)
            sp.appendElement(artic, artic.subtypeUserName().str,
                symId === SymId.handbellsGyro ? 0.7 : symId === SymId.handbellsMalletBellSuspended ? 1.4 : 1.0)
        }

        // TODO(port): text articulations (ArticulationTextType TD, BD, RT, PL, SB, VIB)

        const standardHandbellsPlayTech: [string, PlayingTechniqueType][] = [
            ['R', PlayingTechniqueType.HandbellsR],
            ['LV', PlayingTechniqueType.HandbellsLV],
            ['<sym>handbellsDamp3</sym>', PlayingTechniqueType.HandbellsDamp],
            ['<sym>handbellsSwingUp</sym>', PlayingTechniqueType.HandbellsSwingUp],
            ['<sym>handbellsSwingDown</sym>', PlayingTechniqueType.HandbellsSwingDown],
            ['<sym>handbellsEcho1</sym>', PlayingTechniqueType.HandbellsEcho1],
        ]
        const handbellsPlayTech = (xmlText: string, type: PlayingTechniqueType): PlayTechAnnotation => {
            const element = new PlayTechAnnotation(dummy().segment())
            element.setProperty(Pid.TEXT_STYLE, TextStyleType.ARTICULATION)
            element.setXmlText(xmlText)
            element.setTechniqueType(type)
            return element
        }
        for (const [xmlText, type] of standardHandbellsPlayTech) {
            sp.appendElement(handbellsPlayTech(xmlText, type), userName(PLAY_TECH_TYPES, type),
                type === PlayingTechniqueType.HandbellsLV || type === PlayingTechniqueType.HandbellsR ? 1.1 : 1.0)
        }

        if (!defaultPalette) {
            for (const symId of [SymId.handbellsHandMartellato, SymId.handbellsMutedMartellato]) {
                const artic = PaletteCreator.articulation(symId)
                sp.appendElement(artic, artic.subtypeUserName().str)
            }
            const additionalHandbellsPlayTech: [string, PlayingTechniqueType][] = [
                ['<sym>handbellsSwing</sym>', PlayingTechniqueType.HandbellsSwing],
                ['<sym>handbellsEcho2</sym>', PlayingTechniqueType.HandbellsEcho2],
            ]
            for (const [xmlText, type] of additionalHandbellsPlayTech) {
                sp.appendElement(handbellsPlayTech(xmlText, type), userName(PLAY_TECH_TYPES, type))
            }
        }
        return sp
    }
}

export type { TextBase }
