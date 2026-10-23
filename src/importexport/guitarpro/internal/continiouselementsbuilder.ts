/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/continiouselementsbuilder.h/.cpp
 */

import { Factory } from '../../../engraving/dom/factory'
import type { Chord } from '../../../engraving/dom/chord'
import type { ChordRest } from '../../../engraving/dom/chordrest'
import type { Hairpin } from '../../../engraving/dom/hairpin'
import { HairpinType } from '../../../engraving/dom/hairpin'
import type { Ottava } from '../../../engraving/dom/ottava'
import { OttavaType } from '../../../engraving/dom/ottava'
import type { Score } from '../../../engraving/dom/score'
import type { Spanner } from '../../../engraving/dom/spanner'
import type { TextLineBase } from '../../../engraving/dom/textlinebase'
import type { Trill } from '../../../engraving/dom/trill'
import type { Vibrato } from '../../../engraving/dom/vibrato'
import { scoreDummy } from '../../../engraving/compat/dummyelement'
import { ElementType, TrillType, VibratoType, type track_idx_t } from '../../../engraving/types/types'

export enum ContiniousElementsBuilderImportType {
    NONE,
    LET_RING,
    PALM_MUTE,
    WHAMMY_BAR,
    RASGUEADO,
    PICK_SCRAPE,

    /// harmonics
    HARMONIC_ARTIFICIAL,
    HARMONIC_PINCH,
    HARMONIC_TAP,
    HARMONIC_SEMI,
    HARMONIC_FEEDBACK,

    /// ottavas
    OTTAVA_MA15,
    OTTAVA_VA8,
    OTTAVA_VB8,
    OTTAVA_MB15,

    /// trill
    TRILL,

    /// hammer on / pull off
    HAMMER_ON_PULL_OFF,

    /// hairpin
    HAIRPIN_CRESCENDO,
    HAIRPIN_DIMINUENDO,

    /// vibrato
    VIBRATO_LEFT_HAND_SLIGHT,
    VIBRATO_LEFT_HAND_WIDE,
    VIBRATO_W_TREM_BAR_SLIGHT,
    VIBRATO_W_TREM_BAR_WIDE,
}

export type sub_type_t = number

export enum ContiniousElementsBuilderVibratoSubType {
    LEFT_HAND_SLIGHT = 0,
    LEFT_HAND_WIDE,
    W_TREM_BAR_SLIGHT,
    W_TREM_BAR_WIDE,
}

export enum ContiniousElementsBuilderHarmonicMarkSubType {
    ARTIFICIAL = 0,
    PINCH,
    TAP,
    SEMI,
    FEEDBACK,
}

const enum ContiniousElementState {
    UNDEFINED = -1,
    CHORD_NO_ELEMENT, // there is no imported type of element
    CONTINUE_CURRENT_LINE, // element exists on current beat and was before, line will be continued
    REST_BREAK, // element should be broken in rests, new element starts later
    REST_CONTINUE, // element shouln't be broken in rests, end of element will be found later
    CREATE_NEW_ITEM, // new element should be created on this beat
    ELEMENT_ON_REST, // element was imported for Rest
}

interface ContiniousElement {
    elements: Spanner[]
    endedOnRest: boolean
}

type ImportType = ContiniousElementsBuilderImportType
const ImportType = ContiniousElementsBuilderImportType

function muTypeFromImportType(importType: ImportType): ElementType {
    switch (importType) {
    case ImportType.LET_RING:
        return ElementType.LET_RING
    case ImportType.PALM_MUTE:
        return ElementType.PALM_MUTE
    case ImportType.WHAMMY_BAR:
        return ElementType.WHAMMY_BAR
    case ImportType.RASGUEADO:
        return ElementType.RASGUEADO
    case ImportType.PICK_SCRAPE:
        return ElementType.PICK_SCRAPE

    case ImportType.HARMONIC_ARTIFICIAL:
    case ImportType.HARMONIC_PINCH:
    case ImportType.HARMONIC_TAP:
    case ImportType.HARMONIC_SEMI:
    case ImportType.HARMONIC_FEEDBACK:
        return ElementType.HARMONIC_MARK

    case ImportType.OTTAVA_MA15:
    case ImportType.OTTAVA_VA8:
    case ImportType.OTTAVA_VB8:
    case ImportType.OTTAVA_MB15:
        return ElementType.OTTAVA

    case ImportType.TRILL:
        return ElementType.TRILL
    case ImportType.HAMMER_ON_PULL_OFF:
        return ElementType.HAMMER_ON_PULL_OFF

    case ImportType.HAIRPIN_CRESCENDO:
    case ImportType.HAIRPIN_DIMINUENDO:
        return ElementType.HAIRPIN

    case ImportType.VIBRATO_LEFT_HAND_SLIGHT:
    case ImportType.VIBRATO_LEFT_HAND_WIDE:
    case ImportType.VIBRATO_W_TREM_BAR_SLIGHT:
    case ImportType.VIBRATO_W_TREM_BAR_WIDE:
        return ElementType.VIBRATO

    case ImportType.NONE:
        return ElementType.INVALID
    }

    return ElementType.INVALID
}

function harmonicText(type: ImportType): string {
    switch (type) {
    case ImportType.HARMONIC_ARTIFICIAL: return 'AH'
    case ImportType.HARMONIC_PINCH: return 'PH'
    case ImportType.HARMONIC_TAP: return 'TH'
    case ImportType.HARMONIC_SEMI: return 'SH'
    case ImportType.HARMONIC_FEEDBACK: return 'Fdbk'
    default:
        break
    }

    console.error('wrong harmonic type')
    return ''
}

function vibratoTypeFromImportType(type: ImportType): VibratoType {
    switch (type) {
    case ImportType.VIBRATO_LEFT_HAND_SLIGHT: return VibratoType.GUITAR_VIBRATO
    case ImportType.VIBRATO_LEFT_HAND_WIDE: return VibratoType.GUITAR_VIBRATO_WIDE
    case ImportType.VIBRATO_W_TREM_BAR_SLIGHT: return VibratoType.VIBRATO_SAWTOOTH
    case ImportType.VIBRATO_W_TREM_BAR_WIDE: return VibratoType.VIBRATO_SAWTOOTH_WIDE
    default:
        break
    }

    console.error('wrong vibrato type')
    return VibratoType.GUITAR_VIBRATO
}

function ottavaType(type: ImportType): [boolean, OttavaType] {
    switch (type) {
    case ImportType.OTTAVA_VA8: return [true, OttavaType.OTTAVA_8VA]
    case ImportType.OTTAVA_VB8: return [true, OttavaType.OTTAVA_8VB]
    case ImportType.OTTAVA_MA15: return [true, OttavaType.OTTAVA_15MA]
    case ImportType.OTTAVA_MB15: return [true, OttavaType.OTTAVA_15MB]
    default:
        return [false, OttavaType.OTTAVA_8VA]
    }
}

/// whenever the continious line elements should end on rest or rest should be included in it
function shouldSplitByRests(muType: ElementType): boolean {
    switch (muType) {
    case ElementType.PICK_SCRAPE:
    case ElementType.TRILL:
    case ElementType.HARMONIC_MARK:
    case ElementType.VIBRATO:
    case ElementType.HAMMER_ON_PULL_OFF:
        return true

    default:
        return false
    }
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
    let v = map.get(key)
    if (v === undefined) {
        v = create()
        map.set(key, v)
    }
    return v
}

function searchEndChord(startChord: Chord): Chord | null {
    let nextCr: ChordRest | null = null
    if (startChord.isGrace()) {
        //! this case when start note is a grace note so end note can be next note in grace notes
        //! or parent note of grace notes
        const parentGrace = startChord.parent() as Chord
        const graces = parentGrace.graceNotes()
        const i = graces.indexOf(startChord)

        if (i < 0) {
            nextCr = null
        } else if (i + 1 === graces.length) {
            nextCr = parentGrace
        } else {
            nextCr = graces[i + 1]
        }
    } else {
        nextCr = startChord.segment()!.next1()!.nextChordRest(startChord.track())
        if (!nextCr) {
            return null
        }

        if (nextCr.isChord() && (nextCr as Chord).graceNotes().length) {
            nextCr = (nextCr as Chord).graceNotes()[0]
        }
    }

    return (nextCr && nextCr.isChord()) ? nextCr as Chord : null
}

export class ContiniousElementsBuilder {
    static readonly ImportType = ContiniousElementsBuilderImportType
    static readonly VibratoSubType = ContiniousElementsBuilderVibratoSubType
    static readonly HarmonicMarkSubType = ContiniousElementsBuilderHarmonicMarkSubType

    private m_elementsByType = new Map<ImportType, (Spanner | null)[]>()

    private m_lastImportTypes = new Map<ElementType, Map<track_idx_t, Map<sub_type_t, ImportType>>>()
    private m_spannersWithoutEndElement = new Map<track_idx_t, Map<ImportType, Set<Spanner>>>()
    private m_elementsToAddToScore = new Map<track_idx_t, Map<ImportType, ContiniousElement>>()
    private m_orderedAddedElements: Spanner[] = []

    private m_score: Score

    constructor(score: Score) {
        this.m_score = score
    }

    private elementToAdd(track: track_idx_t, type: ImportType): ContiniousElement {
        const byType = getOrCreate(this.m_elementsToAddToScore, track, () => new Map<ImportType, ContiniousElement>())
        return getOrCreate(byType, type, () => ({ elements: [], endedOnRest: false }))
    }

    /**
     * Making the current element of continious type (octave, let ring, trill etc.. inherited from SLine) longer or starting a new one
     *
     * @param cr ChordRest to which element will be added
     * @param muType type from MU
     * @param importType type of imported element
     * @param elemExists indicates if element exists in imported file on current beat
     * @param subType is used when elements of same MU type with different subtypes can overlap each other (ex, vibrato)
     */
    buildContiniousElement(cr: ChordRest, muType: ElementType, importType: ImportType, elemExists: boolean, subType: sub_type_t = 0): void {
        const setStartCR = (elem: Spanner, cr: ChordRest): void => {
            elem.setTick(cr.tick())
            elem.setStartElement(cr)
        }

        const setEndCR = (elem: Spanner, cr: ChordRest): void => {
            elem.setTick2(cr.endTick())
            elem.setEndElement(cr)
        }

        const splitByRests = shouldSplitByRests(muType)

        const track = cr.track()

        const elements = getOrCreate(this.m_elementsByType, importType, () => [] as (Spanner | null)[])
        while (elements.length < track + 1) {
            elements.push(null)
        }

        const lastTypes = getOrCreate(getOrCreate(this.m_lastImportTypes, muType, () => new Map<track_idx_t, Map<sub_type_t, ImportType>>()),
                                      track, () => new Map<sub_type_t, ImportType>())
        let lastTypeForTrack = lastTypes.get(subType) ?? ImportType.NONE
        const setLastTypeForTrack = (t: ImportType): void => {
            lastTypeForTrack = t
            lastTypes.set(subType, t)
        }

        const state = this.calculateState(cr.isRest(), elemExists, splitByRests, lastTypeForTrack !== importType)

        /// handling the continious element according to its state
        switch (state) {
        case ContiniousElementState.CHORD_NO_ELEMENT:
            setLastTypeForTrack(ImportType.NONE)
            elements[track] = null
            break

        case ContiniousElementState.REST_BREAK:
            setLastTypeForTrack(ImportType.NONE)
            elements[track] = null
            break

        case ContiniousElementState.REST_CONTINUE:
        case ContiniousElementState.ELEMENT_ON_REST: // currently it's mistake: we cannot indicate Rest with any of continious elements in guitar pro
            if (lastTypeForTrack !== ImportType.NONE) {
                this.elementToAdd(track, lastTypeForTrack).endedOnRest = true
            }

            break

        case ContiniousElementState.CONTINUE_CURRENT_LINE:
        {
            let elem = elements[track]!
            const lastCR = elem.endCR()
            if (lastCR === cr) {
                break
            }

            if (elem.tick2().lt(cr.tick())) {
                if (lastTypeForTrack !== ImportType.NONE) {
                    const lastTypeElementsToAdd = this.elementToAdd(track, lastTypeForTrack)

                    /// removing info about the Rest and updating last element's ticks
                    if (lastTypeElementsToAdd.endedOnRest) {
                        lastTypeElementsToAdd.endedOnRest = false
                        const prevElem = lastTypeElementsToAdd.elements[lastTypeElementsToAdd.elements.length - 1]
                        if (!prevElem) {
                            console.error('error while importing')
                            return
                        }

                        elem = prevElem
                        elements[track] = elem
                        setEndCR(elem, cr)
                    } else {
                        // Simile mark case
                        setEndCR(elem, cr)
                    }
                }
            } else {
                setEndCR(elem, cr)
            }

            break
        }

        case ContiniousElementState.CREATE_NEW_ITEM:
        {
            const engItem = Factory.createItem(muType, scoreDummy(this.m_score))

            if (!engItem || !engItem.isSpanner()) {
                return
            }
            const newElem = engItem as Spanner

            elements[track] = newElem

            setStartCR(newElem, cr)
            setEndCR(newElem, cr)

            newElem.setTrack(track)
            newElem.setTrack2(track)

            this.elementToAdd(track, importType).elements.push(newElem)
            this.m_orderedAddedElements.push(newElem)
            setLastTypeForTrack(importType)
            break
        }

        default:
            break
        }

        if (!cr.isChord()) {
            return
        }

        this.setupAddedElement(cr.track(), importType)
    }

    notifyUncompletedMeasure(): void {
        for (const trackMaps of this.m_elementsToAddToScore.values()) {
            for (const typeMaps of trackMaps.values()) {
                typeMaps.endedOnRest = true
            }
        }
    }

    addElementsToScore(): void {
        for (const trackMaps of this.m_spannersWithoutEndElement.values()) {
            for (const typeMaps of trackMaps.values()) {
                for (const elem of typeMaps) {
                    elem.setEndElement(searchEndChord(elem.endChord()!))
                }
            }
        }

        for (const elem of this.m_orderedAddedElements) {
            this.m_score.addElement(elem)
        }
    }

    /// indicating the type of behaviour for continious element
    private calculateState(isRest: boolean, elemExists: boolean, splitByRests: boolean, importTypeChanged: boolean): ContiniousElementState {
        let state = ContiniousElementState.UNDEFINED

        if (isRest && splitByRests) {
            state = ContiniousElementState.REST_BREAK
        } else {
            if (!elemExists) {
                if (!isRest) {
                    state = ContiniousElementState.CHORD_NO_ELEMENT
                } else {
                    state = ContiniousElementState.REST_CONTINUE
                }
            } else {
                // element exists on current beat
                if (isRest) {
                    state = ContiniousElementState.ELEMENT_ON_REST
                } else if (importTypeChanged) {
                    state = ContiniousElementState.CREATE_NEW_ITEM
                } else {
                    state = ContiniousElementState.CONTINUE_CURRENT_LINE
                }
            }
        }

        return state
    }

    private setupAddedElement(trackIdx: track_idx_t, importType: ImportType): void {
        const muType = muTypeFromImportType(importType)

        const lineElem = this.m_elementsByType.get(importType)?.[trackIdx] ?? null
        if (!lineElem) {
            return
        }

        switch (muType) {
        case ElementType.TRILL:
        {
            if (lineElem.isTrill()) {
                (lineElem as unknown as Trill).setTrillType(TrillType.TRILL_LINE)
            }

            break
        }
        case ElementType.HAIRPIN:
        {
            if (lineElem.isHairpin()) {
                (lineElem as unknown as Hairpin).setHairpinType(
                    importType === ImportType.HAIRPIN_CRESCENDO ? HairpinType.CRESC_HAIRPIN : HairpinType.DIM_HAIRPIN)
            }

            break
        }
        case ElementType.HARMONIC_MARK:
        {
            if (lineElem.isTextLineBase()) {
                const text = harmonicText(importType)
                ;(lineElem as unknown as TextLineBase).setBeginText(text)
                ;(lineElem as unknown as TextLineBase).setContinueText(text)
            }

            break
        }
        case ElementType.OTTAVA:
        {
            const [foundOttava, muOttavaType] = ottavaType(importType)
            if (!foundOttava) {
                return
            }

            if (lineElem.isOttava()) {
                (lineElem as unknown as Ottava).setOttavaType(muOttavaType)
            }

            break
        }
        case ElementType.VIBRATO:
            if (lineElem.isVibrato()) {
                (lineElem as unknown as Vibrato).setVibratoType(vibratoTypeFromImportType(importType))
            }

            break
        case ElementType.HAMMER_ON_PULL_OFF:
            getOrCreate(getOrCreate(this.m_spannersWithoutEndElement, trackIdx, () => new Map<ImportType, Set<Spanner>>()),
                        importType, () => new Set<Spanner>()).add(lineElem)
            break
        default:
            break
        }
    }
}
