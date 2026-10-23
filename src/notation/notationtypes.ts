/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the parts of src/notation/notationtypes.h that creating a new score and editing need
 */

import { Fraction } from '../engraving/types/fraction'
import { DurationType, ElementType, INVALID_STRING_INDEX, Key, NoteHeadGroup, TextStyleType, TransposeDirection, TransposeMode, type AutoOnOff } from '../engraving/types/types'
import { TimeSigType } from '../engraving/dom/timesig'
import { ScoreOrder } from '../engraving/dom/scoreorder'
import { TupletBracketType, TupletNumberType } from '../engraving/dom/tuplet'
import { TraitType, type InstrumentTemplate, type Trait } from '../engraving/dom/instrtemplate'
import { Part } from '../engraving/dom/part'
import type { Spatium } from '../engraving/types/dimension'
import type { ClefTypeList } from '../engraving/dom/clefinfo'
import type { StaffType } from '../engraving/dom/stafftype'
import { arg, qtrc } from '../framework/global/translation'
import { TDuration } from '../engraving/dom/durationtype'
import { NoteType } from '../engraving/dom/chordrest'
import { Tpc } from '../engraving/dom/pitchspelling'
import type { System } from '../engraving/dom/system'
import type { Measure } from '../engraving/dom/measure'

export enum AddRemoveSystemLockType {
    AfterEachSystem = -1,
    None = 0,
    MeasuresInterval,
}

export enum BracketsType {
    Brackets,
    Braces,
    Parentheses,
}

export class Tempo {
    valueBpm = 0
    duration = DurationType.V_QUARTER
    withDot = false
}

export interface PartInstrument {
    partId: string
    instrumentTemplate: InstrumentTemplate
    isExistingPart: boolean
    isSoloist: boolean
}

export type PartInstrumentList = PartInstrument[]

export class ScoreCreateOptions {
    withTempo = false
    tempo = new Tempo()

    globalTimesig = new Fraction(4, 4)
    timesigType = TimeSigType.NORMAL

    key = Key.C

    totalMeasures = 0

    withPickupMeasure = false
    pickupTimesig = new Fraction(1, 4)

    parts: PartInstrumentList = []
    order = new ScoreOrder()
}

export function customOrder(): ScoreOrder {
    const order = new ScoreOrder()
    order.id = 'custom'
    order.name = 'Custom'
    return order
}

export enum NoteName {
    C = 0,
    D,
    E,
    F,
    G,
    A,
    B,
}

export enum NoteAddingMode {
    CurrentChord,
    NextChord,
    InsertChord,
}

export enum PastingType {
    Default,
    Half,
    Double,
    Special,
}

/** the text styles of texts in vertical frames (title, composer, ...) */
export function isVerticalBoxTextStyle(type: TextStyleType): boolean {
    return [
        TextStyleType.TITLE,
        TextStyleType.SUBTITLE,
        TextStyleType.COMPOSER,
        TextStyleType.LYRICIST,
        TextStyleType.INSTRUMENT_EXCERPT,
    ].includes(type)
}

// ---- note input (tuplets, intervals) ----

export class TupletOptions {
    ratio = new Fraction(-1, -1)
    numberType = TupletNumberType.SHOW_NUMBER
    bracketType = TupletBracketType.AUTO_BRACKET
    autoBaseLen = false
}

export const MIN_NOTES_INTERVAL = -10
export const MAX_NOTES_INTERVAL = 10

export function isNotesIntervalValid(interval: number): boolean {
    return interval >= MIN_NOTES_INTERVAL && interval <= MAX_NOTES_INTERVAL
           && interval !== 0 && interval !== -1
}

export interface TransposeOptions {
    mode: TransposeMode
    direction: TransposeDirection
    key: Key
    interval: number
    needTransposeKeys: boolean
    needTransposeChordNames: boolean
    needTransposeDoubleSharpsFlats: boolean
}

export interface InstrumentKey {
    instrumentId: string
    partId: string
    tick: Fraction
}

export function isMainInstrumentForPart(instrumentKey: InstrumentKey, part: Part): boolean {
    return instrumentKey.instrumentId === part.instrument().id() && instrumentKey.tick.eq(Part.MAIN_INSTRUMENT_TICK)
}

/** C++ formatInstrumentTitle(instrumentName, trait) */
export function formatInstrumentTitle(instrumentName: string, trait: Trait): string {
    // Comments for translators start with //:
    switch (trait.type) {
    case TraitType.Tuning:
        //: %1=tuning ("D"), %2=name ("Tin Whistle"). Example: "D Tin Whistle"
        return arg(qtrc('notation', '%1 %2', 'Tuned instrument displayed in the UI'), trait.name, instrumentName)
    case TraitType.Transposition:
        //: %1=name ("Horn"), %2=transposition ("C alto"). Example: "Horn in C alto"
        return arg(qtrc('notation', '%1 in %2', 'Transposing instrument displayed in the UI'), instrumentName, trait.name)
    case TraitType.Course:
        //: %1=name ("Tenor Lute"), %2=course/strings ("7-course"). Example: "Tenor Lute (7-course)"
        return arg(qtrc('notation', '%1 (%2)', 'String instrument displayed in the UI'), instrumentName, trait.name)
    default:
        return instrumentName // Example: "Flute"
    }
}

export enum BoxType {
    Unknown,
    Vertical,
    Horizontal,
    Measure,
    Text,
    Fret,
}

export enum AddBoxesTarget {
    AfterSelection,
    BeforeSelection,
    AtStartOfScore,
    AtEndOfScore,
}

export class FilterElementsOptions {
    elementType = ElementType.INVALID
    staffStart = -1
    staffEnd = -1
    voice = -1
    system: System | null = null
    durationTicks = new Fraction(-1, 1)
    beat = new Fraction(0, 0)
    measure: Measure | null = null

    bySubtype = false
    subtype = -1

    isValid(): boolean {
        return this.elementType !== ElementType.INVALID
    }
}

export class FilterNotesOptions extends FilterElementsOptions {
    pitch = -1
    string = INVALID_STRING_INDEX
    tpc: number = Tpc.TPC_INVALID
    notehead = NoteHeadGroup.HEAD_INVALID
    durationType = new TDuration()
    noteType = NoteType.INVALID
}

export interface StaffConfig {
    visible: boolean
    userDistance: Spatium
    cutaway: boolean
    hideSystemBarline: boolean
    mergeMatchingRests: AutoOnOff
    reflectTranspositionInLinkedTab: boolean
    clefTypeList: ClefTypeList
    staffType: StaffType
}

/** C++ StaffConfig::operator== */
export function staffConfigEquals(a: StaffConfig, b: StaffConfig): boolean {
    return a.visible === b.visible
        && a.userDistance.equals(b.userDistance)
        && a.cutaway === b.cutaway
        && a.hideSystemBarline === b.hideSystemBarline
        && a.mergeMatchingRests === b.mergeMatchingRests
        && a.clefTypeList.equals(b.clefTypeList)
        && a.staffType.equals(b.staffType)
        && a.reflectTranspositionInLinkedTab === b.reflectTranspositionInLinkedTab
}
