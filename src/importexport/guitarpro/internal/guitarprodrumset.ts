/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarprodrumset.h/.cpp (namespace mu::iex::guitarpro::drumset)
 */

import { DRUM_INSTRUMENTS, DrumInstrument, Drumset } from '../../../engraving/dom/drumset'
import type { Instrument } from '../../../engraving/dom/instrument'
import { DirectionV, NoteHeadGroup } from '../../../engraving/types/types'

export enum DrumSetType {
    DRUMS = 0, AGOGO, HAND_CLAP, TAMBOURINE,
    COWBELL, VIBRASLAP, BONGOS, CONGAS,
    TIMBALE, CABASA, MARACAS, WHISTLE,
    GUIRO, CLAVES, WOODBLOCK, CUICA,
    TRIANGLE, SHAKER, JINGLE_BELL, BELL_TREE,
    CASTANETS, SURDO,
}

export interface GpDrumSet {
    name: string
    idx: DrumSetType
    numLines: number
}

export const PERC_STAFF_LINES_FROM_INSTRUMENT: ReadonlyMap<string, GpDrumSet> = new Map<string, GpDrumSet>([
    ['Agogo', { name: 'Agogo', idx: DrumSetType.AGOGO, numLines: 2 }],
    ['Hand Clap', { name: 'Hand Clap', idx: DrumSetType.HAND_CLAP, numLines: 1 }],
    ['Tambourine', { name: 'Tambourine', idx: DrumSetType.TAMBOURINE, numLines: 1 }],
    ['Cowbell', { name: 'Cowbell', idx: DrumSetType.COWBELL, numLines: 3 }],
    ['Vibraslap', { name: 'Vibraslap', idx: DrumSetType.VIBRASLAP, numLines: 1 }],
    ['Bongos', { name: 'Bongos', idx: DrumSetType.BONGOS, numLines: 2 }],
    ['Congas', { name: 'Congas', idx: DrumSetType.CONGAS, numLines: 2 }],
    ['Timbale', { name: 'Timbale', idx: DrumSetType.TIMBALE, numLines: 2 }],
    ['Cabasa', { name: 'Cabasa', idx: DrumSetType.CABASA, numLines: 1 }],
    ['Maracas', { name: 'Maracas', idx: DrumSetType.MARACAS, numLines: 2 }],
    ['Whistle', { name: 'Whistle', idx: DrumSetType.WHISTLE, numLines: 2 }],
    ['Guiro', { name: 'Guiro', idx: DrumSetType.GUIRO, numLines: 2 }],
    ['Claves', { name: 'Claves', idx: DrumSetType.CLAVES, numLines: 1 }],
    ['Woodblock', { name: 'Woodblock', idx: DrumSetType.WOODBLOCK, numLines: 2 }],
    ['Cuica', { name: 'Cuica', idx: DrumSetType.CUICA, numLines: 1 }],
    ['Triangle', { name: 'Triangle', idx: DrumSetType.TRIANGLE, numLines: 1 }],
    ['Shaker', { name: 'Shaker', idx: DrumSetType.SHAKER, numLines: 1 }],
    ['Jingle Bell', { name: 'Jingle Bell', idx: DrumSetType.JINGLE_BELL, numLines: 1 }],
    ['Bell Tree', { name: 'Bell Tree', idx: DrumSetType.BELL_TREE, numLines: 1 }],
    ['Castanets', { name: 'Castanets', idx: DrumSetType.CASTANETS, numLines: 1 }],
    ['Surdo', { name: 'Surdo', idx: DrumSetType.SURDO, numLines: 1 }],
 ])

export let gpDrumset: Drumset | null = null
export let gpAgogoSet: Drumset | null = null
export let gpHandClapSet: Drumset | null = null
export let gpTambourineSet: Drumset | null = null
export let gpCowbellSet: Drumset | null = null
export let gpVibraslapSet: Drumset | null = null
export let gpBongosSet: Drumset | null = null
export let gpCongasSet: Drumset | null = null
export let gpTimbalesSet: Drumset | null = null
export let gpCabasaSet: Drumset | null = null
export let gpMaracasSet: Drumset | null = null
export let gpWhistleSet: Drumset | null = null
export let gpGuiroSet: Drumset | null = null
export let gpClavesSet: Drumset | null = null
export let gpWoodblockSet: Drumset | null = null
export let gpCuicaSet: Drumset | null = null
export let gpTriangleSet: Drumset | null = null
export let gpShakerSet: Drumset | null = null
export let gpJingleBellSet: Drumset | null = null
export let gpBellTreeSet: Drumset | null = null
export let gpCastanetsSet: Drumset | null = null
export let gpSurdoSet: Drumset | null = null

// TConv::userName(DrumNum) (typesconv.cpp DRUMPITCHS)
const DRUMPITCHS = new Map<number, string>([
    [27, "High Q"], [28, "Slap"], [29, "Scratch Push"], [30, "Scratch Pull"], [31, "Sticks"], [32, "Square Click"],
    [33, "Metronome Click"], [34, "Metronome Bell"], [35, "Acoustic Bass Drum"], [36, "Bass Drum 1"], [37, "Side Stick"],
    [38, "Acoustic Snare"], [39, "Hand Clap"], [40, "Electric Snare"], [41, "Low Floor Tom"], [42, "Closed Hi-Hat"],
    [43, "High Floor Tom"], [44, "Pedal Hi-Hat"], [45, "Low Tom"], [46, "Open Hi-Hat"], [47, "Low-Mid Tom"],
    [48, "Hi-Mid Tom"], [49, "Crash Cymbal 1"], [50, "High Tom"], [51, "Ride Cymbal 1"], [52, "Chinese Cymbal"],
    [53, "Ride Bell"], [54, "Tambourine"], [55, "Splash Cymbal"], [56, "Cowbell"], [57, "Crash Cymbal 2"],
    [58, "Vibraslap"], [59, "Ride Cymbal 2"], [60, "Hi Bongo"], [61, "Low Bongo"], [62, "Mute Hi Conga"],
    [63, "Open Hi Conga"], [64, "Low Conga"], [65, "High Timbale"], [66, "Low Timbale"], [67, "High Agogo"],
    [68, "Low Agogo"], [69, "Cabasa"], [70, "Maracas"], [71, "Short Whistle"], [72, "Long Whistle"],
    [73, "Short Güiro"], [74, "Long Güiro"], [75, "Claves"], [76, "Hi Wood Block"], [77, "Low Wood Block"],
    [78, "Mute Cuica"], [79, "Open Cuica"], [80, "Mute Triangle"], [81, "Open Triangle"], [82, "Shaker"],
    [83, "Sleigh Bell"], [84, "Mark Tree"], [85, "Castanets"], [86, "Mute Surdo"], [87, "Open Surdo"],
    [91, "Snare (Rim shot)"], [93, "Ride (Edge)"], [99, "Cowbell Low"], [102, "Cowbell High"],
])

function userName(drumNum: number): string {
    return DRUMPITCHS.get(drumNum) ?? ''
}

/** C++ DrumInstrument(const String& n, NoteHeadGroup nh, int l, DirectionV d) */
function drumInstrument(name: string, nh: NoteHeadGroup, l: number, d: DirectionV): DrumInstrument {
    const di = new DrumInstrument()
    di.name = name
    di.notehead = nh
    di.line = l
    di.stemDirection = d
    return di
}

//---------------------------------------------------------
//   initGuitarProDrumset
//---------------------------------------------------------

export function initGuitarProDrumset(): void {
    if (!gpDrumset) {
        gpDrumset = new Drumset()
        for (let i = 0; i < DRUM_INSTRUMENTS; ++i) {
            gpDrumset.drum(i).name = ''
            gpDrumset.drum(i).notehead = NoteHeadGroup.HEAD_INVALID
            gpDrumset.drum(i).line = 0
            gpDrumset.drum(i).shortcut = ''
            gpDrumset.drum(i).voice = 0
            gpDrumset.drum(i).stemDirection = DirectionV.UP
            gpDrumset.drum(i).panelRow = -1
            gpDrumset.drum(i).panelColumn = -1
        }
        // new drumset determined via guitar pro (third argument specifies position on staff, 10 = C3, 9 = D3, 8 = E3,...)

        gpDrumset!.setDrum(27, drumInstrument(userName(27), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(28, drumInstrument(userName(28), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(29, drumInstrument(userName(29), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))

        gpDrumset!.setDrum(30, drumInstrument(userName(30), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(31, drumInstrument(userName(31), NoteHeadGroup.HEAD_CROSS, 3, DirectionV.UP))
        gpDrumset!.setDrum(32, drumInstrument(userName(32), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(33, drumInstrument(userName(33), NoteHeadGroup.HEAD_CROSS, 3, DirectionV.UP))
        gpDrumset!.setDrum(34, drumInstrument(userName(34), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(35, drumInstrument(userName(35), NoteHeadGroup.HEAD_NORMAL, 8, DirectionV.UP))
        gpDrumset!.setDrum(36, drumInstrument(userName(36), NoteHeadGroup.HEAD_NORMAL, 7, DirectionV.UP))
        gpDrumset!.setDrum(37, drumInstrument(userName(37), NoteHeadGroup.HEAD_CROSS, 3, DirectionV.UP))
        gpDrumset!.setDrum(38, drumInstrument(userName(38), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(39, drumInstrument(userName(39), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))

        gpDrumset!.setDrum(40, drumInstrument(userName(40), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(41, drumInstrument(userName(41), NoteHeadGroup.HEAD_NORMAL, 6, DirectionV.UP))
        gpDrumset!.setDrum(42, drumInstrument(userName(42), NoteHeadGroup.HEAD_CROSS, -1, DirectionV.UP))
        gpDrumset!.setDrum(43, drumInstrument(userName(43), NoteHeadGroup.HEAD_NORMAL, 6, DirectionV.UP))
        gpDrumset!.setDrum(44, drumInstrument(userName(44), NoteHeadGroup.HEAD_CROSS, 9, DirectionV.UP))
        gpDrumset!.setDrum(45, drumInstrument(userName(45), NoteHeadGroup.HEAD_NORMAL, 5, DirectionV.UP))
        gpDrumset!.setDrum(46, drumInstrument(userName(46), NoteHeadGroup.HEAD_XCIRCLE, -1, DirectionV.UP))
        gpDrumset!.setDrum(47, drumInstrument(userName(47), NoteHeadGroup.HEAD_NORMAL, 4, DirectionV.UP))
        gpDrumset!.setDrum(48, drumInstrument(userName(48), NoteHeadGroup.HEAD_NORMAL, 2, DirectionV.UP))
        gpDrumset!.setDrum(49, drumInstrument(userName(49), NoteHeadGroup.HEAD_CROSS, -2, DirectionV.UP))

        gpDrumset!.setDrum(50, drumInstrument(userName(50), NoteHeadGroup.HEAD_NORMAL, 1, DirectionV.UP))
        gpDrumset!.setDrum(51, drumInstrument(userName(51), NoteHeadGroup.HEAD_CROSS, 0, DirectionV.UP))
        gpDrumset!.setDrum(52, drumInstrument(userName(52), NoteHeadGroup.HEAD_HEAVY_CROSS_HAT, -3, DirectionV.UP))
        gpDrumset!.setDrum(53, drumInstrument(userName(53), NoteHeadGroup.HEAD_DIAMOND, 0, DirectionV.UP))
        gpDrumset!.setDrum(54, drumInstrument(userName(54), NoteHeadGroup.HEAD_CROSS, 2, DirectionV.UP))
        gpDrumset!.setDrum(55, drumInstrument(userName(55), NoteHeadGroup.HEAD_CROSS, -2, DirectionV.UP))
        gpDrumset!.setDrum(56, drumInstrument(userName(56), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.UP))
        gpDrumset!.setDrum(57, drumInstrument(userName(57), NoteHeadGroup.HEAD_CROSS, -3, DirectionV.UP))
        gpDrumset!.setDrum(58, drumInstrument(userName(58), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(59, drumInstrument(userName(59), NoteHeadGroup.HEAD_CROSS, 2, DirectionV.UP))

        gpDrumset!.setDrum(60, drumInstrument(userName(60), NoteHeadGroup.HEAD_NORMAL, 8, DirectionV.UP))
        gpDrumset!.setDrum(61, drumInstrument(userName(61), NoteHeadGroup.HEAD_NORMAL, 9, DirectionV.UP))
        gpDrumset!.setDrum(62, drumInstrument(userName(62), NoteHeadGroup.HEAD_CROSS, 5, DirectionV.UP))
        gpDrumset!.setDrum(63, drumInstrument(userName(63), NoteHeadGroup.HEAD_CROSS, 4, DirectionV.UP))
        gpDrumset!.setDrum(64, drumInstrument(userName(64), NoteHeadGroup.HEAD_CROSS, 6, DirectionV.UP))
        gpDrumset!.setDrum(65, drumInstrument(userName(65), NoteHeadGroup.HEAD_CROSS, 8, DirectionV.UP))
        gpDrumset!.setDrum(66, drumInstrument(userName(66), NoteHeadGroup.HEAD_CROSS, 9, DirectionV.UP))
        gpDrumset!.setDrum(67, drumInstrument(userName(67), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(68, drumInstrument(userName(68), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(69, drumInstrument(userName(69), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))

        gpDrumset!.setDrum(70, drumInstrument(userName(70), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(71, drumInstrument(userName(71), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(72, drumInstrument(userName(72), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(73, drumInstrument(userName(73), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(74, drumInstrument(userName(74), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(75, drumInstrument(userName(75), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(76, drumInstrument(userName(76), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(77, drumInstrument(userName(77), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(78, drumInstrument(userName(78), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(79, drumInstrument(userName(79), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))

        gpDrumset!.setDrum(80, drumInstrument(userName(80), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(81, drumInstrument(userName(81), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(82, drumInstrument(userName(82), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(83, drumInstrument(userName(83), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(84, drumInstrument(userName(84), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(85, drumInstrument(userName(85), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(86, drumInstrument(userName(86), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))
        gpDrumset!.setDrum(87, drumInstrument(userName(87), NoteHeadGroup.HEAD_NORMAL, 3, DirectionV.UP))

        gpDrumset!.setDrum(91, drumInstrument(userName(91), NoteHeadGroup.HEAD_DIAMOND, 3, DirectionV.UP))
        gpDrumset!.setDrum(92, drumInstrument(userName(46), NoteHeadGroup.HEAD_CROSS, -1, DirectionV.UP))
        gpDrumset!.setDrum(93, drumInstrument(userName(93), NoteHeadGroup.HEAD_CROSS, 0, DirectionV.UP))

        //Additional clutch presets (midi by default can't play this)
        gpDrumset!.setDrum(99, drumInstrument(userName(99), NoteHeadGroup.HEAD_TRIANGLE_UP, 1, DirectionV.UP))
        gpDrumset!.setDrum(102, drumInstrument(userName(102), NoteHeadGroup.HEAD_TRIANGLE_UP, -1, DirectionV.UP))
    }
}

export function initGuitarProPercussionSet(ds: GpDrumSet): void {
    switch (ds.idx) {
    case DrumSetType.DRUMS:
        break
    case DrumSetType.AGOGO:
        if (!gpAgogoSet) {
            gpAgogoSet = new Drumset()
            gpAgogoSet!.setDrum(67, drumInstrument(userName(67), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
            gpAgogoSet!.setDrum(68, drumInstrument(userName(68), NoteHeadGroup.HEAD_NORMAL, 2, DirectionV.UP))
        }
        break
    case DrumSetType.HAND_CLAP:
        if (!gpHandClapSet) {
            gpHandClapSet = new Drumset()
            gpHandClapSet!.setDrum(39, drumInstrument(userName(39), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.TAMBOURINE:
        if (!gpTambourineSet) {
            gpTambourineSet = new Drumset()
            gpTambourineSet!.setDrum(54, drumInstrument(userName(54), NoteHeadGroup.HEAD_TRIANGLE_UP, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.COWBELL:
        if (!gpCowbellSet) {
            gpCowbellSet = new Drumset()
            gpCowbellSet!.setDrum(56, drumInstrument(userName(56), NoteHeadGroup.HEAD_TRIANGLE_UP, 2, DirectionV.DOWN))
            gpCowbellSet!.setDrum(99, drumInstrument(userName(99), NoteHeadGroup.HEAD_TRIANGLE_UP, 4, DirectionV.UP))
            gpCowbellSet!.setDrum(102, drumInstrument(userName(102), NoteHeadGroup.HEAD_TRIANGLE_UP, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.VIBRASLAP:
        if (!gpVibraslapSet) {
            gpVibraslapSet = new Drumset()
            gpVibraslapSet!.setDrum(58, drumInstrument(userName(58), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.BONGOS:
        if (!gpBongosSet) {
            gpBongosSet = new Drumset()
            gpBongosSet!.setDrum(60, drumInstrument(userName(60), NoteHeadGroup.HEAD_NORMAL, 2, DirectionV.UP))
            gpBongosSet!.setDrum(61, drumInstrument(userName(61), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.CONGAS:
        if (!gpCongasSet) {
            gpCongasSet = new Drumset()
            gpCongasSet!.setDrum(62, drumInstrument(userName(62), NoteHeadGroup.HEAD_CROSS, 0, DirectionV.DOWN))
            gpCongasSet!.setDrum(63, drumInstrument(userName(63), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
            gpCongasSet!.setDrum(64, drumInstrument(userName(64), NoteHeadGroup.HEAD_NORMAL, 2, DirectionV.UP))
        }
        break
    case DrumSetType.TIMBALE:
        if (!gpTimbalesSet) {
            gpTimbalesSet = new Drumset()
            gpTimbalesSet!.setDrum(65, drumInstrument(userName(65), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
            gpTimbalesSet!.setDrum(66, drumInstrument(userName(66), NoteHeadGroup.HEAD_NORMAL, 2, DirectionV.UP))
        }
        break
    case DrumSetType.CABASA:
        if (!gpCabasaSet) {
            gpCabasaSet = new Drumset()
            gpCabasaSet!.setDrum(69, drumInstrument(userName(69), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.MARACAS:
        if (!gpMaracasSet) {
            gpMaracasSet = new Drumset()
            gpMaracasSet!.setDrum(70, drumInstrument(userName(70), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.WHISTLE:
        if (!gpWhistleSet) {
            gpWhistleSet = new Drumset()
            gpWhistleSet!.setDrum(71, drumInstrument(userName(71), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
            gpWhistleSet!.setDrum(72, drumInstrument(userName(72), NoteHeadGroup.HEAD_NORMAL, 2, DirectionV.UP))
        }
        break
    case DrumSetType.GUIRO:
        if (!gpGuiroSet) {
            gpGuiroSet = new Drumset()
            gpGuiroSet!.setDrum(73, drumInstrument(userName(73), NoteHeadGroup.HEAD_NORMAL, 2, DirectionV.UP))
            gpGuiroSet!.setDrum(74, drumInstrument(userName(74), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.CLAVES:
        if (!gpClavesSet) {
            gpClavesSet = new Drumset()
            gpClavesSet!.setDrum(75, drumInstrument(userName(75), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.WOODBLOCK:
        if (!gpWoodblockSet) {
            gpWoodblockSet = new Drumset()
            gpWoodblockSet!.setDrum(76, drumInstrument(userName(76), NoteHeadGroup.HEAD_NORMAL, 2, DirectionV.UP))
            gpWoodblockSet!.setDrum(77, drumInstrument(userName(77), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.CUICA:
        if (!gpCuicaSet) {
            gpCuicaSet = new Drumset()
            gpCuicaSet!.setDrum(78, drumInstrument(userName(78), NoteHeadGroup.HEAD_CROSS, 0, DirectionV.DOWN))
            gpCuicaSet!.setDrum(79, drumInstrument(userName(79), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.TRIANGLE:
        if (!gpTriangleSet) {
            gpTriangleSet = new Drumset()
            gpTriangleSet!.setDrum(80, drumInstrument(userName(80), NoteHeadGroup.HEAD_CROSS, 0, DirectionV.DOWN))
            gpTriangleSet!.setDrum(81, drumInstrument(userName(81), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.SHAKER:
        if (!gpShakerSet) {
            gpShakerSet = new Drumset()
            gpShakerSet!.setDrum(82, drumInstrument(userName(82), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.JINGLE_BELL:
        if (!gpJingleBellSet) {
            gpJingleBellSet = new Drumset()
            gpJingleBellSet!.setDrum(83, drumInstrument(userName(83), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.BELL_TREE:
        if (!gpBellTreeSet) {
            gpBellTreeSet = new Drumset()
            gpBellTreeSet!.setDrum(84, drumInstrument(userName(84), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.CASTANETS:
        if (!gpCastanetsSet) {
            gpCastanetsSet = new Drumset()
            gpCastanetsSet!.setDrum(85, drumInstrument(userName(85), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
        }
        break
    case DrumSetType.SURDO:
        if (!gpSurdoSet) {
            gpSurdoSet = new Drumset()
            gpSurdoSet!.setDrum(86, drumInstrument(userName(86), NoteHeadGroup.HEAD_NORMAL, 0, DirectionV.DOWN))
            gpSurdoSet!.setDrum(87, drumInstrument(userName(87), NoteHeadGroup.HEAD_CROSS, 0, DirectionV.DOWN))
        }
        break
    }
}

export function setInstrumentDrumset(instrument: Instrument, ds: GpDrumSet): void {
    switch (ds.idx) {
    case DrumSetType.DRUMS:
        instrument.setDrumset(gpDrumset)
        break
    case DrumSetType.AGOGO:
        instrument.setDrumset(gpAgogoSet)
        break
    case DrumSetType.HAND_CLAP:
        instrument.setDrumset(gpHandClapSet)
        break
    case DrumSetType.TAMBOURINE:
        instrument.setDrumset(gpTambourineSet)
        break
    case DrumSetType.COWBELL:
        instrument.setDrumset(gpCowbellSet)
        break
    case DrumSetType.VIBRASLAP:
        instrument.setDrumset(gpVibraslapSet)
        break
    case DrumSetType.BONGOS:
        instrument.setDrumset(gpBongosSet)
        break
    case DrumSetType.CONGAS:
        instrument.setDrumset(gpCongasSet)
        break
    case DrumSetType.TIMBALE:
        instrument.setDrumset(gpTimbalesSet)
        break
    case DrumSetType.CABASA:
        instrument.setDrumset(gpCabasaSet)
        break
    case DrumSetType.MARACAS:
        instrument.setDrumset(gpMaracasSet)
        break
    case DrumSetType.WHISTLE:
        instrument.setDrumset(gpWhistleSet)
        break
    case DrumSetType.GUIRO:
        instrument.setDrumset(gpGuiroSet)
        break
    case DrumSetType.CLAVES:
        instrument.setDrumset(gpClavesSet)
        break
    case DrumSetType.WOODBLOCK:
        instrument.setDrumset(gpWoodblockSet)
        break
    case DrumSetType.CUICA:
        instrument.setDrumset(gpCuicaSet)
        break
    case DrumSetType.TRIANGLE:
        instrument.setDrumset(gpTriangleSet)
        break
    case DrumSetType.SHAKER:
        instrument.setDrumset(gpShakerSet)
        break
    case DrumSetType.JINGLE_BELL:
        instrument.setDrumset(gpJingleBellSet)
        break
    case DrumSetType.BELL_TREE:
        instrument.setDrumset(gpBellTreeSet)
        break
    case DrumSetType.CASTANETS:
        instrument.setDrumset(gpCastanetsSet)
        break
    case DrumSetType.SURDO:
        instrument.setDrumset(gpSurdoSet)
        break
    }
}
