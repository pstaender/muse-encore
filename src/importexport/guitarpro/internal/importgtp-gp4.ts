/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/importgtp-gp4.cpp (GuitarPro4: Guitar Pro 4 files)
 */

import type { Buffer } from '../../../framework/global/io/buffer'
import { Arpeggio } from '../../../engraving/dom/arpeggio'
import { Articulation } from '../../../engraving/dom/articulation'
import { Chord } from '../../../engraving/dom/chord'
import type { ChordLine } from '../../../engraving/dom/chordline'
import type { ChordRest } from '../../../engraving/dom/chordrest'
import { NoteType } from '../../../engraving/dom/chordrest'
import { Clef } from '../../../engraving/dom/clef'
import { ClefTypeList } from '../../../engraving/dom/clefinfo'
import { TDuration } from '../../../engraving/dom/durationtype'
import { Factory } from '../../../engraving/dom/factory'
import { Fingering } from '../../../engraving/dom/fingering'
import { Glissando } from '../../../engraving/dom/glissando'
import { defaultClef } from '../../../engraving/dom/instrtemplate'
import { Lyrics } from '../../../engraving/dom/lyrics'
import type { Measure } from '../../../engraving/dom/measure'
import { Repeat } from '../../../engraving/dom/measurebase'
import { Note } from '../../../engraving/dom/note'
import { NoteDot } from '../../../engraving/dom/notedot'
import { Part } from '../../../engraving/dom/part'
import { MAX_PITCH } from '../../../engraving/dom/pitchspelling'
import { RehearsalMark } from '../../../engraving/dom/rehearsalmark'
import { Rest } from '../../../engraving/dom/rest'
import { Segment, SegmentType } from '../../../engraving/dom/segment'
import { Slur } from '../../../engraving/dom/slur'
import { SpannerAnchor } from '../../../engraving/dom/spanner'
import type { Staff } from '../../../engraving/dom/staff'
import { StaffText } from '../../../engraving/dom/stafftextbase'
import { StaffType, StaffTypes } from '../../../engraving/dom/stafftype'
import { StringData } from '../../../engraving/dom/stringdata'
import { Tie } from '../../../engraving/dom/tie'
import { TremoloSingleChord } from '../../../engraving/dom/tremolosinglechord'
import type { Tuplet } from '../../../engraving/dom/tuplet'
import { scoreDummy } from '../../../engraving/compat/dummyelement'
import { Constants } from '../../../engraving/types/constants'
import { Fraction } from '../../../engraving/types/fraction'
import { SymId } from '../../../engraving/types/symid'
import { Sid } from '../../../engraving/style/styledef'
import {
    ArpeggioType, BarLineType, ChordLineType, ClefType, DurationType, ElementType, GlissandoType, NoteHeadGroup, TremoloType,
    VOICES, type track_idx_t,
} from '../../../engraving/types/types'
import { ContiniousElementsBuilder } from './continiouselementsbuilder'
import { GuitarBendImporter } from './guitarbendimport/guitarbendimporter'
import * as drumset from './guitarprodrumset'
import { EngravingConfiguration } from '../../../engraving/internal/engravingconfiguration'
import {
    GP_DEFAULT_PERCUSSION_CHANNEL, GP_MAX_STRING_NUMBER, GP_VOLTA_BINARY, GpBar, GuitarPro, GuitarProReadNoteResult,
} from './importgtp'

export class GuitarPro4 extends GuitarPro {
    private curDynam: number[] = []
    private tupleKind: number[] = []

    //---------------------------------------------------------
    //   readMixChange
    //---------------------------------------------------------

    protected override readMixChange(measure: Measure): boolean {
        /*char patch   =*/
        this.readChar()
        const volume = this.readChar()
        const pan = this.readChar()
        const chorus = this.readChar()
        const reverb = this.readChar()
        const phase = this.readChar()
        const tremolo = this.readChar()
        const temp = this.readInt()

        let tempoEdited = false

        if (volume >= 0) {
            this.readChar()
        }
        if (pan >= 0) {
            this.readChar()
        }
        if (chorus >= 0) {
            this.readChar()
        }
        if (reverb >= 0) {
            this.readChar()
        }
        if (phase >= 0) {
            this.readChar()
        }
        if (tremolo >= 0) {
            this.readChar()
        }
        if (temp >= 0) {
            if (this.last_segment) {
                this.score.setTempo(this.last_segment.tick(), temp / 60.0)
                this.last_segment = null
            }
            if (temp !== this.previousTempo) {
                this.previousTempo = temp
                this.setTempo(temp, measure)
            }
            this.readChar()
            tempoEdited = true
        }

        this.readChar() // bitmask: what should be applied to all tracks
        return tempoEdited
    }

    //---------------------------------------------------------
    //   readBeatEffects
    //---------------------------------------------------------

    protected override readBeatEffects(track: number, segment: Segment): number {
        let effects = 0
        const fxBits1 = this.readUInt8()
        const fxBits2 = this.readUInt8()
        if (fxBits1 & GuitarPro.BEAT_FADE) {
            effects = 4 // fade in
        }
        if (fxBits1 & GuitarPro.BEAT_EFFECT) {
            effects = this.readUInt8() // effect 1-tapping, 2-slapping, 3-popping
        }
        if (fxBits2 & GuitarPro.BEAT_TREMOLO) {
            this.readTremoloBar(track, segment)
        }
        if (fxBits1 & GuitarPro.BEAT_ARPEGGIO) {
            const strokeup = this.readUInt8() // up stroke length
            const strokedown = this.readUInt8() // down stroke length

            let a: Arpeggio | null = new Arpeggio(scoreDummy(this.score).chord())
            if (strokeup > 0) {
                a.setArpeggioType(ArpeggioType.UP_STRAIGHT)
                if (strokeup < 7) {
                    a.setStretch(1.0 / Math.pow(2, 6 - strokeup))
                }
            } else if (strokedown > 0) {
                a.setArpeggioType(ArpeggioType.DOWN_STRAIGHT)
                if (strokedown < 7) {
                    a.setStretch(1.0 / Math.pow(2, 6 - strokedown))
                }
            } else {
                a = null
            }

            if (a) {
                const cr = new Chord(segment)
                cr.setTrack(track)
                cr.add(a)
                segment.add(cr)
            }
        }
        if (fxBits2 & GuitarPro.BEAT_STROKE_DIR) {
            effects = this.readUInt8() // stroke pick direction
            effects += 4 //1 or 2 for effects becomes 4 or 5
        }
        if (fxBits1 & 0x01) { // GP3 column-wide vibrato
        }
        if (fxBits1 & 0x2) { // GP3 column-wide wide vibrato (="tremolo" in GP3)
        }
        return effects
    }

    //---------------------------------------------------------
    //   readNote
    //---------------------------------------------------------

    private readNote(string: number, staffIdx: number, note: Note): GuitarProReadNoteResult {
        const noteBits = this.readUInt8()

        //
        // noteBits:
        //   80 - Right hand or left hand fingering;
        //   40 - Accentuated note
        //   20 - Note type (rest, empty note, normal note);
        //   10 - note dynamic;
        //    8 - Presence of effects linked to the note;
        //    4 - Ghost note;
        //    2 - Dotted note;  ?
        //    1 - Time-independent duration

        if (noteBits & GuitarPro.BEAT_TREMOLO) {
            //note->setHeadGroup(NoteHeadGroup::HEAD_CROSS);
            note.setGhost(true)
        }

        let tieNote = false
        let variant = 1
        if (noteBits & GuitarPro.BEAT_EFFECT) { // 0x20
            variant = this.readUInt8()
            if (variant === 1) { // normal note
            } else if (variant === 2) {
                /* guitar pro 4 bundles tied notes with slides in the representation
                 * we take note when we see ties and do not create slides for these notes. */
                this.slides.set(staffIdx * VOICES, -2)
                tieNote = true
            } else if (variant === 3) { // dead notes = ghost note
                note.setHeadGroup(NoteHeadGroup.HEAD_CROSS)
                note.setDeadNote(true)
            } else {
                console.debug(`unknown note variant: ${variant}`)
            }
        }

        if (noteBits & 0x1) { // note != beat
            this.readUInt8() // length
            this.readUInt8() // t
        }
        if (noteBits & 0x2) { // note is dotted
            //readUInt8();
        }

        const track = note.track()

        // set dynamic information on note if different from previous note
        if (noteBits & GuitarPro.NOTE_DYNAMIC) { // 0x10
            const d = this.readChar()
            if (this.previousDynamicByTrack[track] !== d) {
                this.previousDynamicByTrack[track] = d
                this.addDynamic(note, d)
            }
        } else if (this.previousDynamicByTrack[track] !== GuitarPro.DEFAULT_DYNAMIC) {
            this.previousDynamicByTrack[track] = GuitarPro.DEFAULT_DYNAMIC
            this.addDynamic(note, this.previousDynamicByTrack[track])
        }

        let fretNumber = -1
        if (noteBits & GuitarPro.NOTE_FRET) { // 0x20
            // TODO: special case if note is tied
            fretNumber = this.readUInt8()
        }

        // check if a note is supposed to be accented, and give it the sforzato type
        if (noteBits & GuitarPro.NOTE_SFORZATO) { // 0x40
            const art = new Articulation(scoreDummy(note.score()).chord())
            art.setSymId(SymId.articAccentAbove)
            note.score().toggleArticulation(note, art)
        }

        if (noteBits & GuitarPro.NOTE_FINGERING) { // 0x80
            const leftFinger = this.readUInt8()
            const rightFinger = this.readUInt8()
            const fi = new Fingering(note)
            let finger = ''
            // if there is a valid left hand fingering
            if (leftFinger < 5) {
                if (leftFinger === 0) {
                    finger = 'T'
                } else if (leftFinger === 1) {
                    finger = '1'
                } else if (leftFinger === 2) {
                    finger = '2'
                } else if (leftFinger === 3) {
                    finger = '3'
                } else if (leftFinger === 4) {
                    finger = '4'
                }
            } else {
                if (rightFinger === 0) {
                    finger = 'T'
                } else if (rightFinger === 1) {
                    finger = 'I'
                } else if (rightFinger === 2) {
                    finger = 'M'
                } else if (rightFinger === 3) {
                    finger = 'A'
                } else if (rightFinger === 4) {
                    finger = 'O'
                }
            }
            fi.setPlainText(finger)
            note.add(fi)
            fi.reset()
        }

        const readResult = new GuitarProReadNoteResult()
        let modMask2 = 0
        if (noteBits & GuitarPro.BEAT_EFFECTS) {
            const modMask1 = this.readUInt8()
            modMask2 = this.readUInt8()
            if (modMask1 & GuitarPro.EFFECT_BEND) {
                this.readBend(note)
            }
            if (modMask1 & GuitarPro.EFFECT_HAMMER) {
                readResult.hammerOnPullOff = true
            }
            if (modMask1 & GuitarPro.EFFECT_LET_RING) {
                readResult.letRing = true
            }
            if (modMask2 & GuitarPro.EFFECT_VIBRATO) {
                readResult.vibrato = true
            }
            if (modMask1 & GuitarPro.EFFECT_GRACE) {
                let fret = this.readUInt8() // grace fret
                const dynamic = this.readUInt8() // grace dynamic
                const transition = this.readUInt8() // grace transition
                const duration = this.readUInt8() // grace duration

                let grace_len = Constants.DIVISION / 8
                if (duration === 1) {
                    grace_len = Constants.DIVISION / 8 //32nd
                } else if (duration === 2) {
                    grace_len = Constants.DIVISION / 6 //24th
                } else if (duration === 3) {
                    grace_len = Constants.DIVISION / 4 //16th
                }
                const gn = new Note(scoreDummy(this.score).chord())

                if (fret === 255) {
                    gn.setHeadGroup(NoteHeadGroup.HEAD_CROSS)
                    gn.setGhost(true)
                }
                if (fret === 255) {
                    fret = 0
                }
                gn.setFret(fret)
                gn.setString(string)
                const grace_pitch = note.part()!.instrument().stringData().getPitchForStaff(string, fret, null)
                gn.setPitch(grace_pitch)
                gn.setTpcFromPitch()

                const gc = new Chord(scoreDummy(this.score).segment())
                gc.setTrack(note.chord()!.track())
                gc.add(gn)
                gc.setParent(note.chord())

                const d = new TDuration()
                d.setVal(grace_len)
                if (grace_len === Constants.DIVISION / 6) {
                    d.setDots(1)
                }
                gc.setDurationType(d)
                gc.setTicks(d.fraction())
                gc.setNoteType(NoteType.ACCIACCATURA)
                gc.mutldata().setMag(note.chord()!.staff()!.staffMag(new Fraction(0, 1)) * this.score.style().styleD(Sid.graceNoteMag))
                note.chord()!.add(gc)
                this.addDynamic(gn, dynamic)

                if (transition === 0) {
                    // no transition
                } else if (transition === 1) {
                    //TODO: Add a 'slide' guitar effect when implemented
                    //TODO-ws               note->setSlideNote(gn);
                } else if (transition === 2 && fretNumber >= 0 && fretNumber <= 255 && fretNumber !== gn.fret()) {
                } else if (transition === 3) {
                    // TODO:
                    //     major: replace with a 'hammer-on' guitar effect when implemented
                    //     minor: make slurs for parts

                    const cr1: ChordRest = gc
                    const cr2: ChordRest = note.chord()!

                    const slur1 = new Slur(scoreDummy(this.score))
                    slur1.setAnchor(SpannerAnchor.CHORD)
                    slur1.setStartElement(cr1)
                    slur1.setEndElement(cr2)
                    slur1.setTick(cr1.tick())
                    slur1.setTick2(cr2.tick())
                    slur1.setTrack(cr1.track())
                    slur1.setTrack2(cr2.track())
                    // this case specifies only two-note slurs, don't set a parent
                    this.score.undoAddElement(slur1)
                }
            }
            if (modMask2 & GuitarPro.EFFECT_STACCATO) { // staccato
                const chord = note.chord()!
                const a = new Articulation(chord)
                a.setSymId(SymId.articStaccatoAbove)
                chord.add(a)
            }
            if (modMask2 & GuitarPro.EFFECT_PALM_MUTE) {
                readResult.palmMute = true
            }

            if (modMask2 & GuitarPro.EFFECT_TREMOLO) { // tremolo picking length
                const tremoloDivision = this.readUInt8()
                const chord = note.chord()!
                let type = TremoloType.INVALID_TREMOLO
                if (tremoloDivision === 1) {
                    type = TremoloType.R8
                } else if (tremoloDivision === 2) {
                    type = TremoloType.R16
                } else if (tremoloDivision === 3) {
                    type = TremoloType.R32
                } else {
                    console.debug('Unknown tremolo value')
                }

                if (type !== TremoloType.INVALID_TREMOLO) {
                    const t = new TremoloSingleChord(chord)
                    t.setTremoloType(type)
                    chord.add(t)
                }
            }
            if (modMask2 & GuitarPro.EFFECT_SLIDE) {
                const slideKind = this.readUInt8()
                // if slide >= 4 then we are not dealing with legato slide nor shift slide
                if (slideKind >= 3 || slideKind === 254 || slideKind === 255) {
                    this.slide = slideKind
                } else {
                    //slides[note->chord()->track()] = slideKind;
                    this.slideList.push(note)
                }
                if (slideKind === 2) {
                    readResult.slur = true
                }
            }

            if (modMask2 & GuitarPro.EFFECT_TRILL) {
                this.readUInt8()
                /*int period =*/ this.readUInt8() // trill length
                readResult.trill = true
            }
        }
        if (fretNumber === -1) {
            console.debug(`Note: no fret number, tie ${tieNote}`)
        }
        const staff = note.staff()!
        if (fretNumber === 255) {
            fretNumber = 0
            note.setHeadGroup(NoteHeadGroup.HEAD_CROSS)
            note.setGhost(true)
        }
        // dead note represented as high numbers - fix to zero
        if (fretNumber > 99 || fretNumber === -1) {
            fretNumber = 0
        }
        const pitch = staff.part()!.instrument().stringData().getPitchForStaff(string, fretNumber, null)
        note.setFret(fretNumber)
        note.setString(string)
        note.setPitch(Math.min(pitch, MAX_PITCH))

        if (modMask2 & 0x10) {
            const type = this.readUInt8() // harmonic kind
            if (type === 1) { //Natural
                note.setHarmonic(false)
            } else if (type === 3) { // Tapped
                readResult.harmonicTap = true
            } else if (type === 4) { //Pinch
                readResult.harmonicPinch = true
            } else if (type === 5) { //semi
                readResult.harmonicSemi = true
            } else { //Artificial
                readResult.harmonicArtificial = true
                let harmonicFret = note.fret()
                harmonicFret += type - 10
                const harmonicNote = new Note(note.chord())
                note.chord()!.add(harmonicNote)
                harmonicNote.setFret(harmonicFret)
                harmonicNote.setString(note.string())
                harmonicNote.setPitch(note.staff()!.part()!.instrument().stringData().getPitchForStaff(note.string(), harmonicFret, null))
                harmonicNote.setTpcFromPitch()
            }
        }

        if (tieNote) {
            const si = note.staffIdx()
            if (this.slurs[si]) {
                this.score.removeSpanner(this.slurs[si]!)
                this.slurs[si] = null
            }
            let found = false
            const chord = note.chord()!
            let segment = chord.segment()!.prev1(SegmentType.ChordRest)
            const track = note.track()
            const chords: ChordRest[] = []
            let true_note: Note | null = null
            while (segment) {
                const e = segment.element(track)
                if (e) {
                    if (e.isChord()) {
                        const chord2 = e as unknown as Chord
                        for (const note2 of chord2.notes()) {
                            if (note2.string() === string) {
                                if (chords.length === 0) {
                                    const tie = new Tie(note2)
                                    tie.setEndNote(note)
                                    note2.add(tie)
                                }
                                note.setFret(note2.fret())
                                note.setPitch(note2.pitch())
                                true_note = note2
                                found = true
                                break
                            }
                        }
                    }
                    if (found) {
                        break
                    } else if (e) {
                        chords.push(e as unknown as ChordRest)
                    }
                }
                segment = segment.prev1(SegmentType.ChordRest)
            }
            if (true_note && chords.length) {
                let end_note = note
                for (let i = 0; i < chords.length; ++i) {
                    let chord1: Chord
                    const cr = chords[i]
                    if (cr.isChord()) {
                        chord1 = cr as Chord
                    } else {
                        const rest = cr as Rest
                        const dur = rest.ticks()
                        const dut = rest.durationType()
                        const seg = rest.segment()!
                        seg.remove(rest)
                        const tuplet = rest.tuplet()
                        if (tuplet) {
                            tuplet.remove(rest)
                        }
                        chord1 = new Chord(seg)
                        chord1.setTrack(note.track())
                        chord1.setTicks(dur)
                        chord1.setDurationType(dut)
                        seg.add(chord1)
                        if (tuplet) {
                            tuplet.add(chord1)
                        }
                    }

                    const note2 = new Note(chord1)
                    note2.setString(true_note.string())
                    note2.setFret(true_note.fret())
                    note2.setPitch(true_note.pitch())
                    note2.setTpcFromPitch()
                    chord1.setNoteType(true_note.noteType())
                    chord1.add(note2)
                    const tie = new Tie(note2)
                    tie.setEndNote(end_note)
                    end_note.setHarmonic(true_note.harmonic())
                    end_note = note2
                    note2.add(tie)
                }
                const tie = new Tie(true_note)
                tie.setEndNote(end_note)
                end_note.setHarmonic(true_note.harmonic())
                true_note.add(tie)
            }
            if (!found) {
                console.debug(`tied note not found, pitch ${note.pitch()} fret ${note.fret()} string ${note.string()}`)
                readResult.slur = false
                return readResult
            }
        }

        return readResult
    }

    //---------------------------------------------------------
    //   readInfo
    //---------------------------------------------------------

    private readInfo(): void {
        this.title = this.readDelphiString()
        this.subtitle = this.readDelphiString()
        this.artist = this.readDelphiString()
        this.album = this.readDelphiString()
        this.composer = this.readDelphiString()
        const copyright = this.readDelphiString()
        if (copyright) {
            this.score.setMetaTag('copyright', copyright)
        }

        this.readDelphiString() // transcriber
        this.readDelphiString() // instructions
        const n = this.readInt()
        for (let i = 0; i < n; ++i) {
            this.comments.push(this.readDelphiString())
        }
    }

    //---------------------------------------------------------
    //   convertGP4SlideNum
    //---------------------------------------------------------

    private convertGP4SlideNum(sl: number): number {
        switch (sl) {
        case 1:
            return GuitarPro.SHIFT_SLIDE
        case 2:
            return GuitarPro.LEGATO_SLIDE
        case 3: // slide out downwards
            return GuitarPro.SLIDE_OUT_DOWN
        case 4: // slide out upwards
            return GuitarPro.SLIDE_OUT_UP
        case 254: // slide in from above
            return GuitarPro.SLIDE_IN_ABOVE
        case 255: // slide in from below
            return GuitarPro.SLIDE_IN_BELOW
        }
        return sl
    }

    //---------------------------------------------------------
    //   read
    //---------------------------------------------------------

    override read(io: Buffer): boolean {
        this.m_continiousElementsBuilder = new ContiniousElementsBuilder(this.score)
        this.m_guitarBendImporter = new GuitarBendImporter(this.score)

        this.f = io
        this.curPos = 30

        this.readInfo()
        this.readUInt8() // triplet feeling
        this.readLyrics()

        const temp = this.readInt()
        this.key = this.readInt()
        /*int octave =*/ this.readUInt8() // octave

        this.previousTempo = -1

        this.readChannels()
        this.measures = this.readInt()
        this.staves = this.readInt()

        this.initDynamics(this.staves)

        this.curDynam = new Array<number>(this.staves * VOICES).fill(-1)

        let tnumerator = 4
        let tdenominator = 4
        for (let i = 0; i < this.measures; ++i) {
            const bar = new GpBar()
            const barBits = this.readUInt8()
            if (barBits & GuitarPro.SCORE_TIMESIG_NUMERATOR) {
                tnumerator = this.readUInt8()
            }
            if (barBits & GuitarPro.SCORE_TIMESIG_DENOMINATOR) {
                tdenominator = this.readUInt8()
            }
            if (barBits & GuitarPro.SCORE_REPEAT_START) {
                bar.repeatFlags = bar.repeatFlags | Repeat.START
            }
            if (barBits & GuitarPro.SCORE_REPEAT_END) { // number of repeats
                bar.repeatFlags = bar.repeatFlags | Repeat.END
                bar.repeats = this.readUInt8() + 1
            }
            if (barBits & GuitarPro.SCORE_VOLTA) { // a volta
                let voltaNumber = this.readUInt8()
                while (voltaNumber > 0) {
                    // volta information is represented as a binary number
                    bar.volta.voltaType = GP_VOLTA_BINARY
                    bar.volta.voltaInfo.push(voltaNumber & 1)
                    voltaNumber >>= 1
                }
            }
            if (barBits & GuitarPro.SCORE_MARKER) {
                bar.marker = this.readDelphiString() // new section?
                /*int color = */ this.readInt() // color?
            }
            if (barBits & GuitarPro.SCORE_KEYSIG) {
                const currentKey = this.readUInt8()
                /* key signatures are specified as
                 * 1# = 1, 2# = 2, ..., 7# = 7
                 * 1b = 255, 2b = 254, ... 7b = 249 */
                bar.keysig = currentKey <= 7 ? currentKey : -256 + currentKey
                this.readUInt8() // specifies major/minor mode
            }
            if (barBits & GuitarPro.SCORE_DOUBLE_BAR) {
                bar.barLine = BarLineType.DOUBLE
            }
            bar.timesig = new Fraction(tnumerator, tdenominator)
            this.bars.push(bar)
        }

        //
        // create a part for every staff
        //
        for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
            const part = new Part(this.score)
            const s = Factory.createStaff(part)

            this.score.appendStaff(s)
            this.score.appendPart(part)
        }

        this.createMeasures()

        this.setTempo(temp, this.score.firstMeasure())

        for (let i = 0; i < this.staves; ++i) {
            const tuning = new Array<number>(GP_MAX_STRING_NUMBER).fill(0)

            const c = this.readUInt8() // simulations bitmask
            if (c & 0x2) { // 12 stringed guitar
            }
            if (c & 0x4) { // banjo track
            }
            const name = this.readPascalString(40)
            const strings = this.readInt()
            if (strings <= 0 || strings > GP_MAX_STRING_NUMBER) {
                return false
            }
            for (let j = 0; j < strings; ++j) {
                tuning[j] = this.readInt()
            }
            for (let j = strings; j < GP_MAX_STRING_NUMBER; ++j) {
                this.readInt()
            }
            const midiPort = this.readInt() - 1
            const midiChannel = this.readInt() - 1
            if (midiChannel < 0 || midiChannel >= this.channelDefaults.length) {
                console.error(`midiChannel ${midiChannel} out of range 0-${this.channelDefaults.length}`)
                return false
            }

            /*int midiChannel2 =*/ this.readInt() // - 1;
            const frets = this.readInt()

            const capo = this.readInt()
            /*int color        =*/ this.readInt()

            const tuning2 = new Array<number>(strings).fill(0)
            for (let k = 0; k < strings; ++k) {
                tuning2[strings - k - 1] = tuning[k]
            }
            const useFlats = this.createTuningString(strings, tuning2)
            const stringData = StringData.fromPitches(frets, strings, tuning2, useFlats)
            const part = this.score.staff(i)!.part()!
            const instr = part.instrument()
            instr.setStringData(stringData)
            instr.setSingleNoteDynamics(false)
            part.setPartName(name)
            part.setPlainLongName(name)

            //
            // determine clef
            //
            const staff = this.score.staff(i)!
            const patch = this.channelDefaults[midiChannel].patch
            let clefId = ClefType.G
            if (midiChannel === GP_DEFAULT_PERCUSSION_CHANNEL) {
                clefId = ClefType.PERC
                let type = StaffTypes.PERC_5LINE // C++ StaffTypes::PERC_DEFAULT
                const it = drumset.PERC_STAFF_LINES_FROM_INSTRUMENT.get(name)
                if (it) {
                    drumset.initGuitarProPercussionSet(it)
                    drumset.setInstrumentDrumset(instr, it)
                    switch (it.numLines) {
                    case 1:
                        type = StaffTypes.PERC_1LINE
                        break
                    case 2:
                        type = StaffTypes.PERC_2LINE
                        break
                    case 3:
                        type = StaffTypes.PERC_3LINE
                        break
                    default:
                        type = StaffTypes.PERC_5LINE
                        break
                    }
                } else {
                    drumset.initGuitarProDrumset()
                    instr.setDrumset(drumset.gpDrumset)
                }
                staff.setStaffType(new Fraction(0, 1), StaffType.preset(type))
            } else {
                clefId = defaultClef(patch)
            }

            const measure = this.score.firstMeasure()!
            if (!measure.tick().eq(new Fraction(0, 1))) {
                const segment = measure.getSegment(SegmentType.HeaderClef, new Fraction(0, 1))

                const clef = new Clef(segment)
                clef.setClefType(clefId)
                clef.setTrack(i * VOICES)
                segment.add(clef)
            } else {
                staff.setDefaultClefType(new ClefTypeList(clefId, clefId))
            }

            if (capo > 0 && !EngravingConfiguration.guitarProImportExperimental()) {
                const s = measure.getSegment(SegmentType.ChordRest, measure.tick())
                const st = new StaffText(s)
                st.setPlainText('Capo. fret ' + capo)
                st.setTrack(i * VOICES)
                s.add(st)
            }

            const ch = instr.channel(0)!
            if (midiChannel === GP_DEFAULT_PERCUSSION_CHANNEL) {
                ch.setProgram(0)
                ch.setBank(128)
            } else {
                ch.setProgram(patch)
                ch.setBank(0)
            }
            ch.setVolume(this.channelDefaults[midiChannel].volume)
            ch.setPan(this.channelDefaults[midiChannel].pan)
            ch.setChorus(this.channelDefaults[midiChannel].chorus)
            ch.setReverb(this.channelDefaults[midiChannel].reverb)
            staff.part()!.setMidiChannel(midiChannel, midiPort)
            // missing: phase, tremolo
        }

        while (this.slurs.length < this.staves) {
            this.slurs.push(null)
        }
        this.tupleKind = new Array<number>(this.staves).fill(0)

        let measure = this.score.firstMeasure()!
        let mixChange = false
        let lastSlurAdd = false
        for (let bar = 0; bar < this.measures; ++bar, measure = measure.nextMeasure()!) {
            if (!this.f.isReadable()) {
                break
            }
            const gpbar = this.bars[bar]
            if (gpbar.marker) {
                const segment = measure.getSegment(SegmentType.ChordRest, measure.tick())
                const s = new RehearsalMark(segment)
                s.setPlainText(gpbar.marker.trim())
                s.setTrack(0)
                segment.add(s)
            }

            const tuplets: (Tuplet | null)[] = new Array<Tuplet | null>(this.staves).fill(null)

            for (let staffIdx = 0; staffIdx < this.staves; ++staffIdx) {
                let measureLen = new Fraction(0, 1)
                let tick = measure.tick()
                const beats = this.readInt()
                const track: track_idx_t = staffIdx * VOICES

                if (!this.f.isReadable()) {
                    break
                }
                for (let beat = 0; beat < beats; ++beat) {
                    this.slide = -1
                    if (this.slides.has(track)) {
                        this.slide = this.slides.get(track)!
                        this.slides.delete(track)
                    }

                    const beatBits = this.readUInt8()
                    const dotted = (beatBits & 0x1) !== 0
                    let pause = -1
                    if (beatBits & GuitarPro.BEAT_PAUSE) {
                        pause = this.readUInt8()
                    }
                    const len = this.readChar()
                    let tuple = 0
                    if (beatBits & GuitarPro.BEAT_TUPLET) {
                        tuple = this.readInt()
                    }
                    const segment = measure.getSegment(SegmentType.ChordRest, tick)
                    if (beatBits & GuitarPro.BEAT_CHORD) {
                        const numStrings = this.score.staff(staffIdx)!.part()!.instrument().stringData().strings()
                        const header = this.readUInt8()
                        let name: string
                        if ((header & 1) === 0) {
                            name = this.readDelphiString()
                            this.readChord(segment, staffIdx * VOICES, numStrings, name, false)
                        } else {
                            this.skip(16)
                            name = this.readPascalString(21)
                            this.skip(4)
                            this.readChord(segment, staffIdx * VOICES, numStrings, name, true)
                            this.skip(32)
                        }
                    }

                    let lyrics: Lyrics | null = null
                    if (beatBits & GuitarPro.BEAT_LYRICS) {
                        lyrics = new Lyrics(scoreDummy(this.score).chord())
                        const str = this.readDelphiString()
                        //TODO-ws                   str.erase(std::remove_if(str.begin(), str.end(), [](char c){return c == '_'; }), str.end());
                        lyrics.setPlainText(str)
                    }
                    this.gpLyrics.beatCounter++
                    if (this.gpLyrics.beatCounter >= this.gpLyrics.fromBeat && this.gpLyrics.lyricTrack === staffIdx + 1) {
                        const index = this.gpLyrics.beatCounter - this.gpLyrics.fromBeat
                        if (index < this.gpLyrics.lyrics.length) {
                            lyrics = new Lyrics(scoreDummy(this.score).chord())
                            lyrics.setPlainText(this.gpLyrics.lyrics[index])
                        }
                    }
                    let beatEffects = 0
                    if (beatBits & GuitarPro.BEAT_EFFECTS) {
                        beatEffects = this.readBeatEffects(track, segment)
                    }
                    this.last_segment = segment
                    if (beatBits & GuitarPro.BEAT_MIX_CHANGE) {
                        this.readMixChange(measure)
                        mixChange = true
                    }
                    const strings = this.readUInt8() // used strings mask
                    let l = this.len2fraction(len)

                    // Some beat effects could add a Chord before this
                    let cr: ChordRest | null = segment.cr(track)

                    if (strings === 0) {
                        if (segment.cr(track)) {
                            segment.remove(segment.cr(track)!)
                            cr = null
                        }
                        cr = new Rest(scoreDummy(this.score).segment())
                    } else {
                        if (!segment.cr(track)) {
                            cr = new Chord(scoreDummy(this.score).segment())
                        }
                    }
                    cr = cr!
                    cr.setParent(segment)
                    cr.setTrack(track)
                    if (lyrics) {
                        cr.add(lyrics)
                    }

                    const d = new TDuration(l)
                    d.setDots(dotted ? 1 : 0)

                    if (dotted) {
                        l = l.plus(l.times(new Fraction(1, 2)))
                    }
                    if (tuple) {
                        let tuplet = tuplets[staffIdx]
                        if (!tuplet || tuplet.elementsDuration().eq(tuplet.baseLen().fraction().times(tuplet.ratio().numerator()))) {
                            tuplet = Factory.createItem(ElementType.TUPLET, measure) as Tuplet
                            tuplet.setTick(tick)
                            tuplet.setTrack(cr.track())
                            tuplets[staffIdx] = tuplet
                            this.setTuplet(tuplet, tuple)
                            tuplet.setParent(measure)
                        }
                        tuplet.setTrack(track)
                        tuplet.setBaseLen(new TDuration(l))
                        tuplet.setTicks(l.times(tuplet.ratio().denominator()))
                        cr.setTuplet(tuplet)
                        tuplet.add(cr)
                    } else {
                        tuplets[staffIdx] = null // needed?
                    }
                    cr.setTicks(l)
                    if (cr.isRest() && (pause === 0 || l.ge(measure.ticks()))) {
                        cr.setDurationType(DurationType.V_MEASURE)
                        cr.setTicks(measure.ticks())
                    } else {
                        cr.setDurationType(d)
                    }
                    if (!segment.cr(track)) {
                        segment.add(cr)
                    }
                    const staff: Staff = cr.staff()!
                    const numStrings = staff.part()!.instrument().stringData().strings()
                    let hasSlur = false
                    let hasHammerOnPullOff = false
                    let hasLetRing = false
                    let hasPalmMute = false
                    let hasTrill = false
                    let hasVibratoLeftHand = false
                    let hasVibratoWTremBar = false
                    let hasHarmonicArtificial = false
                    let hasHarmonicPinch = false
                    let hasHarmonicTap = false
                    let hasHarmonicSemi = false

                    let dynam = -1
                    if (cr && cr.isChord()) {
                        const chord = cr as Chord
                        for (let i = 6; i >= 0; --i) {
                            if ((strings & (1 << i)) && ((6 - i) < numStrings)) {
                                const note = new Note(chord)
                                // apply dotted notes to the note
                                if (dotted) {
                                    // there is at most one dotted note in this guitar pro version
                                    const dot = new NoteDot(note)
                                    dot.setParent(note)
                                    dot.setTrack(track) // needed to know the staff it belongs to (and detect tablature)
                                    dot.setVisible(true)
                                    note.add(dot)
                                }
                                chord.add(note)

                                const readResult = this.readNote(6 - i, staffIdx, note)
                                hasSlur = readResult.slur || hasSlur
                                hasHammerOnPullOff = readResult.hammerOnPullOff || hasHammerOnPullOff
                                hasLetRing = readResult.letRing || hasLetRing
                                hasPalmMute = readResult.palmMute || hasPalmMute
                                hasTrill = readResult.trill || hasTrill
                                hasVibratoLeftHand = readResult.vibrato || hasVibratoLeftHand
                                hasHarmonicArtificial = readResult.harmonicArtificial || hasHarmonicArtificial
                                hasHarmonicPinch = readResult.harmonicPinch || hasHarmonicPinch
                                hasHarmonicTap = readResult.harmonicTap || hasHarmonicTap
                                hasHarmonicSemi = readResult.harmonicSemi || hasHarmonicSemi
                                dynam = Math.max(dynam, this.previousDynamicByTrack[track])
                                note.setTpcFromPitch()
                            }
                        }

                        const hasVibratoLeftHandOnBeat = { value: false }
                        const hasVibratoWTremBarOnBeat = { value: false }
                        this.applyBeatEffects(chord, beatEffects, hasVibratoLeftHandOnBeat, hasVibratoWTremBarOnBeat)
                        hasVibratoLeftHand = hasVibratoLeftHand || hasVibratoLeftHandOnBeat.value
                        hasVibratoWTremBar = hasVibratoWTremBar || hasVibratoWTremBarOnBeat.value
                        if (dynam !== this.curDynam[track]) {
                            this.curDynam[track] = dynam
                            this.addDynamic(chord.notes()[0], dynam)
                        }
                    }

                    if (cr) {
                        this.addLetRing(cr, hasLetRing)
                        this.addPalmMute(cr, hasPalmMute)
                        this.addTrill(cr, hasTrill)
                        this.addHammerOnPullOff(cr, hasHammerOnPullOff)
                        this.addVibratoLeftHand(cr, hasVibratoLeftHand)
                        this.addVibratoWTremBar(cr, hasVibratoWTremBar)
                        this.addHarmonicMarks(cr, hasHarmonicArtificial, hasHarmonicPinch, hasHarmonicTap, hasHarmonicSemi)
                    }

                    // if we see that a tied note has been constructed do not create the tie
                    // (C++ slides[track] inserts a 0 entry if there is none)
                    if (!this.slides.has(track)) {
                        this.slides.set(track, 0)
                    }
                    if (this.slides.get(track) === -2) {
                        this.slide = 0
                        this.slides.set(track, -1)
                    }
                    let slurSwap = true
                    if (this.slide !== 2) {
                        if (hasSlur && !this.slurs[staffIdx]) {
                            const slur = new Slur(scoreDummy(this.score))
                            slur.setParent(null)
                            slur.setTrack(track)
                            slur.setTrack2(track)
                            slur.setTick(cr.tick())
                            slur.setTick2(cr.tick())
                            slur.setStartElement(cr)
                            this.slurs[staffIdx] = slur
                            this.score.addElement(slur)
                        } else if (this.slurs[staffIdx] && !hasSlur) {
                            // TODO: check slur
                            const s = this.slurs[staffIdx]!
                            this.slurs[staffIdx] = null
                            s.setTick2(cr.tick())
                            s.setTrack2(cr.track())
                            s.setEndElement(cr)
                            if (cr.isChord()) {
                                lastSlurAdd = true
                                slurSwap = false
                            }
                            //TODO-ws                           cr->has_slur = true;
                        } else if (this.slurs[staffIdx] && hasSlur) {
                        }
                    }
                    if (cr && cr.isChord() && this.slide > 0) {
                        const chord = cr as Chord
                        const effect = this.convertGP4SlideNum(this.slide)
                        if (this.slide > 2) {
                            this.createSlide(this.convertGP4SlideNum(this.slide), cr, staffIdx)
                        }
                        if (this.slide < 3 || effect === GuitarPro.SLIDE_OUT_UP) {
                            const last = chord.upNote()
                            let seg: Segment | null = chord.segment()!
                            let mes: Measure | null = seg.measure()
                            while ((seg = seg!.prev()) || (mes = mes!.prevMeasure())) {
                                if (!seg) {
                                    break //seg = mes->last();
                                }
                                if (seg.segmentType() === SegmentType.ChordRest
                                    && seg.cr(chord.track()) && seg.cr(chord.track())!.isChord()) {
                                    let br = false
                                    const cr1 = seg.cr(chord.track()) as Chord
                                    if (cr1) {
                                        for (const n of cr1.notes()) {
                                            if (n.string() === last.string()) {
                                                const s = new Glissando(n)
                                                s.setAnchor(SpannerAnchor.NOTE)
                                                s.setStartElement(n)
                                                s.setTick(seg.tick())
                                                s.setTrack(chord.track())
                                                s.setParent(n)
                                                s.setGlissandoType(GlissandoType.STRAIGHT)
                                                s.setEndElement(last)
                                                s.setTick2(chord.segment()!.tick())
                                                s.setTrack2(chord.track())
                                                s.setGlissandoStyle(n.part()!.instrument(n.tick()).glissandoStyle())
                                                this.score.addElement(s)
                                                if (this.slide === 2 || effect === GuitarPro.SLIDE_OUT_UP) {
                                                    if (!lastSlurAdd) {
                                                        this.createSlur(true, chord.staffIdx(), cr1)
                                                        this.createSlur(false, chord.staffIdx(), chord)
                                                    }
                                                }
                                                br = true
                                                break
                                            }
                                        }
                                    }
                                    if (br) {
                                        break
                                    }
                                }
                            }
                        }
                    }
                    if (slurSwap) {
                        lastSlurAdd = false
                    }
                    this.restsForEmptyBeats(segment, measure, cr, l, track, tick)
                    this.createSlur(hasSlur, staffIdx, cr)
                    tick = tick.plus(cr.actualTicks())
                    measureLen = measureLen.plus(cr.actualTicks())
                }
                if (measureLen.lt(measure.ticks())) {
                    this.score.setRest(tick, track, measure.ticks().minus(measureLen), false, null, false)
                    this.m_continiousElementsBuilder!.notifyUncompletedMeasure()
                }
            }

            if (bar === 1 && !mixChange) {
                this.setTempo(temp, this.score.firstMeasure())
            }
        }

        for (const n of this.slideList) {
            if (!n) {
                continue
            }
            let segment: Segment | null = n.chord()!.segment()!
            let measure1: Measure | null = segment.measure()
            let segment_counter = 0
            while ((segment = segment!.next1(SegmentType.ChordRest))
                   || ((measure1 = measure1!.nextMeasure()) && (segment = measure1.first()))) {
                if (!segment) {
                    break
                }
                if (!segment.isChordRestType()) {
                    continue
                }
                let br = false
                const cr = segment.cr(n.track())
                if (cr && cr.isChord()) {
                    const c = cr as Chord
                    ++segment_counter
                    if (segment_counter > 2) {
                        break
                    }
                    for (const nt of c.notes()) {
                        if (nt.string() === n.string()) {
                            for (const e of nt.el()) {
                                if (e.isChordLine()) {
                                    const cl = e as ChordLine
                                    if (cl.chordLineType() === ChordLineType.PLOP || cl.chordLineType() === ChordLineType.SCOOP) {
                                        br = true
                                        break
                                    }
                                }
                            }
                            if (br) {
                                break
                            }
                            const s = new Glissando(n)
                            s.setAnchor(SpannerAnchor.NOTE)
                            s.setStartElement(n)
                            s.setTick(n.chord()!.segment()!.tick())
                            s.setTrack(n.track())
                            s.setParent(n)
                            s.setGlissandoType(GlissandoType.STRAIGHT)
                            s.setEndElement(nt)
                            s.setTick2(nt.chord()!.segment()!.tick())
                            s.setTrack2(n.track())
                            this.score.addElement(s)
                            br = true
                            break
                        }
                    }
                    if (br) {
                        break
                    }
                }
            }
        }

        this.m_continiousElementsBuilder!.addElementsToScore()
        this.m_guitarBendImporter!.applyBendsToChords()

        return true
    }
}
