/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the parts of src/notation/notationtypes.h that creating a new score and editing need
 */

import { Fraction } from '../engraving/types/fraction'
import { DurationType, Key, TextStyleType, TransposeDirection, TransposeMode } from '../engraving/types/types'
import { TimeSigType } from '../engraving/dom/timesig'
import { ScoreOrder } from '../engraving/dom/scoreorder'
import { TupletBracketType, TupletNumberType } from '../engraving/dom/tuplet'
import { TraitType, type InstrumentTemplate, type Trait } from '../engraving/dom/instrtemplate'
import { Part } from '../engraving/dom/part'
import { arg, qtrc } from '../framework/global/translation'

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
