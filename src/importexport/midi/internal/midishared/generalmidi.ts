/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midishared/generalmidi.h/.cpp
 */

/** General MIDI Level 1 program numbers */
export enum GM1Program {
    // 0-7: Piano
    AcousticGrandPiano = 0,
    BrightAcousticPiano,
    ElectricGrandPiano,
    HonkyTonkPiano,
    ElectricPiano1,
    ElectricPiano2,
    Harpsichord,
    Clavi,
    // 8-15: Chromatic Percussion
    Celesta,
    Glockenspiel,
    MusicBox,
    Vibraphone,
    Marimba,
    Xylophone,
    TubularBells,
    Dulcimer,
    // 16-23: Organ
    DrawbarOrgan,
    PercussiveOrgan,
    RockOrgan,
    ChurchOrgan,
    ReedOrgan,
    Accordion,
    Harmonica,
    TangoAccordion,
    // 24-31: Guitar
    AcousticGuitarNylon,
    AcousticGuitarSteel,
    ElectricGuitarJazz,
    ElectricGuitarClean,
    ElectricGuitarMuted,
    OverdrivenGuitar,
    DistortionGuitar,
    GuitarHarmonics,
    // 32-39: Bass
    AcousticBass,
    ElectricBassFinger,
    ElectricBassPick,
    FretlessBass,
    SlapBass1,
    SlapBass2,
    SynthBass1,
    SynthBass2,
    // 40-47: Strings
    Violin,
    Viola,
    Cello,
    Contrabass,
    TremoloStrings,
    PizzicatoStrings,
    OrchestralHarp,
    Timpani,
    // 48-55: Ensemble
    StringEnsemble1,
    StringEnsemble2,
    SynthStrings1,
    SynthStrings2,
    ChoirAahs,
    VoiceOohs,
    SynthVoice,
    OrchestraHit,
    // 56-63: Brass
    Trumpet,
    Trombone,
    Tuba,
    MutedTrumpet,
    FrenchHorn,
    BrassSection,
    SynthBrass1,
    SynthBrass2,
    // 64-71: Reed
    SopranoSax,
    AltoSax,
    TenorSax,
    BaritoneSax,
    Oboe,
    EnglishHorn,
    Bassoon,
    Clarinet,
    // 72-79: Pipe
    Piccolo,
    Flute,
    Recorder,
    PanFlute,
    BlownBottle,
    Shakuhachi,
    Whistle,
    Ocarina,
    // 80-87: Synth Lead
    Lead1Square,
    Lead2Sawtooth,
    Lead3Calliope,
    Lead4Chiff,
    Lead5Charang,
    Lead6Voice,
    Lead7Fifths,
    Lead8BassAndLead,
    // 88-95: Synth Pad
    Pad1NewAge,
    Pad2Warm,
    Pad3Polysynth,
    Pad4Choir,
    Pad5Bowed,
    Pad6Metallic,
    Pad7Halo,
    Pad8Sweep,
    // 96-103: Synth Effects
    FX1Rain,
    FX2Soundtrack,
    FX3Crystal,
    FX4Atmosphere,
    FX5Brightness,
    FX6Goblins,
    FX7Echoes,
    FX8SciFi,
    // 104-111: Ethnic
    Sitar,
    Banjo,
    Shamisen,
    Koto,
    Kalimba,
    BagPipe,
    Fiddle,
    Shanai,
    // 112-119: Percussive
    TinkleBell,
    Agogo,
    SteelDrums,
    Woodblock,
    TaikoDrum,
    MelodicTom,
    SynthDrum,
    ReverseCymbal,
    // 120-127: Sound Effects
    GuitarFretNoise,
    BreathNoise,
    Seashore,
    BirdTweet,
    TelephoneRing,
    Helicopter,
    Applause,
    Gunshot,
}

/** std::optional<GM1Program>: null if the value is not a GM1 program */
export function toGm1Program(v: number): GM1Program | null {
    v &= 0xff
    if (v > 127) {
        return null
    }
    return v as GM1Program
}

export function toMidiData(p: GM1Program): number {
    return p & 0xff
}

const GM1_PROGRAM_DATA: readonly string[] = [
    "Grand Piano", // AcousticGrandPiano
    "Bright Piano", // BrightAcousticPiano
    "E.Grand", // ElectricGrandPiano
    "Honky-tonk", // HonkyTonkPiano
    "E.Piano", // ElectricPiano1
    "E.Piano 2", // ElectricPiano2
    "Harpsichord", // Harpsichord
    "Clav.", // Clavi
    "Celesta", // Celesta
    "Glockenspiel", // Glockenspiel
    "Music Box", // MusicBox
    "Vibraphone", // Vibraphone
    "Marimba", // Marimba
    "Xylophone", // Xylophone
    "Tubular Bells", // TubularBells
    "Dulcimer", // Dulcimer
    "Drawbar Organ", // DrawbarOrgan
    "Perc. Organ", // PercussiveOrgan
    "Rock Organ", // RockOrgan
    "Church Organ", // ChurchOrgan
    "Reed Organ", // ReedOrgan
    "Akkordion", // Accordion
    "Harmonica", // Harmonica
    "Bandoneon", // TangoAccordion
    "Nylon Gtr.", // AcousticGuitarNylon
    "Steel Gtr.", // AcousticGuitarSteel
    "Jazz Guitar", // ElectricGuitarJazz
    "Clean Guitar", // ElectricGuitarClean
    "Muted Guitar", // ElectricGuitarMuted
    "Overdrive Gtr", // OverdrivenGuitar
    "DistortionGtr", // DistortionGuitar
    "Gtr.Harmonics", // GuitarHarmonics
    "Acoustic Bass", // AcousticBass
    "Fingered Bass", // ElectricBassFinger
    "Picked Bass", // ElectricBassPick
    "Fretless Bass", // FretlessBass
    "Slap Bass 1", // SlapBass1
    "Slap Bass 2", // SlapBass2
    "Synth Bass 1", // SynthBass1
    "Synth Bass 2", // SynthBass2
    "Violin", // Violin
    "Viola", // Viola
    "Cello", // Cello
    "Contrabass", // Contrabass
    "Tremolo Str.", // TremoloStrings
    "PizzicatoStr.", // PizzicatoStrings
    "Harp", // OrchestralHarp
    "Timpani", // Timpani
    "Strings 1", // StringEnsemble1
    "Strings 2", // StringEnsemble2
    "Syn.Strings 1", // SynthStrings1
    "Syn.Strings 2", // SynthStrings2
    "Choir Aahs", // ChoirAahs
    "Voice Oohs", // VoiceOohs
    "Synth Voice", // SynthVoice
    "Orchestra Hit", // OrchestraHit
    "Trumpet", // Trumpet
    "Trombone", // Trombone
    "Tuba", // Tuba
    "Muted Trumpet", // MutedTrumpet
    "French Horn", // FrenchHorn
    "Brass Section", // BrassSection
    "Synth Brass 1", // SynthBrass1
    "Synth Brass 2", // SynthBrass2
    "Soprano Sax", // SopranoSax
    "Alto Sax", // AltoSax
    "Tenor Sax", // TenorSax
    "Baritone Sax", // BaritoneSax
    "Oboe", // Oboe
    "English Horn", // EnglishHorn
    "Bassoon", // Bassoon
    "Clarinet", // Clarinet
    "Piccolo", // Piccolo
    "Flute", // Flute
    "Recorder", // Recorder
    "Pan Flute", // PanFlute
    "Blown Bottle", // BlownBottle
    "Shakuhachi", // Shakuhachi
    "Whistle", // Whistle
    "Ocarina", // Ocarina
    "Square Wave", // Lead1Square
    "Saw Wave", // Lead2Sawtooth
    "Calliope", // Lead3Calliope
    "Chiffer Lead", // Lead4Chiff
    "Charang", // Lead5Charang
    "Solo Vox", // Lead6Voice
    "Fifth Saw", // Lead7Fifths
    "Bass Lead", // Lead8BassAndLead
    "New Age Pad", // Pad1NewAge
    "Warm Pad", // Pad2Warm
    "Polysynth Pad", // Pad3Polysynth
    "Choir Pad", // Pad4Choir
    "Bowed Pad", // Pad5Bowed
    "Metallic Pad", // Pad6Metallic
    "Halo Pad", // Pad7Halo
    "Sweep Pad", // Pad8Sweep
    "Rain", // FX1Rain
    "Soundtrack", // FX2Soundtrack
    "Crystal", // FX3Crystal
    "Athmosphere", // FX4Atmosphere
    "Brightness", // FX5Brightness
    "Goblins", // FX6Goblins
    "Echoes", // FX7Echoes
    "Sci-Fi", // FX8SciFi
    "Sitar", // Sitar
    "Banjo", // Banjo
    "Shamisen", // Shamisen
    "Koto", // Koto
    "Kalimba", // Kalimba
    "Bagpipe", // BagPipe
    "Fiddle", // Fiddle
    "Shanai", // Shanai
    "Tinkle Bell", // TinkleBell
    "Agogo", // Agogo
    "Steel Drums", // SteelDrums
    "Woodblock", // Woodblock
    "Taiko Drum", // TaikoDrum
    "Melodic Drum", // MelodicTom
    "Synth Drum", // SynthDrum
    "Rev. Cymbal", // ReverseCymbal
    "GtrFret Noise", // GuitarFretNoise
    "Breath Noise", // BreathNoise
    "Seashore", // Seashore
    "Bird Tweed", // BirdTweet
    "Telephone", // TelephoneRing
    "Helicopter", // Helicopter
    "Applaus", // Applause
    "Gunshot", // Gunshot
]

export function getMidiName(program: GM1Program): string {
    return GM1_PROGRAM_DATA[program]
}
