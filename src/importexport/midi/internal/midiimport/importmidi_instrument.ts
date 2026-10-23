/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_instrument.h/.cpp (namespace MidiInstr)
 */

import { StdSet } from '../../../../framework/global/stdmap'
import { DRUM_INSTRUMENTS, type Drumset, smDrumset } from '../../../../engraving/dom/drumset'
import '../../../../engraving/dom/excerpt' // Part.setStaves
import {
    type InstrumentGenre, type InstrumentTemplate, instrumentGroups, searchTemplateIndexForId,
} from '../../../../engraving/dom/instrtemplate'
import { Part } from '../../../../engraving/dom/part'
import type { Score } from '../../../../engraving/dom/score'
import { StaffType, StaffTypes } from '../../../../engraving/dom/stafftype'
import { Fraction } from '../../../../engraving/types/fraction'
import { BracketType, StaffGroup } from '../../../../engraving/types/types'
import { GM1Program, getMidiName, toMidiData } from '../midishared/generalmidi'
import { isGrandStaffProgram } from './importmidi_chord'
import { ReducedFraction } from './importmidi_fraction'
import type { MTrack } from './importmidi_inner'
import { CurrentMidiFileSetter, midiImportOperations } from './importmidi_operations'

// General MIDI Level 1: the preferred instrument ids of the programs
const GM1_SOUND_DATA: readonly string[] = [
    'grand-piano', // AcousticGrandPiano
    'piano', // BrightAcousticPiano
    'electric-piano', // ElectricGrandPiano
    'honky-tonk-piano', // HonkyTonkPiano
    'electric-piano', // ElectricPiano1
    'electric-piano', // ElectricPiano2
    'harpsichord', // Harpsichord
    'clavichord', // Clavi
    'celesta', // Celesta
    'glockenspiel', // Glockenspiel
    'crotales', // MusicBox
    'vibraphone', // Vibraphone
    'marimba', // Marimba
    'xylophone', // Xylophone
    'tubular-bells', // TubularBells
    'dulcimer', // Dulcimer
    'hammond-organ', // DrawbarOrgan
    'percussive-organ', // PercussiveOrgan
    'rotary-organ', // RockOrgan
    'pipe-organ', // ChurchOrgan
    'reed-organ', // ReedOrgan
    'accordion', // Accordion
    'harmonica', // Harmonica
    'bandoneon', // TangoAccordion
    'guitar-nylon', // AcousticGuitarNylon
    'guitar-steel', // AcousticGuitarSteel
    'electric-guitar', // ElectricGuitarJazz
    'electric-guitar', // ElectricGuitarClean
    'electric-guitar', // ElectricGuitarMuted
    'electric-guitar', // OverdrivenGuitar
    'electric-guitar', // DistortionGuitar
    'electric-guitar', // GuitarHarmonics
    'acoustic-bass', // AcousticBass
    'electric-bass', // ElectricBassFinger
    'bass-guitar', // ElectricBassPick
    'fretless-electric-bass', // FretlessBass
    'electric-bass', // SlapBass1
    'electric-bass', // SlapBass2
    'bass-synthesizer', // SynthBass1
    'bass-synthesizer', // SynthBass2
    'violin', // Violin
    'viola', // Viola
    'violoncello', // Cello
    'contrabass', // Contrabass
    'strings', // TremoloStrings
    'strings', // PizzicatoStrings
    'harp', // OrchestralHarp
    'timpani', // Timpani
    'strings', // StringEnsemble1
    'strings', // StringEnsemble2
    'string-synthesizer', // SynthStrings1
    'string-synthesizer', // SynthStrings2
    'voice', // ChoirAahs
    'voice', // VoiceOohs
    'voice', // SynthVoice
    'brass-synthesizer', // OrchestraHit
    'trumpet', // Trumpet
    'trombone', // Trombone
    'tuba', // Tuba
    'trumpet', // MutedTrumpet
    'horn', // FrenchHorn
    'brass', // BrassSection
    'brass-synthesizer', // SynthBrass1
    'brass-synthesizer', // SynthBrass2
    'soprano-saxophone', // SopranoSax
    'alto-saxophone', // AltoSax
    'tenor-saxophone', // TenorSax
    'baritone-saxophone', // BaritoneSax
    'oboe', // Oboe
    'english-horn', // EnglishHorn
    'bassoon', // Bassoon
    'clarinet', // Clarinet
    'piccolo', // Piccolo
    'flute', // Flute
    'recorder', // Recorder
    'pan-flute', // PanFlute
    'pan-flute', // BlownBottle
    'shakuhachi', // Shakuhachi
    'c-tin-whistle', // Whistle
    'ocarina', // Ocarina
    'square-synth', // Lead1Square
    'saw-synth', // Lead2Sawtooth
    '', // Lead3Calliope
    '', // Lead4Chiff
    'tuned-klaxon-horns', // Lead5Charang
    'kazoo', // Lead6Voice
    '', // Lead7Fifths
    '', // Lead8BassAndLead
    'new-age-synth', // Pad1NewAge
    'warm-synth', // Pad2Warm
    'poly-synth', // Pad3Polysynth
    'choir-synth', // Pad4Choir
    'bowed-synth', // Pad5Bowed
    'metallic-synth', // Pad6Metallic
    'halo-synth', // Pad7Halo
    'sweep-synth', // Pad8Sweep
    'rain-synth', // FX1Rain
    'soundtrack-synth', // FX2Soundtrack
    'crystal-synth', // FX3Crystal
    'atmosphere-synth', // FX4Atmosphere
    'brightness-synth', // FX5Brightness
    'goblins-synth', // FX6Goblins
    'echoes-synth', // FX7Echoes
    'sci-fi-synth', // FX8SciFi
    'sitar', // Sitar
    'banjo', // Banjo
    'shamisen', // Shamisen
    'koto', // Koto
    'kalimba', // Kalimba
    'bagpipe', // BagPipe
    'violin', // Fiddle
    'shenai', // Shanai
    'hand-bells', // TinkleBell
    'hand-bells', // Agogo
    'steel-drums', // SteelDrums
    'temple-blocks', // Woodblock
    '', // TaikoDrum
    'roto-toms', // MelodicTom
    '', // SynthDrum
    '', // ReverseCymbal
    '', // GuitarFretNoise
    '', // BreathNoise
    '', // Seashore
    '', // BirdTweet
    '', // TelephoneRing
    '', // Helicopter
    '', // Applause
    'cannon', // Gunshot
]

function getPreferredInstrument(sound: GM1Program): InstrumentTemplate | null {
    const id = GM1_SOUND_DATA[sound]
    const idx = searchTemplateIndexForId(id)
    if (idx.groupIndex === -1) {
        return null
    }

    return idx.instrTemplate
}

export function instrumentName(program: GM1Program, isDrumTrack: boolean): string {
    if (isDrumTrack) {
        return 'Percussion'
    }

    return getMidiName(program)
}

export function isGrandStaff(t1: MTrack, t2: MTrack): boolean {
    return t1.mtrack!.outChannel() === t2.mtrack!.outChannel()
           && isGrandStaffProgram(t1.program)
           && !t1.mtrack!.drumTrack() && !t2.mtrack!.drumTrack()
}

function isSameChannel(t1: MTrack, t2: MTrack): boolean {
    return t1.mtrack!.outChannel() === t2.mtrack!.outChannel()
}

function is3StaffOrgan(program: GM1Program): boolean {
    return program >= GM1Program.DrawbarOrgan
           && program <= GM1Program.ReedOrgan
}

function areNext2GrandStaff(currentTrack: number, tracks: readonly MTrack[]): boolean {
    if (currentTrack + 1 >= tracks.length) {
        return false
    }
    return isGrandStaff(tracks[currentTrack], tracks[currentTrack + 1])
}

function areNext3OrganStaff(currentTrack: number, tracks: readonly MTrack[]): boolean {
    if (currentTrack + 2 >= tracks.length) {
        return false
    }
    if (!is3StaffOrgan(tracks[currentTrack].program)) {
        return false
    }

    return isGrandStaff(tracks[currentTrack], tracks[currentTrack + 1])
           && isSameChannel(tracks[currentTrack + 1], tracks[currentTrack + 2])
}

export function concatenateWithComma(left: string, right: string): string {
    if (left.length === 0) {
        return right
    }
    if (right.length === 0) {
        return left
    }
    return left + ', ' + right
}

// set program equal to all staves, as it should be
// often only first stave in Grand Staff have correct program, other - default (piano)
// also handle track names
export function setGrandStaffProgram(tracks: MTrack[]): void {
    for (let i = 0; i < tracks.length; ++i) {
        const mt = tracks[i]

        if (areNext3OrganStaff(i, tracks)) {
            tracks[i + 1].program = mt.program
            tracks[i + 2].program = mt.program

            mt.name = concatenateWithComma(mt.name, 'Manual')
            tracks[i + 1].name = ''
            tracks[i + 2].name = concatenateWithComma(tracks[i + 2].name, 'Pedal')

            i += 2
        } else if (areNext2GrandStaff(i, tracks)) {
            tracks[i + 1].program = mt.program
            if (mt.name !== tracks[i + 1].name) {
                mt.name = '' // only one name place near bracket is available
                tracks[i + 1].name = '' // so instrument name will be used instead
            }
            i += 1
        }
    }
}

function findAllPitches(track: MTrack): StdSet<number> {
    const pitches = new StdSet<number>()
    for (const chord of track.chords) {
        for (const note of chord.second.notes) {
            pitches.insert(note.pitch)
        }
    }
    return pitches
}

function findNotEmptyDrumPitches(drumset: Drumset): StdSet<number> {
    const drumPitches = new StdSet<number>()
    for (let i = 0; i !== DRUM_INSTRUMENTS; ++i) {
        if (drumset.name(i).length > 0) {
            drumPitches.insert(i)
        }
    }

    return drumPitches
}

function hasNotDefinedDrumPitch(trackPitches: StdSet<number>, drumPitches: StdSet<number>): boolean {
    for (const pitch of trackPitches) {
        if (!drumPitches.contains(pitch)) {
            return true
        }
    }

    return false
}

function findInstrument(groupId: string, instrId: string): InstrumentTemplate | null {
    let instr: InstrumentTemplate | null = null

    for (const group of instrumentGroups()) {
        if (group.id === groupId) {
            for (const templ of group.instrumentTemplates) {
                if (templ.id === instrId) {
                    instr = templ
                    break
                }
            }
            break
        }
    }
    return instr
}

// returns number of pitches which are present in p1, but missing in p2
function countMissingPitches(p1: StdSet<number>, p2: StdSet<number>): number {
    let missingPitches = 0
    for (const p of p1) {
        if (!p2.contains(p)) {
            ++missingPitches
        }
    }
    return missingPitches
}

const INT_MAX = 2147483647

// find instrument with maximum MIDI program
// that is less than the track MIDI program, i.e. suitable instrument
function findClosestInstrument(program: GM1Program, pitches: StdSet<number>, isDrumTrack: boolean): InstrumentTemplate | null {
    let maxLessProgram = -1
    let minMissingPitches = INT_MAX
    let closestTemplate: InstrumentTemplate | null = null

    for (const group of instrumentGroups()) {
        for (const templ of group.instrumentTemplates) {
            if (templ.staffGroup === StaffGroup.TAB) {
                continue
            }
            if (isDrumTrack !== templ.useDrumset) {
                continue
            }

            if (isDrumTrack) {
                let missingPitches = INT_MAX
                if (templ.drumset) {
                    const drumPitches = findNotEmptyDrumPitches(templ.drumset)
                    missingPitches = countMissingPitches(pitches, drumPitches)
                }

                for (const channel of templ.channel) {
                    if (channel.program < toMidiData(program)
                        && missingPitches < minMissingPitches) {
                        maxLessProgram = channel.program
                        minMissingPitches = missingPitches

                        closestTemplate = templ
                        break
                    }
                }

                continue
            }

            for (const channel of templ.channel) {
                if (channel.program < toMidiData(program)
                    && channel.program > maxLessProgram) {
                    maxLessProgram = channel.program
                    closestTemplate = templ
                    break
                }
            }
        }
    }
    return closestTemplate
}

function findInstrumentsForProgram(track: MTrack): InstrumentTemplate[] {
    const suitableTemplates: InstrumentTemplate[] = []
    const program = track.program
    const isDrumTrack = track.mtrack!.drumTrack()

    const prefInstr = getPreferredInstrument(program)
    if (prefInstr && !isDrumTrack) {
        suitableTemplates.push(prefInstr)
    }

    let trackPitches = new StdSet<number>()
    if (isDrumTrack) {
        trackPitches = findAllPitches(track)
    }

    for (const group of instrumentGroups()) {
        for (const templ of group.instrumentTemplates) {
            if (prefInstr && templ.id === prefInstr.id) {
                continue
            }
            if (templ.staffGroup === StaffGroup.TAB) {
                continue
            }
            if (isDrumTrack !== templ.useDrumset) {
                continue
            }

            if (isDrumTrack) {
                let drumPitches = new StdSet<number>()
                if (templ.drumset) {
                    drumPitches = findNotEmptyDrumPitches(templ.drumset)
                }

                for (const channel of templ.channel) {
                    if (channel.program === toMidiData(program)) {
                        if (templ.drumset) {
                            if (hasNotDefinedDrumPitch(trackPitches, drumPitches)) {
                                break
                            }
                        }
                        suitableTemplates.push(templ)
                        break
                    }
                }

                continue
            }

            for (const channel of templ.channel) {
                if (channel.program === toMidiData(program)) {
                    suitableTemplates.push(templ)
                    break
                }
            }
        }
    }

    if (suitableTemplates.length === 0) {
        // Ms instruments with the desired MIDI program were not found
        // so we will find the most matching instrument

        if (program >= GM1Program.Lead1Square && program <= GM1Program.FX8SciFi) {
            let instr: InstrumentTemplate | null = null
            if (track.mtrack!.drumTrack()) {
                instr = findInstrument('electronic-instruments', 'percussion-synthesizer')
            } else {
                instr = findInstrument('electronic-instruments', 'effect-synth')
            }
            if (instr) {
                suitableTemplates.push(instr) // generic synth
            }
        } else if (program >= GM1Program.TinkleBell) {
            const instr = findInstrument('unpitched-percussion', 'snare-drum')
            if (instr) {
                suitableTemplates.push(instr) // 1-line percussion staff
            }
        } else { // find instrument with maximum MIDI program
            // that is less than the track MIDI program, i.e. suitable instrument
            const instr = findClosestInstrument(program, trackPitches, isDrumTrack)
            if (instr) {
                suitableTemplates.push(instr)
            }
        }
    }

    return suitableTemplates
}

function findMinMaxPitch(track: MTrack): [number, number] {
    let minPitch = INT_MAX
    let maxPitch = -1

    for (const chord of track.chords) {
        for (const note of chord.second.notes) {
            minPitch = Math.min(minPitch, note.pitch)
            maxPitch = Math.max(maxPitch, note.pitch)
        }
    }
    return [minPitch, maxPitch]
}

function findMaxPitchDiff(minMaxPitch: [number, number], templ: InstrumentTemplate): number {
    let diff = 0
    if (minMaxPitch[0] < templ.minPitchP) {
        diff = templ.minPitchP - minMaxPitch[0]
    }
    if (minMaxPitch[1] > templ.maxPitchP) {
        diff = Math.max(diff, minMaxPitch[1] - templ.maxPitchP)
    }

    return diff
}

function hasCommonGenre(genres: readonly InstrumentGenre[]): boolean {
    for (const genre of genres) {
        if (genre.id === 'common') {
            return true
        }
    }
    return false
}

export function sortInstrumentTemplates(templates: InstrumentTemplate[], minMaxPitch: [number, number]): void {
    // C++ std::stable_sort with a "less" comparator
    const less = (templ1: InstrumentTemplate, templ2: InstrumentTemplate): boolean => {
        const diff1 = findMaxPitchDiff(minMaxPitch, templ1)
        const diff2 = findMaxPitchDiff(minMaxPitch, templ2)

        if (diff1 !== diff2) {
            return diff1 < diff2
        }
        // if drumset is not null - it's a particular drum instrument
        // if drum set is null - it's a common drumset
        // so prefer particular drum instruments
        if (templ1.drumset && !templ2.drumset) {
            return true
        }
        if (!templ1.drumset && templ2.drumset) {
            return false
        }
        // prefer instruments with the "common" genre
        const hasCommon1 = hasCommonGenre(templ1.genres)
        const hasCommon2 = hasCommonGenre(templ2.genres)
        if (hasCommon1 && !hasCommon2) {
            return true
        }
        if (!hasCommon1 && hasCommon2) {
            return false
        }
        return templ1.genres.length > templ2.genres.length
    }
    templates.sort((a, b) => less(a, b) ? -1 : less(b, a) ? 1 : 0)
}

export function findSuitableInstruments(track: MTrack): (InstrumentTemplate | null)[] {
    const templates: (InstrumentTemplate | null)[] = findInstrumentsForProgram(track)
    if (templates.length === 0) {
        return templates
    }

    const minMaxPitch = findMinMaxPitch(track)
    sortInstrumentTemplates(templates as InstrumentTemplate[], minMaxPitch)

    // add empty instrument to show no-instrument option
    if (templates.length > 0) {
        templates.push(null)
    }

    return templates
}

export function findInstrumentsForAllTracks(tracks: readonly MTrack[], forceReload = false): void {
    const opers = midiImportOperations
    const instrListOption = opers.data().trackOpers.msInstrList

    if (forceReload) {
        instrListOption.clear()
    }

    if (opers.data().processingsOfOpenedFile === 0 || forceReload) {
        // create instrument list on MIDI file opening
        for (const track of tracks) {
            instrListOption.setValue(track.indexOfOperation, findSuitableInstruments(track))
            if (instrListOption.value(track.indexOfOperation).length > 0) {
                const defaultInstrIndex = 0
                opers.data().trackOpers.msInstrIndex.setDefaultValue(defaultInstrIndex)
            }
        }
    }
}

export function instrumentTemplatesChanged(): void {
    const files = midiImportOperations.allMidiFiles()
    for (const file of files) {
        const s = new CurrentMidiFileSetter(midiImportOperations, file)
        try {
            if (midiImportOperations.hasData()) {
                const data = midiImportOperations.data()
                findInstrumentsForAllTracks(data.tracks, /* forceReload */ true)
            }
        } finally {
            s.restore()
        }
    }
}

export function createInstruments(score: Score, tracks: MTrack[]): void {
    const opers = midiImportOperations
    const instrListOption = opers.data().trackOpers.msInstrList

    const ntracks = tracks.length
    for (let idx = 0; idx < ntracks; ++idx) {
        const track = tracks[idx]
        const part = new Part(score)

        const instrList = instrListOption.value(track.indexOfOperation)
        let instr: InstrumentTemplate | null = null
        if (instrList.length > 0) {
            const instrIndex = opers.data().trackOpers.msInstrIndex.value(track.indexOfOperation)
            instr = instrList[instrIndex] ?? null
            if (instr) {
                part.initFromInstrTemplate(instr)
            }
        }

        if (areNext3OrganStaff(idx, tracks)) {
            part.setStaves(3)
        } else if (areNext2GrandStaff(idx, tracks)) {
            part.setStaves(2)
        } else {
            part.setStaves(1)
        }

        if (part.nstaves() === 1) {
            if (track.mtrack!.drumTrack()) {
                part.staff(0)!.setStaffType(new Fraction(0, 1), StaffType.preset(StaffTypes.PERC_5LINE)) // C++ StaffTypes::PERC_DEFAULT
                if (!instr) {
                    part.instrument().setDrumset(smDrumset())
                }
            }
        } else {
            if (!instr) {
                part.staff(0)!.setBarLineSpan(true)
                part.staff(0)!.setBracketType(0, BracketType.BRACE)
            } else {
                part.staff(0)!.setBarLineSpan(instr.barlineSpan[0])
                part.staff(0)!.setBracketType(0, instr.bracket[0])
            }
            part.staff(0)!.setBracketSpan(0, 2)
        }

        if (instr) {
            for (let i = 0; i !== part.nstaves(); ++i) {
                const staffTypePreset = instr.staffTypePreset
                if (staffTypePreset) {
                    part.staff(i)!.init(instr, null, i)
                    part.staff(i)!.setStaffType(new Fraction(0, 1), staffTypePreset)
                }
                //                        part->staff(i)->setLines(0, instr->staffLines[i]);
                //                        part->staff(i)->setSmall(0, instr->smallStaff[i]);
                part.staff(i)!.setDefaultClefType(instr.clefTypes[i])
            }
        }

        for (let i = 0; i !== part.nstaves(); ++i) {
            if (i > 0) {
                ++idx
            }
            tracks[idx].staff = part.staff(i)
        }

        // only importing a single volume per track here, skip when multiple volumes
        // are defined, or the single volume is not defined on tick 0.
        if (track.volumes.size() === 1) {
            for (const i of track.volumes) {
                if (i.first.eq(new ReducedFraction(0, 1))) {
                    part.instrument().channel(0)!.setVolume(i.second)
                }
            }
        }

        score.appendPart(part)
    }
}

export function msInstrName(trackIndex: number): string {
    const opers = midiImportOperations.data().trackOpers

    const instrIndex = opers.msInstrIndex.value(trackIndex)
    const trackInstrList = opers.msInstrList.value(trackIndex)
    const instr = (trackInstrList.length === 0) ? null : (trackInstrList[instrIndex] ?? null)
    if (!instr) {
        return ''
    }
    if (instr.longNames.length > 0) {
        return instr.longNames[0].name()
    }

    return instr.trackName
}
