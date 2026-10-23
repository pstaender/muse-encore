/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gpbeat.h/.cpp
 */

import type { GPNote } from './gpnote'
import type { GPRhythm, GPRhythmRhytmType, GPRhythmTuplet } from './gprhythm'

export enum GPBeatDynamicType {
    FFF, FF, F, MF, MP, P, PP, PPP
}

export enum GPBeatLegatoType {
    None, Start, Mediate, End
}

export enum GPBeatArpeggio {
    None, Up, Down
}

export enum GPBeatBrush {
    None, Up, Down
}

export enum GPBeatGraceNotes {
    None, OnBeat, BeforeBeat
}

export enum GPBeatVibratoWTremBar {
    None, Slight, Wide
}

export enum GPBeatVibratoLeftHand {
    None, Slight, Wide
}

export enum GPBeatFadding {
    None, FadeIn, FadeOut, VolumeSwell
}

export enum GPBeatHairpin {
    None, Crescendo, Decrescendo
}

export enum GPBeatPickStroke {
    None, Up, Down
}

export enum GPBeatWah {
    None, Open, Closed
}

export enum GPBeatGolpe {
    None, Finger, Thumb
}

export enum GPBeatTappingHand {
    None, Right, Left
}

export enum GPBeatRasgueado {
    None, II_1, MII_1, MII_2, PMP_1, PMP_2, PEI_1, PEI_2, PAI_1, PAI_2, AMI_1,
    AMI_2, PPP_1, AMII_1, AMIP_1, EAMI_1, EAMII_1, PEAMI_1
}

export enum GPBeatOttavaType {
    None, ma15, va8, vb8, mb15
}

export enum GPBeatHarmonicMarkType {
    None, Artificial, Pinch, Tap, Semi, FeedBack
}

export class GPBeatHarmonicMarkInfo {
    artificial = false
    pinch = false
    tap = false
    semi = false
    feedback = false
}

export interface GPBeatTremolo {
    numerator: number
    denominator: number
}

export interface GPBeatBarre {
    fret: number
    string: number
}

export class GPBeatStemOrientation {
    up = false // taken in consideration only if userDefined == true
    userDefined = false
}

export enum GPBeatBeamMode {
    AUTO,
    JOINED,
    BROKEN,
    BROKEN2,
    BROKEN2_JOINED
}

/** GPBeat::Key (trackId, mbarId) as a map key */
function beatKey(ti: number, mi: number): string {
    return `${ti},${mi}`
}

export class GPBeat {
    private _id = -1
    private _notes: GPNote[] = []
    private _lyrics = new Map<string, string>()
    private _diagramIdx = new Map<string, number>()
    private _rhythm: GPRhythm | null = null
    private _dynamic = GPBeatDynamicType.MF
    private _legato = GPBeatLegatoType.None
    private _ottavaType = GPBeatOttavaType.None
    private _letRing = false
    private _palmMute = false
    private _trill = false
    private _tappingHand = GPBeatTappingHand.None
    private _slapped = false
    private _popped = false
    private _harmonicMarkInfo = new GPBeatHarmonicMarkInfo()
    private _arpeggio = GPBeatArpeggio.None
    private _brush = GPBeatBrush.None
    private _graceNotes = GPBeatGraceNotes.None
    private _time = -1
    private _freeText = ''
    private _vibratoWTremBar = GPBeatVibratoWTremBar.None
    private _vibratoLeftHand = GPBeatVibratoLeftHand.None
    private _fadding = GPBeatFadding.None
    private _hairpin = GPBeatHairpin.None
    private _rasgueado = GPBeatRasgueado.None
    private _pickStroke = GPBeatPickStroke.None
    private _tremolo: GPBeatTremolo = { numerator: -1, denominator: -1 }
    private _wah = GPBeatWah.None
    private m_golpe = GPBeatGolpe.None
    private _barre: GPBeatBarre = { fret: -1, string: -1 }
    private _arpeggioStretch = 0.0
    private m_dive = false // TODO-gp: implement dives
    private m_pickScrape = false
    private m_deadSlapped = false
    private m_stemOrientation = new GPBeatStemOrientation()
    private m_beamMode = GPBeatBeamMode.AUTO

    /** C++ comparePitch: higher pitch first */
    static comparePitch(a: GPNote, b: GPNote): boolean {
        const aPitch = a.midiPitch().octave * 12 + a.midiPitch().tone
        const bPitch = b.midiPitch().octave * 12 + b.midiPitch().tone
        return aPitch > bPitch
    }

    addGPNote(n: GPNote): void { this._notes.push(n) }

    sortGPNotes(): void {
        // std::sort is not stable; a stable sort gives the same result for distinct pitches
        this._notes.sort((a, b) => (GPBeat.comparePitch(a, b) ? -1 : GPBeat.comparePitch(b, a) ? 1 : 0))
    }

    addGPRhythm(n: GPRhythm): void { this._rhythm = n }
    setDynamic(t: GPBeatDynamicType): void { this._dynamic = t }
    setLegatoType(t: GPBeatLegatoType): void { this._legato = t }
    setOttavaType(ottavaType: GPBeatOttavaType): void { this._ottavaType = ottavaType }
    ottavaType(): GPBeatOttavaType { return this._ottavaType }
    isRest(): boolean { return this._notes.length === 0 }
    dynamic(): GPBeatDynamicType { return this._dynamic }
    legatoType(): GPBeatLegatoType { return this._legato }
    /** [dotCount, rhythm type] */
    lenth(): [number, GPRhythmRhytmType] { return this._rhythm!.length() }
    tuplet(): GPRhythmTuplet { return this._rhythm!.tuplet() }
    setLetRing(letRing: boolean): void { this._letRing = letRing }
    letRing(): boolean { return this._letRing }
    setPalmMute(palmMute: boolean): void { this._palmMute = palmMute }
    palmMute(): boolean { return this._palmMute }
    setTrill(trill: boolean): void { this._trill = trill }
    trill(): boolean { return this._trill }

    addHarmonicMarkType(type: GPBeatHarmonicMarkType): void {
        switch (type) {
        case GPBeatHarmonicMarkType.Artificial:
            this._harmonicMarkInfo.artificial = true
            break
        case GPBeatHarmonicMarkType.Pinch:
            this._harmonicMarkInfo.pinch = true
            break
        case GPBeatHarmonicMarkType.Tap:
            this._harmonicMarkInfo.tap = true
            break
        case GPBeatHarmonicMarkType.Semi:
            this._harmonicMarkInfo.semi = true
            break
        case GPBeatHarmonicMarkType.FeedBack:
            this._harmonicMarkInfo.feedback = true
            break
        case GPBeatHarmonicMarkType.None:
            break
        }
    }

    harmonicMarkArtificial(): boolean { return this._harmonicMarkInfo.artificial }
    harmonicMarkPinch(): boolean { return this._harmonicMarkInfo.pinch }
    harmonicMarkTap(): boolean { return this._harmonicMarkInfo.tap }
    harmonicMarkSemi(): boolean { return this._harmonicMarkInfo.semi }
    harmonicMarkFeedback(): boolean { return this._harmonicMarkInfo.feedback }
    setTappingHand(hand: GPBeatTappingHand): void { this._tappingHand = hand }
    tappingHand(): GPBeatTappingHand { return this._tappingHand }
    setSlapped(s: boolean): void { this._slapped = s }
    slapped(): boolean { return this._slapped }
    setPopped(s: boolean): void { this._popped = s }
    popped(): boolean { return this._popped }
    setArpeggio(ar: GPBeatArpeggio): void { this._arpeggio = ar }
    arpeggio(): GPBeatArpeggio { return this._arpeggio }
    setArpeggioStretch(arpeggioStretch: number): void { this._arpeggioStretch = arpeggioStretch }
    arpeggioStretch(): number { return this._arpeggioStretch }
    setBrush(br: GPBeatBrush): void { this._brush = br }
    brush(): GPBeatBrush { return this._brush }
    setGraceNotes(gn: GPBeatGraceNotes): void { this._graceNotes = gn }
    graceNotes(): GPBeatGraceNotes { return this._graceNotes }
    setFreeText(s: string): void { this._freeText = s }
    freeText(): string { return this._freeText }
    setTime(t: number): void { this._time = t }
    time(): number { return this._time }
    setVibratoWTremBar(v: GPBeatVibratoWTremBar): void { this._vibratoWTremBar = v }
    vibratoWTremBar(): GPBeatVibratoWTremBar { return this._vibratoWTremBar }
    setVibratoLeftHand(v: GPBeatVibratoLeftHand): void { this._vibratoLeftHand = v }
    vibratoLeftHand(): GPBeatVibratoLeftHand { return this._vibratoLeftHand }
    setFadding(f: GPBeatFadding): void { this._fadding = f }
    fadding(): GPBeatFadding { return this._fadding }
    setHairpin(h: GPBeatHairpin): void { this._hairpin = h }
    hairpin(): GPBeatHairpin { return this._hairpin }
    setRasgueado(r: GPBeatRasgueado): void { this._rasgueado = r }
    rasgueado(): GPBeatRasgueado { return this._rasgueado }
    setPickStroke(p: GPBeatPickStroke): void { this._pickStroke = p }
    pickStroke(): GPBeatPickStroke { return this._pickStroke }
    setTremolo(tr: GPBeatTremolo): void { this._tremolo = { ...tr } }
    tremolo(): GPBeatTremolo { return { ...this._tremolo } }
    setWah(w: GPBeatWah): void { this._wah = w }
    wah(): GPBeatWah { return this._wah }
    setGolpe(g: GPBeatGolpe): void { this.m_golpe = g }
    golpe(): GPBeatGolpe { return this.m_golpe }
    setBarreFret(v: number): void { this._barre.fret = v }
    setBarreString(v: number): void { this._barre.string = v }
    barre(): GPBeatBarre { return { ...this._barre } }
    setId(id: number): void { this._id = id }
    id(): number { return this._id }
    setDive(dive: boolean): void { this.m_dive = dive }
    dive(): boolean { return this.m_dive }
    setPickScrape(pickScrape: boolean): void { this.m_pickScrape = pickScrape }
    pickScrape(): boolean { return this.m_pickScrape }
    setDeadSlapped(deadSlapped: boolean): void { this.m_deadSlapped = deadSlapped }
    deadSlapped(): boolean { return this.m_deadSlapped }
    setStemOrientationUp(up: boolean): void { this.m_stemOrientation.up = up }
    setStemOrientationUserDefined(userDefined: boolean): void { this.m_stemOrientation.userDefined = userDefined }
    stemOrientationUp(): boolean { return this.m_stemOrientation.up }
    stemOrientationUserDefined(): boolean { return this.m_stemOrientation.userDefined }
    setBeamMode(mode: GPBeatBeamMode): void { this.m_beamMode = mode }
    beamMode(): GPBeatBeamMode { return this.m_beamMode }
    notes(): GPNote[] { return this._notes }

    /**
     * NOTE In GP version 6.2.0+ already arranged lyrics are written into bits, so the lyrics field of the beat is enough.
     * In earlier versions of GP, the same beat can be used in different bars with different lyrics, so the lyrics are
     * keyed by the track and the master bar (-1, -1 = the beat's own lyrics).
     * C++ setLyrics(ly) and setLyrics(ti, mi, ly)
     */
    setLyrics(ti: number | string, mi?: number, ly?: string): void {
        if (typeof ti === 'string') {
            this._lyrics.set(beatKey(-1, -1), ti)
        } else {
            this._lyrics.set(beatKey(ti, mi!), ly!)
        }
    }

    lyrics(ti = -1, mi = -1): string {
        const v = this._lyrics.get(beatKey(ti, mi))
        if (v === undefined) {
            if (ti !== -1 && mi !== -1) {
                return this.lyrics(-1, -1)
            }
            return ''
        }
        return v
    }

    /** NOTE Same problem as with lyrics; C++ setDiagramIdx(idx) and setDiagramIdx(ti, mi, idx) */
    setDiagramIdx(ti: number, mi?: number, idx?: number): void {
        if (mi === undefined) {
            this._diagramIdx.set(beatKey(-1, -1), ti)
        } else {
            this._diagramIdx.set(beatKey(ti, mi), idx!)
        }
    }

    diagramIdx(ti = -1, mi = -1): number {
        const v = this._diagramIdx.get(beatKey(ti, mi))
        if (v === undefined) {
            if (ti !== -1 && mi !== -1) {
                return this.diagramIdx(-1, -1)
            }
            return -1
        }
        return v
    }
}
