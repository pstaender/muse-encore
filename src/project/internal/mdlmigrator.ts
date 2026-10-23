/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/internal/mdlmigrator.cpp
 */

import { Fraction } from '../../engraving/types/fraction'
import { Constants } from '../../engraving/types/constants'
import { Drumset, DRUM_INSTRUMENTS } from '../../engraving/dom/drumset'
import { SegmentType } from '../../engraving/dom/segment'
import { Prefer } from '../../engraving/dom/pitchspelling'
import { XmlReader } from '../../engraving/rw/xmlreader'
import type { Chord } from '../../engraving/dom/chord'
import type { Instrument } from '../../engraving/dom/instrument'
import type { MasterScore } from '../../engraving/dom/masterscore'
import type { track_idx_t } from '../../engraving/types/types'

export type RepitchFunc = (pitch: number) => number

/**
 * C++ globalConfiguration()->appDataPath() + "templates/" + name: here a function that returns the content of a file of
 * MuseScore's share/templates (e.g. "Marching_Snare_Drums.drm"), or null if it is not available
 */
export type TemplateFileProvider = (name: string) => string | Uint8Array | null

export class MdlMigrator {
    constructor(private m_score: MasterScore, private templateFile: TemplateFileProvider | null = null) {}

    remapPercussion(): void {
        for (const part of this.m_score.parts()) {
            const startTrack = part.startTrack()
            const endTrack = part.endTrack()
            const instruments = [...part.instruments().values()]

            // First instrument in list is the "default instrument".
            // It's at tick -1 but we must start at tick 0.
            let startTick = new Fraction(0, 1)
            for (let i = 0; i < instruments.length; ++i) {
                const instr = instruments[i]
                const endTick = i + 1 === instruments.length
                    ? this.m_score.endTick()
                    : Fraction.fromTicks(part.instruments().keyAt(i + 1))
                const tick = startTick
                startTick = endTick

                if (!instr || !instr.useDrumset() || !instr.musicXmlId().startsWith('mdl.')) {
                    continue
                }

                const remap = this.needToRemap(instr)
                if (!remap) {
                    continue
                }
                const { repitch, drumsetName } = remap

                this.remapPitches(startTrack, endTrack, tick, endTick, repitch)

                const drumset = instr.drumset()!

                if (!this.loadDrumset(drumset, drumsetName)) {
                    const newDrumset = new Drumset()
                    newDrumset.clear()
                    for (let p = 0; p < DRUM_INSTRUMENTS; ++p) {
                        if (drumset.isValid(p)) {
                            newDrumset.setDrum(repitch(p), drumset.drum(p))
                        }
                    }
                    instr.setDrumset(newDrumset)
                    // Note: The new drumset may have fewer drums than the old one.
                    // This happens if there were two pitches X and Y for which
                    // repitch(X) == repitch(Y), and the old drumset had drums on
                    // both X and Y. The winning drum is the higher of X and Y.
                }
            }
        }
    }

    private loadDrumset(drumset: Drumset, name: string): boolean {
        const data = this.templateFile?.(name)
        if (!data) {
            return false
        }
        const xml = new XmlReader(data)
        drumset.clear()
        while (xml.readNextStartElement()) {
            if (xml.name() === 'museScore') {
                const verString = xml.attribute('version')
                const version = parseInt(verString.replace('.', ''), 10)
                if (!(version <= Constants.MSC_VERSION)) {
                    console.warn(`Loading drumset from unrecognized MuseScore version <${verString}>`)
                }
                while (xml.readNextStartElement()) {
                    if (xml.name() === 'Drum') {
                        drumset.loadDrum(xml)
                    } else {
                        xml.unknown()
                    }
                }
            }
        }
        return true
    }

    private remapPitches(startTrack: track_idx_t, endTrack: track_idx_t, startTick: Fraction, endTick: Fraction,
        repitch: RepitchFunc): void {
        const repitchChord = (chord: Chord): void => {
            for (const note of chord.notes()) {
                note.setPitch(repitch(note.pitch()))
                note.setTpcFromPitch(Prefer.SHARPS) // required for playback
            }
        }

        for (let seg = this.m_score.tick2segment(startTick, true, SegmentType.ChordRest);
            seg && seg.tick().lt(endTick);
            seg = seg.next1(SegmentType.ChordRest)) {
            for (let track = startTrack; track < endTrack; ++track) {
                const el = seg.element(track)
                if (!el || !el.isChord()) {
                    continue
                }
                const ch = el as Chord
                repitchChord(ch)
                for (const gch of ch.graceNotes()) {
                    repitchChord(gch)
                }
            }
        }
    }

    /** C++ needToRemap(instr, repitch&, drumsetPath&): returns both, or null */
    private needToRemap(instr: Instrument): { repitch: RepitchFunc; drumsetName: string } | null {
        const drumset = instr.drumset()
        const channel = instr.channel(0)

        if (!drumset || !channel || channel.synti() !== 'Zerberus') {
            return null
        }

        const program = channel.program()
        const musicXmlId = instr.musicXmlId()

        if (musicXmlId === 'mdl.drum.snare-drum' && (program === 5 || program === 6)) {
            // MDL Snare Line   (id="mdl-snareline")
            // MDL Snare Line A (id="mdl-snareline-a")
            // MDL Snare        (id="mdl-snaresolo")
            // MDL Snare A      (id="mdl-snaresolo-a")
            return { drumsetName: 'Marching_Snare_Drums.drm', repitch: MdlMigrator.repitchMdlSnares }
        } else if (musicXmlId === 'mdl.drum.tenor-drum' && (program === 7 || program === 8)) {
            // MDL Tenor Line   (id="mdl-tenorline")
            // MDL Tenors       (id="mdl-tenorsolo")
            return { drumsetName: 'Marching_Tenors.drm', repitch: MdlMigrator.repitchMdlTenors }
        } else if (musicXmlId === 'mdl.drum.bass-drum' && program === 0) {
            // MDL Bass Line (10)   (id="mdl-bassline-10") / MDL Bass Line (5)    (id="mdl-bassline-5")
            return {
                drumsetName: 'Marching_Bass_Drums.drm',
                repitch: drumset.isValid(61) ? MdlMigrator.repitchMdlBassline10 : MdlMigrator.repitchMdlBassline5,
            }
        } else if (musicXmlId === 'mdl.metal.cymbal.crash' && program === 1) {
            // MDL Cymbal Line  (id="mdl-cymballine")
            return { drumsetName: 'Marching_Cymbals.drm', repitch: MdlMigrator.repitchMdlCymballine }
        }
        return null
    }

    // Repitch functions

    static repitchMdlSnares(pitch: number): number {
        return SNARES.get(pitch) ?? pitch
    }

    static repitchMdlTenors(pitch: number): number {
        return TENORS.get(pitch) ?? pitch
    }

    static repitchMdlBassline10(pitch: number): number {
        return BASSLINE10.get(pitch) ?? pitch
    }

    static repitchMdlBassline5(pitch: number): number {
        return BASSLINE5.get(pitch) ?? pitch
    }

    static repitchMdlCymballine(pitch: number): number {
        return CYMBALLINE.get(pitch) ?? pitch
    }
}

// the switch statements of the C++ repitch functions
const SNARES = new Map([
    [23, 55], [27, 25], [29, 92], [30, 91], [31, 89], [32, 58], [33, 71], [36, 76], [38, 40], [39, 38], [40, 36],
    [60, 50], [61, 51], [62, 56], [63, 53], [64, 49], [65, 57], [67, 60], [68, 60], [72, 65], [73, 67], [74, 59],
    [76, 55], [77, 24],
])
const TENORS = new Map([
    [47, 40], [60, 36], [61, 48], [62, 60], [63, 72], [64, 84], [65, 96], [72, 41], [73, 53], [74, 65], [75, 77],
    [76, 89], [77, 101], [78, 37], [79, 49], [80, 61], [81, 73], [82, 85], [83, 97], [96, 37], [97, 49], [98, 61],
    [107, 36],
])
const BASSLINE10 = new Map([
    [60, 90], [61, 37], [62, 37], [63, 49], [64, 49], [65, 61], [66, 61], [67, 73], [68, 73], [69, 85], [70, 85],
    [72, 92], [73, 39], [74, 39], [75, 51], [76, 51], [77, 63], [78, 63], [79, 75], [80, 75], [81, 87], [82, 87],
])
const BASSLINE5 = new Map([
    [60, 90], [62, 37], [64, 49], [67, 61], [68, 73], [70, 85], [72, 92], [74, 39], [76, 51], [79, 63], [80, 75],
    [82, 87],
])
const CYMBALLINE = new Map([
    [38, 72], [43, 81], [45, 76], [47, 77], [50, 84], [51, 91], [62, 72], [67, 81], [69, 76], [71, 77], [74, 84],
    [75, 91], [86, 72], [91, 81], [93, 76], [95, 77], [98, 84], [99, 91],
])
