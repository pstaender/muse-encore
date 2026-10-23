/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gp67dombuilder.h/.cpp: builds the GP DOM model of a GPIF document
 * (Guitar Pro 6 and 7).
 */

import { XmlDomNode, type XmlDomElement } from '../../../../framework/global/serialization/xmldom'
import { Constants } from '../../../../engraving/types/constants'
import { GPBar, GPBarClefType, GPBarOttaviaType, GPBarSimileMark } from './gpbar'
import {
    GPBeat, GPBeatArpeggio, GPBeatBeamMode, GPBeatBrush, GPBeatDynamicType, GPBeatFadding, GPBeatGolpe, GPBeatGraceNotes,
    GPBeatHairpin, GPBeatLegatoType, GPBeatOttavaType, GPBeatPickStroke, GPBeatRasgueado, GPBeatVibratoWTremBar, GPBeatWah,
    type GPBeatTremolo,
} from './gpbeat'
import { GPDomModel } from './gpdommodel'
import {
    GPMasterBar, GPMasterBarBarlineType, GPMasterBarDirection, GPMasterBarDirectionType, GPMasterBarFermata,
    GPMasterBarFermataType, GPMasterBarKeySig, GPMasterBarKeySigMode, GPMasterBarRepeat, GPMasterBarRepeatType,
    GPMasterBarTimeSig, GPMasterBarTripletFeelType, type GPMasterBarKeySigAccidentals,
} from './gpmasterbar'
import { GPMasterTracks, GPMasterTracksAutomation, GPMasterTracksAutomationType } from './gpmastertracks'
import {
    GPNote, GPNoteBend, GPNoteHammerOn, GPNoteHarmonicType, GPNoteOrnament, GPNotePickScrape, GPNoteTieType,
    GPNoteVibratoType,
} from './gpnote'
import { GPRhythm, GPRhythmRhytmType } from './gprhythm'
import { GPScore } from './gpscore'
import { GPTrack, GPTrackDiagram, GPTrackRSE, GPTrackStaffProperty } from './gptrack'
import { GPVoice } from './gpvoice'
import type { IGPDomBuilder } from './igpdombuilder'
import type { INoteProperty } from './inoteproperty'

/** muse::String::toInt (strtol, base 10): 0 unless the whole string (after leading whitespace) is a number */
export function gpToInt(s: string | undefined): number {
    if (!s) {
        return 0
    }
    const m = /^\s*([+-]?\d+)$/.exec(s)
    return m ? parseInt(m[1], 10) : 0
}

/** muse::String::toUInt (the result is used as unsigned) */
export function gpToUInt(s: string | undefined): number {
    return gpToInt(s) >>> 0
}

/** muse::String::toDouble / toFloat (strtod: the number at the start of the string, 0 if none) */
export function gpToDouble(s: string | undefined): number {
    if (!s) {
        return 0
    }
    const m = /^\s*([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(s)
    return m ? parseFloat(m[1]) : 0
}

/** std::bitset<n>(v) */
export function gpBitset(v: number, n: number): boolean[] {
    const r: boolean[] = []
    for (let i = 0; i < n; ++i) {
        r.push(((v >>> i) & 1) === 1)
    }
    return r
}

export abstract class GP67DomBuilder implements IGPDomBuilder {
    protected _notes = new Map<number, GPNote>()
    protected _rhythms = new Map<number, GPRhythm>()
    protected _beats = new Map<number, GPBeat>()
    protected _voices = new Map<number, GPVoice>()
    protected _bars = new Map<number, GPBar>()
    protected _gpDom: GPDomModel | null = new GPDomModel()

    buildGPDomModel(domElem: XmlDomElement): void {
        const nodes = new Map<string, XmlDomNode>()
        const names = ['GPRevision', 'Score', 'MasterTrack', 'AudioTracks', 'Tracks', 'MasterBars', 'Bars', 'Voices',
                       'Beats', 'Notes', 'Rhythms', 'GPVersion', 'Encoding']

        for (let current = domElem.firstChild(); !current.isNull(); current = current.nextSibling()) {
            if (names.includes(current.nodeName())) {
                nodes.set(current.nodeName(), current)
            }
        }
        const node = (name: string): XmlDomNode => nodes.get(name) ?? new XmlDomNode()

        this.buildGPRhythms(node('Rhythms'))
        this.buildGPNotes(node('Notes'))
        this.buildGPBeats(node('Beats'))
        this.buildGPVoices(node('Voices'))
        this.buildGPBars(node('Bars'))
        this.buildGPMasterBars(node('MasterBars'))

        this.buildGPScore(node('Score'))
        this.buildGPMasterTracks(node('MasterTrack'))
        this.buildGPAudioTracks(node('AudioTracks'))
        this.buildGPTracks(node('Tracks'), node('GPVersion'))
    }

    getGPDomModel(): GPDomModel | null {
        const dom = this._gpDom
        this._gpDom = null
        return dom
    }

    protected buildGPScore(scoreNode: XmlDomNode): void {
        // Contains list of unused info: FirstPageFooter, FirstPageHeader, PageFooter, PageHeader,
        // ScoreSystemsDefaultLayout, ScoreSystemsLayout, PageSetup

        const score = new GPScore()
        let currentNode = scoreNode.firstChild()
        while (!currentNode.isNull()) {
            const nodeName = currentNode.nodeName()
            if (nodeName === 'Title') {
                score.setTitle(currentNode.toElement().text())
            } else if (nodeName === 'Subtitle' || nodeName === 'SubTitle') {
                score.setSubTitle(currentNode.toElement().text())
            } else if (nodeName === 'Artist') {
                score.setArtist(currentNode.toElement().text())
            } else if (nodeName === 'Album') {
                score.setAlbum(currentNode.toElement().text())
            } else if (nodeName === 'Words') {
                score.setPoet(currentNode.toElement().text())
            } else if (nodeName === 'Music') {
                score.setComposer(currentNode.toElement().text())
            } else if (nodeName === 'MultiVoice') {
                // gp saves the value "1>" instead of "1"
                const multiVoiceString = currentNode.toElement().text()
                if (multiVoiceString.length) {
                    score.setMultiVoice(gpToInt(multiVoiceString[0]) !== 0)
                }
            }
            // Copyright, Tabber, Instructions, Notices and the layout nodes are ignored

            currentNode = currentNode.nextSibling()
        }
        this._gpDom!.addGPScore(score)
    }

    protected buildGPMasterTracks(masterTrack: XmlDomNode): void {
        const masterTracks = new GPMasterTracks()

        let currentNode = masterTrack.firstChild()
        while (!currentNode.isNull()) {
            const nodeName = currentNode.nodeName()
            if (nodeName === 'Automations') {
                masterTracks.setTempoMap(this.readTempoMap(currentNode))
            } else if (nodeName === 'RSE') {
                // TODO volume and pan(balance) of mixer are set here
            } else if (nodeName === 'Tracks') {
                const tracks = currentNode.toElement().text()
                const tracksCount = tracks.split(' ').length
                masterTracks.setTracksCount(tracksCount)
            }

            currentNode = currentNode.nextSibling()
        }

        this._gpDom!.addGPMasterTracks(masterTracks)
    }

    protected buildGPAudioTracks(audioTrack: XmlDomNode): void {
        let currentNode = audioTrack.firstChild()
        while (!currentNode.isNull()) {
            currentNode = currentNode.nextSibling()
        }
    }

    protected buildGPTracks(tracksNode: XmlDomNode, versionNode: XmlDomNode): void {
        const tracks = new Map<number, GPTrack>()
        let currentNode = tracksNode.firstChild()
        while (!currentNode.isNull()) {
            const [idx, track] = this.createGPTrack(currentNode, versionNode)
            if (!tracks.has(idx)) {
                tracks.set(idx, track)
            }
            currentNode = currentNode.nextSibling()
        }

        this._gpDom!.addGPTracks(tracks)
    }

    protected buildGPMasterBars(masterBarsNode: XmlDomNode): void {
        const masterBars: GPMasterBar[] = []

        let innerNode = masterBarsNode.firstChild()
        let masterBarIdx = 0
        while (!innerNode.isNull()) {
            const nodeName = innerNode.nodeName()

            if (nodeName === 'MasterBar') {
                masterBars.push(this.createGPMasterBar(innerNode))
                masterBars[masterBars.length - 1].setId(masterBarIdx)
                masterBarIdx++
            }

            innerNode = innerNode.nextSibling()
        }

        this._gpDom!.addGPMasterBars(masterBars)
    }

    protected buildGPBars(barsNode: XmlDomNode): void {
        const bars = new Map<number, GPBar>()

        let innerNode = barsNode.firstChild()
        while (!innerNode.isNull()) {
            if (innerNode.nodeName() === 'Bar') {
                const [idx, bar] = this.createGPBar(innerNode)
                if (!bars.has(idx)) {
                    bars.set(idx, bar)
                }
            }

            innerNode = innerNode.nextSibling()
        }

        this._bars = bars
    }

    protected buildGPVoices(voicesNode: XmlDomNode): void {
        const voices = new Map<number, GPVoice>()

        let innerNode = voicesNode.firstChild()
        while (!innerNode.isNull()) {
            if (innerNode.nodeName() === 'Voice') {
                const [idx, voice] = this.createGPVoice(innerNode)
                if (!voices.has(idx)) {
                    voices.set(idx, voice)
                }
            }

            innerNode = innerNode.nextSibling()
        }

        this._voices = voices
    }

    protected buildGPBeats(beatsNode: XmlDomNode): void {
        const beats = new Map<number, GPBeat>()

        let innerNode = beatsNode.firstChild()
        while (!innerNode.isNull()) {
            if (innerNode.nodeName() === 'Beat') {
                const [idx, beat] = this.createGPBeat(innerNode)
                if (!beats.has(idx)) {
                    beats.set(idx, beat)
                }
            }

            innerNode = innerNode.nextSibling()
        }

        this._beats = beats
    }

    protected buildGPNotes(notesNode: XmlDomNode): void {
        const notes = new Map<number, GPNote>()

        let innerNode = notesNode.firstChild()
        while (!innerNode.isNull()) {
            if (innerNode.nodeName() === 'Note') {
                const [idx, note] = this.createGPNote(innerNode)
                if (!notes.has(idx)) {
                    notes.set(idx, note)
                }
            }

            innerNode = innerNode.nextSibling()
        }

        this._notes = notes
    }

    protected buildGPRhythms(rhythmsNode: XmlDomNode): void {
        const rhythms = new Map<number, GPRhythm>()

        let innerNode = rhythmsNode.firstChild()
        while (!innerNode.isNull()) {
            if (innerNode.nodeName() === 'Rhythm') {
                const [idx, rhythm] = this.createGPRhythm(innerNode)
                if (!rhythms.has(idx)) {
                    rhythms.set(idx, rhythm)
                }
            }

            innerNode = innerNode.nextSibling()
        }

        this._rhythms = rhythms
    }

    protected readTempoMap(currentNode: XmlDomNode): GPMasterTracksAutomation[] {
        const tempoMap: GPMasterTracksAutomation[] = []
        let currentAutomation = currentNode.firstChild()
        while (!currentAutomation.isNull()) {
            if (currentAutomation.nodeName() === 'Automation') {
                const ln = currentAutomation.firstChildElement('Linear')
                let firstName = currentAutomation.firstChild().nodeName()
                if (firstName === 'Type') {
                    firstName = currentAutomation.firstChild().toElement().text()
                }
                if (firstName === 'Tempo') {
                    const tempo = new GPMasterTracksAutomation()
                    tempo.type = GPMasterTracksAutomationType.tempo
                    const str = currentAutomation.firstChildElement('Value').toElement().text()
                    const tempoValue = str.split(' ')
                    tempo.value = gpToDouble(tempoValue[0])
                    tempo.tempoUnit = tempoValue.length > 1 ? Math.trunc(gpToDouble(tempoValue[1])) : 0
                    tempo.bar = gpToInt(currentAutomation.firstChildElement('Bar').text())
                    tempo.position = gpToDouble(currentAutomation.firstChildElement('Position').text())
                    tempo.linear = (ln.toElement().text() === 'true')
                    const labelElem = currentAutomation.firstChildElement('Text')
                    if (labelElem.hasChildNodes()) {
                        tempo.text = labelElem.toElement().text()
                    }

                    tempoMap.push(tempo)
                }
            }
            currentAutomation = currentAutomation.nextSibling()
        }

        return tempoMap
    }

    protected abstract createGPTrack(trackNode: XmlDomNode, versionNode: XmlDomNode): [number, GPTrack]

    protected createGPMasterTrack(_metadata: XmlDomNode): GPMasterTracks {
        return new GPMasterTracks()
    }

    protected createGPMasterBar(masterBarNode: XmlDomNode): GPMasterBar {
        // XProperties are ignored

        const tripletFeelType = (str: string): GPMasterBarTripletFeelType => {
            switch (str) {
            case 'Triplet8th': return GPMasterBarTripletFeelType.Triplet8th
            case 'Triplet16th': return GPMasterBarTripletFeelType.Triplet16th
            case 'Dotted8th': return GPMasterBarTripletFeelType.Dotted8th
            case 'Dotted16th': return GPMasterBarTripletFeelType.Dotted16th
            case 'Scottish8th': return GPMasterBarTripletFeelType.Scottish8th
            case 'Scottish16th': return GPMasterBarTripletFeelType.Scottish16th
            }
            return GPMasterBarTripletFeelType.None
        }

        const masterBar = new GPMasterBar()

        let innerNode = masterBarNode.firstChild()

        while (!innerNode.isNull()) {
            const nodeName = innerNode.nodeName()

            if (nodeName === 'Time') {
                masterBar.setTimeSig(this.readTimeSig(innerNode))
            } else if (nodeName === 'Repeat') {
                masterBar.setRepeat(this.readRepeat(innerNode))
            } else if (nodeName === 'AlternateEndings') {
                masterBar.setAlternativeEnding(this.readEnding(innerNode))
            } else if (nodeName === 'Key') {
                masterBar.setKeySig(this.readKeySig(innerNode), this.readUseFlats(innerNode))
            } else if (nodeName === 'Bars') {
                const bars = innerNode.toElement().text().split(' ')
                for (const barIdx of bars) {
                    const idx = gpToInt(barIdx)
                    const bar = this._bars.get(idx)
                    if (!bar) {
                        // C++ std::unordered_map::at throws
                        throw new Error(`GP67DomBuilder: unknown bar ${idx}`)
                    }
                    this._bars.delete(idx)
                    masterBar.addGPBar(bar)
                }
            } else if (nodeName === 'TripletFeel') {
                masterBar.setTripletFeel(tripletFeelType(innerNode.toElement().text()))
            } else if (nodeName === 'Fermatas') {
                masterBar.setFermatas(this.readFermatas(innerNode))
            } else if (nodeName === 'Section') {
                masterBar.setSection(this.readMasterBarSection(innerNode))
            } else if (nodeName === 'Directions') {
                masterBar.setDirections(this.readRepeatsJumps(innerNode))
            } else if (nodeName === 'DoubleBar') {
                masterBar.setBarlineType(GPMasterBarBarlineType.DOUBLE)
            } else if (nodeName === 'FreeTime') {
                masterBar.setFreeTime(true)
            }

            innerNode = innerNode.nextSibling()
        }

        return masterBar
    }

    protected createGPBar(barNode: XmlDomNode): [number, GPBar] {
        const clefType = (clef: string): GPBarClefType => {
            switch (clef) {
            case 'C4': return GPBarClefType.C4
            case 'C3': return GPBarClefType.C3
            case 'F4': return GPBarClefType.F4
            case 'G2': return GPBarClefType.G2
            }
            return GPBarClefType.Neutral
        }

        const ottaviaType = (ott: string): GPBarOttaviaType => {
            switch (ott) {
            case '8va': return GPBarOttaviaType.va8
            case '15ma': return GPBarOttaviaType.ma15
            case '8vb': return GPBarOttaviaType.vb8
            case '15mb': return GPBarOttaviaType.mb15
            }
            return GPBarOttaviaType.Regular
        }

        const simileMarkType = (str: string): GPBarSimileMark => {
            switch (str) {
            case 'Simple': return GPBarSimileMark.Simple
            case 'FirstOfDouble': return GPBarSimileMark.FirstOfDouble
            case 'SecondOfDouble': return GPBarSimileMark.SecondOfDouble
            }
            return GPBarSimileMark.None
        }

        const bar = new GPBar()

        let innerNode = barNode.firstChild()
        const barIdx = gpToInt(barNode.toElement().attribute('id').value())
        bar.setId(barIdx)

        while (!innerNode.isNull()) {
            const nodeName = innerNode.nodeName()

            if (nodeName === 'Clef') {
                bar.setClefType(clefType(innerNode.toElement().text()))
            } else if (nodeName === 'Ottavia') {
                bar.setOttaviaType(ottaviaType(innerNode.toElement().text()))
            } else if (nodeName === 'SimileMark') {
                bar.setSimileMark(simileMarkType(innerNode.toElement().text()))
            } else if (nodeName === 'Voices') {
                const voices = innerNode.toElement().text().split(' ')
                let currentPosition = -1
                for (const voiceIdx of voices) {
                    currentPosition++
                    const idx = gpToInt(voiceIdx)
                    if (idx === -1) {
                        continue
                    }

                    const voice = this._voices.get(idx)
                    if (!voice) {
                        throw new Error(`GP67DomBuilder: unknown voice ${idx}`)
                    }
                    voice.setPosition(currentPosition)
                    this._voices.delete(idx)
                    bar.addGPVoice(voice)
                }
            }

            innerNode = innerNode.nextSibling()
        }

        return [barIdx, bar]
    }

    protected createGPVoice(voiceNode: XmlDomNode): [number, GPVoice] {
        const voice = new GPVoice()

        let innerNode = voiceNode.firstChild()
        const voiceIdx = gpToInt(voiceNode.toElement().attribute('id').value())
        voice.setId(voiceIdx)

        while (!innerNode.isNull()) {
            if (innerNode.nodeName() === 'Beats') {
                const beats = innerNode.toElement().text().split(' ')
                for (const beatIdx of beats) {
                    const idx = gpToInt(beatIdx)
                    const beat = this._beats.get(idx)
                    if (!beat) {
                        throw new Error(`GP67DomBuilder: unknown beat ${idx}`)
                    }
                    voice.addGPBeat(beat)
                }
            }

            innerNode = innerNode.nextSibling()
        }

        return [voiceIdx, voice]
    }

    protected createGPBeat(beatNode: XmlDomNode): [number, GPBeat] {
        // Bank, StemOrientation, ConcertPitchStemOrientation are ignored

        const dynamicType = (str: string): GPBeatDynamicType => {
            switch (str) {
            case 'FFF': return GPBeatDynamicType.FFF
            case 'FF': return GPBeatDynamicType.FF
            case 'F': return GPBeatDynamicType.F
            case 'MF': return GPBeatDynamicType.MF
            case 'MP': return GPBeatDynamicType.MP
            case 'P': return GPBeatDynamicType.P
            case 'PP': return GPBeatDynamicType.PP
            }
            return GPBeatDynamicType.PPP
        }
        const legatoType = (origin: string, destination: string): GPBeatLegatoType => {
            if (origin === 'true' && destination === 'false') {
                return GPBeatLegatoType.Start
            } else if (origin === 'true' && destination === 'true') {
                return GPBeatLegatoType.Mediate
            } else if (origin === 'false' && destination === 'true') {
                return GPBeatLegatoType.End
            }
            return GPBeatLegatoType.None
        }
        const arpeggioType = (arp: string): GPBeatArpeggio => {
            if (arp === 'Up') {
                return GPBeatArpeggio.Up
            } else if (arp === 'Down') {
                return GPBeatArpeggio.Down
            }
            return GPBeatArpeggio.None
        }
        const graceNotes = (gn: string): GPBeatGraceNotes => {
            if (gn === 'OnBeat') {
                return GPBeatGraceNotes.OnBeat
            } else if (gn === 'BeforeBeat') {
                return GPBeatGraceNotes.BeforeBeat
            }
            return GPBeatGraceNotes.None
        }
        const faddingType = (str: string): GPBeatFadding => {
            if (str === 'FadeIn') {
                return GPBeatFadding.FadeIn
            } else if (str === 'FadeOut') {
                return GPBeatFadding.FadeOut
            } else if (str === 'VolumeSwell') {
                return GPBeatFadding.VolumeSwell
            }
            return GPBeatFadding.None
        }
        const hairpinType = (str: string): GPBeatHairpin => {
            if (str === 'Crescendo') {
                return GPBeatHairpin.Crescendo
            } else if (str === 'Decrescendo') {
                return GPBeatHairpin.Decrescendo
            }
            return GPBeatHairpin.None
        }
        const wahType = (str: string): GPBeatWah => {
            if (str === 'Open') {
                return GPBeatWah.Open
            } else if (str === 'Closed') {
                return GPBeatWah.Closed
            }
            return GPBeatWah.None
        }
        const golpeType = (str: string): GPBeatGolpe => {
            if (str === 'Finger') {
                return GPBeatGolpe.Finger
            } else if (str === 'Thumb') {
                return GPBeatGolpe.Thumb
            }
            return GPBeatGolpe.None
        }
        const ottavaType = (ott: string): GPBeatOttavaType => {
            switch (ott) {
            case '8va': return GPBeatOttavaType.va8
            case '15ma': return GPBeatOttavaType.ma15
            case '8vb': return GPBeatOttavaType.vb8
            case '15mb': return GPBeatOttavaType.mb15
            }
            return GPBeatOttavaType.None
        }

        const beat = new GPBeat()

        let innerNode = beatNode.firstChild()
        const beatIdx = gpToInt(beatNode.toElement().attribute('id').value())
        beat.setId(beatIdx)

        while (!innerNode.isNull()) {
            const nodeName = innerNode.nodeName()

            if (nodeName === 'Dynamic') {
                beat.setDynamic(dynamicType(innerNode.toElement().text()))
            } else if (nodeName === 'Legato') {
                const origin = innerNode.toElement().attribute('origin').value()
                const destination = innerNode.toElement().attribute('destination').value()
                beat.setLegatoType(legatoType(origin, destination))
            } else if (nodeName === 'Rhythm') {
                const rIdx = gpToInt(innerNode.toElement().attribute('ref').value())
                const rhythm = this._rhythms.get(rIdx)
                if (!rhythm) {
                    throw new Error(`GP67DomBuilder: unknown rhythm ${rIdx}`)
                }
                beat.addGPRhythm(rhythm)
            } else if (nodeName === 'Notes') {
                const strList = innerNode.toElement().text().split(' ')
                for (const strIdx of strList) {
                    const idx = gpToInt(strIdx)
                    const note = this._notes.get(idx)
                    if (!note) {
                        throw new Error(`GP67DomBuilder: unknown note ${idx}`)
                    }
                    beat.addGPNote(note)
                }
                beat.sortGPNotes()
            } else if (nodeName === 'GraceNotes') {
                beat.setGraceNotes(graceNotes(innerNode.toElement().text()))
            } else if (nodeName === 'Arpeggio') {
                beat.setArpeggio(arpeggioType(innerNode.toElement().text()))
            } else if (nodeName === 'Properties') {
                this.readBeatProperties(innerNode, beat)
            } else if (nodeName === 'Chord') {
                beat.setDiagramIdx(gpToInt(innerNode.toElement().text()))
            } else if (nodeName === 'Timer') {
                beat.setTime(gpToInt(innerNode.toElement().text()))
            } else if (nodeName === 'FreeText') {
                beat.setFreeText(innerNode.toElement().text())
            } else if (nodeName === 'Fadding') {
                beat.setFadding(faddingType(innerNode.toElement().text()))
            } else if (nodeName === 'Hairpin') {
                beat.setHairpin(hairpinType(innerNode.toElement().text()))
            } else if (nodeName === 'Tremolo') {
                const trList = innerNode.toElement().text().split('/')
                const tr: GPBeatTremolo = { numerator: gpToInt(trList[0]), denominator: gpToInt(trList[1]) }
                beat.setTremolo(tr)
            } else if (nodeName === 'Wah') {
                beat.setWah(wahType(innerNode.toElement().text()))
            } else if (nodeName === 'Golpe') {
                beat.setGolpe(golpeType(innerNode.toElement().text()))
            } else if (nodeName === 'Lyrics') {
                // this code reads lyrics for the beat (only one line).
                const lyrNode = innerNode.firstChildElement('Line')
                beat.setLyrics(lyrNode.toElement().text())
            } else if (nodeName === 'Ottavia') {
                beat.setOttavaType(ottavaType(innerNode.toElement().text()))
            } else if (nodeName === 'Whammy' || nodeName === 'WhammyExtend') {
                // TODO-gp: implement dives
                beat.setDive(true)
            } else if (nodeName === 'DeadSlapped') {
                beat.setDeadSlapped(true)
            } else if (nodeName === 'TransposedPitchStemOrientation') {
                beat.setStemOrientationUp(innerNode.toElement().text() === 'Upward')
            } else if (nodeName === 'TransposedPitchStemOrientationUserDefined') {
                beat.setStemOrientationUserDefined(true)
            } else if (nodeName === 'XProperties') {
                this.readBeatXProperties(innerNode, beat)
            }

            innerNode = innerNode.nextSibling()
        }

        return [beatIdx, beat]
    }

    protected createGPNote(noteNode: XmlDomNode): [number, GPNote] {
        const tieType = (origin: string, destination: string): GPNoteTieType => {
            if (origin === 'true' && destination === 'false') {
                return GPNoteTieType.Start
            } else if (origin === 'true' && destination === 'true') {
                return GPNoteTieType.Mediate
            } else if (origin === 'false' && destination === 'true') {
                return GPNoteTieType.End
            }
            return GPNoteTieType.None
        }
        const vibratoType = (str: string): GPNoteVibratoType => {
            if (str === 'Wide') {
                return GPNoteVibratoType.Wide
            } else if (str === 'Slight') {
                return GPNoteVibratoType.Slight
            }
            return GPNoteVibratoType.None
        }
        const ornamentType = (str: string): GPNoteOrnament => {
            switch (str) {
            case 'UpperMordent': return GPNoteOrnament.UpperMordent
            case 'LowerMordent': return GPNoteOrnament.LowerMordent
            case 'InvertedTurn': return GPNoteOrnament.InvertedTurn
            case 'Turn': return GPNoteOrnament.Turn
            }
            return GPNoteOrnament.None
        }

        const note = new GPNote()
        const noteIdx = gpToInt(noteNode.toElement().attribute('id').value())
        note.setId(noteIdx)

        let innerNode = noteNode.firstChild()
        while (!innerNode.isNull()) {
            const nodeName = innerNode.nodeName()

            if (nodeName === 'Accidental') {
                const accidentals: Record<string, number> = {
                    DoubleFlat: -2, Flat: -1, Natural: 0, Sharp: +1, DoubleSharp: +2,
                }
                const accidentalName = innerNode.toElement().text()
                if (Object.hasOwn(accidentals, accidentalName)) {
                    note.setAccidental(accidentals[accidentalName])
                }
            }
            if (nodeName === 'Properties') {
                this.readNoteProperties(innerNode, note)
            }
            if (nodeName === 'XProperties') {
                this.readNoteXProperties(innerNode, note)
            }
            if (nodeName === 'Tie') {
                const origin = innerNode.toElement().attribute('origin').value()
                const destination = innerNode.toElement().attribute('destination').value()
                note.setTieType(tieType(origin, destination))
            }
            if (nodeName === 'LetRing') {
                note.setLetRing(true)
            } else if (nodeName === 'AntiAccent') {
                note.setGhostNote(innerNode.toElement().text() === 'Normal')
            } else if (nodeName === 'Accent') {
                note.setAccent(gpBitset(gpToUInt(innerNode.toElement().text()), 4))
            } else if (nodeName === 'LeftFingering') {
                let finger = innerNode.toElement().text()
                if (finger === 'Open') {
                    finger = '0'
                } else if (finger === 'P') {
                    finger = 't'
                } else if (finger === 'I') {
                    finger = '1'
                } else if (finger === 'M') {
                    finger = '2'
                } else if (finger === 'A') {
                    finger = '3'
                } else if (finger === 'C') {
                    finger = '4'
                }
                note.setLeftFingering(finger)
            } else if (nodeName === 'RightFingering') {
                note.setRightFingering(innerNode.toElement().text().toLowerCase())
            } else if (nodeName === 'Vibrato') {
                note.setVibratoType(vibratoType(innerNode.toElement().text()))
            } else if (nodeName === 'Trill') {
                note.setTrillFret(gpToInt(innerNode.toElement().text()))
            } else if (nodeName === 'Ornament') {
                note.setOrnament(ornamentType(innerNode.toElement().text()))
            }

            innerNode = innerNode.nextSibling()
        }

        return [noteIdx, note]
    }

    protected createGPRhythm(rhythmNode: XmlDomNode): [number, GPRhythm] {
        const rhythmType = (str: string): GPRhythmRhytmType => {
            switch (str) {
            case 'Whole': return GPRhythmRhytmType.Whole
            case 'Half': return GPRhythmRhytmType.Half
            case 'Quarter': return GPRhythmRhytmType.Quarter
            case 'Eighth': return GPRhythmRhytmType.Eighth
            case '16th': return GPRhythmRhytmType.Sixteenth
            case '32nd': return GPRhythmRhytmType.ThirtySecond
            }
            return GPRhythmRhytmType.SixtyFourth
        }

        const rhythm = new GPRhythm()

        let innerNode = rhythmNode.firstChild()
        const rhythmIdx = gpToInt(rhythmNode.toElement().attribute('id').value())
        while (!innerNode.isNull()) {
            const nodeName = innerNode.nodeName()
            if (nodeName === 'NoteValue') {
                rhythm.setRhytm(rhythmType(innerNode.toElement().text()))
            }
            if (nodeName === 'AugmentationDot') {
                rhythm.setDotCount(gpToInt(innerNode.toElement().attribute('count').value()))
            } else if (nodeName === 'PrimaryTuplet') {
                const num = gpToInt(innerNode.toElement().attribute('num').value())
                const denom = gpToInt(innerNode.toElement().attribute('den').value())
                rhythm.setTuplet({ num, denom })
            }

            innerNode = innerNode.nextSibling()
        }

        return [rhythmIdx, rhythm]
    }

    protected readTrackRSE(trackChildNode: XmlDomNode): GPTrackRSE {
        let innerNode: XmlDomNode = trackChildNode.firstChild()
        const nodeName = innerNode.nodeName()

        if (!innerNode.isNull() && nodeName === 'ChannelStrip') {
            innerNode = innerNode.firstChildElement('Parameters')
            if (!innerNode.isNull()) {
                const strList = innerNode.toElement().text().split(' ')
                const rse = new GPTrackRSE()
                rse.pan = gpToDouble(strList[11])
                rse.volume = gpToDouble(strList[12])
                return rse
            }
        }

        return new GPTrackRSE()
    }

    protected readKeySig(keyNode: XmlDomNode): GPMasterBarKeySig {
        const accidentalCount = keyNode.firstChildElement('AccidentalCount')
        const modeNode = keyNode.firstChildElement('Mode')

        const modeName = modeNode.toElement().text()

        let mode = GPMasterBarKeySigMode.Major
        if (modeName === 'Minor') {
            mode = GPMasterBarKeySigMode.Minor
        }

        const keyCount = gpToInt(accidentalCount.toElement().text())

        const sig = new GPMasterBarKeySig()
        sig.accidentalCount = keyCount as GPMasterBarKeySigAccidentals
        sig.mode = mode
        return sig
    }

    protected readUseFlats(keyNode: XmlDomNode): boolean {
        const transposeAs = keyNode.firstChildElement('TransposeAs')
        if (transposeAs.isNull()) {
            return false
        }
        return transposeAs.toElement().text() === 'Flats'
    }

    protected readTimeSig(timeNode: XmlDomNode): GPMasterBarTimeSig {
        const timeSig = timeNode.toElement().text().split('/')
        const sig = new GPMasterBarTimeSig()
        sig.numerator = gpToInt(timeSig[0])
        sig.denominator = gpToInt(timeSig[1])
        return sig
    }

    protected readNoteXProperties(propertiesNode: XmlDomNode, note: GPNote): void {
        let propertyNode = propertiesNode.firstChild()

        while (!propertyNode.isNull()) {
            const propertyId = gpToInt(propertyNode.toElement().attribute('id').value())

            if (propertyId === 688062467) {
                note.setTrillSpeed(gpToInt(propertyNode.firstChild().toElement().text()))
            }

            propertyNode = propertyNode.nextSibling()
        }
    }

    protected readNoteProperties(propertiesNode: XmlDomNode, note: GPNote): void {
        const properties = new Set<INoteProperty>()

        let propertyNode = propertiesNode.firstChild()

        while (!propertyNode.isNull()) {
            const propertyName = propertyNode.toElement().attribute('name').value()
            const firstChildText = (): string => propertyNode.firstChild().toElement().text()
            const enabled = (): boolean => propertyNode.firstChild().nodeName() === 'Enable'

            if (propertyName === 'Midi') {
                note.setMidi(gpToInt(firstChildText()))
            }
            if (propertyName === 'Variation') {
                note.setVariation(gpToInt(firstChildText()))
            }
            if (propertyName === 'Element') {
                note.setElement(gpToInt(firstChildText()))
            } else if (propertyName === 'String') {
                note.setString(gpToInt(firstChildText()))
            } else if (propertyName === 'Fret') {
                note.setFret(gpToInt(firstChildText()))
            } else if (propertyName === 'Octave') {
                note.setOctave(gpToInt(firstChildText()))
            } else if (propertyName === 'ConcertPitch') {
                const pitchNode = propertyNode.firstChild()
                let innerNode = pitchNode.firstChild()
                while (!innerNode.isNull()) {
                    if (innerNode.nodeName() === 'Accidental') {
                        const accidentals: Record<string, number> = { bb: -2, b: -1, '#': +1, x: +2 }
                        const accidentalName = innerNode.toElement().text()
                        if (accidentalName.length && Object.hasOwn(accidentals, accidentalName)) {
                            note.setAccidental(accidentals[accidentalName])
                        } else {
                            note.setAccidental(0)
                        }
                    }

                    innerNode = innerNode.nextSibling()
                }
            } else if (propertyName === 'Tone') {
                note.setTone(gpToInt(firstChildText()))
            } else if (propertyName === 'Bended') {
                if (enabled()) {
                    note.setBend(this.createBend(propertyNode))
                }
            } else if (propertyName === 'Harmonic'
                       || propertyName === 'HarmonicFret'
                       || propertyName === 'HarmonicType') {
                this.readHarmonic(propertyNode, note)
            } else if (propertyName === 'PalmMuted') {
                if (enabled()) {
                    note.setPalmMute(true)
                }
            } else if (propertyName === 'Muted') {
                // property muted in GP means dead note
                if (enabled()) {
                    note.setMute(true)
                }
            } else if (propertyName === 'Slide') {
                const slideInfo = gpToUInt(firstChildText())
                switch (slideInfo) {
                case 64:
                    note.setPickScrape(GPNotePickScrape.Down)
                    break
                case 128:
                    note.setPickScrape(GPNotePickScrape.Up)
                    break
                default:
                    note.setSlides(gpBitset(slideInfo, 6))
                    break
                }
            } else if (propertyName === 'HopoOrigin') {
                note.setHammerOn(GPNoteHammerOn.Start)
            } else if (propertyName === 'Tapped') {
                if (enabled()) {
                    note.setRightHandTapping(true)
                }
            } else if (propertyName === 'LeftHandTapped') {
                if (enabled()) {
                    note.setLeftHandTapped(true)
                }
            } else if (propertyName === 'ShowStringNumber') {
                note.setShowStringNumber(true)
            }

            propertyNode = propertyNode.nextSibling()
        }

        note.addProperties(properties)
    }

    protected readBeatXProperties(propertiesNode: XmlDomNode, beat: GPBeat): void {
        let propertyNode = propertiesNode.firstChild()

        let brokenBeams = false
        let brokenSecondaryBeams = false
        let joinedBeams = false

        while (!propertyNode.isNull()) {
            const propertyId = gpToInt(propertyNode.toElement().attribute('id').value())

            if (propertyId === 687931393 || propertyId === 687935489) {
                // arpeggio/brush ticks
                beat.setArpeggioStretch(gpToDouble(propertyNode.firstChild().toElement().text()) / Constants.DIVISION)
            } else if (propertyId === 1124204546) {
                const beamData = gpToInt(propertyNode.firstChild().toElement().text())

                if (beamData === 1) {
                    joinedBeams = true
                } else if (beamData === 2) {
                    brokenBeams = true
                }
            } else if (propertyId === 1124204552) {
                const beamData = gpToInt(propertyNode.firstChild().toElement().text())
                if (beamData === 1) {
                    brokenSecondaryBeams = true
                }
            }

            propertyNode = propertyNode.nextSibling()
        }

        if (brokenBeams) {
            beat.setBeamMode(GPBeatBeamMode.BROKEN)
        } else if (brokenSecondaryBeams) {
            beat.setBeamMode(joinedBeams ? GPBeatBeamMode.BROKEN2_JOINED : GPBeatBeamMode.BROKEN2)
        } else if (joinedBeams) {
            beat.setBeamMode(GPBeatBeamMode.JOINED)
        }
    }

    protected createBend(propertyNode: XmlDomNode): GPNoteBend {
        const bend = new GPNoteBend()

        let currentNode = propertyNode.nextSibling()
        while (!currentNode.isNull()) {
            const propertyName = currentNode.toElement().attribute('name').value()
            const value = (): number => gpToDouble(currentNode.firstChild().toElement().text())
            if (propertyName === 'BendDestinationOffset') {
                bend.destinationOffset = value()
            } else if (propertyName === 'BendDestinationValue') {
                bend.destinationValue = value()
            } else if (propertyName === 'BendMiddleOffset1') {
                bend.middleOffset1 = value()
            } else if (propertyName === 'BendMiddleOffset2') {
                bend.middleOffset2 = value()
            } else if (propertyName === 'BendMiddleValue') {
                bend.middleValue = value()
            } else if (propertyName === 'BendOriginOffset') {
                bend.originOffset = value()
            } else if (propertyName === 'BendOriginValue') {
                bend.originValue = value()
            }

            currentNode = currentNode.nextSibling()
        }

        return bend
    }

    protected readHarmonic(propertyNode: XmlDomNode, note: GPNote): void {
        const harmonicType = (str: string): GPNoteHarmonicType => {
            switch (str) {
            case 'Artificial': return GPNoteHarmonicType.Artificial
            case 'Semi': return GPNoteHarmonicType.Semi
            case 'Pinch': return GPNoteHarmonicType.Pinch
            case 'Feedback': return GPNoteHarmonicType.FeedBack
            case 'Natural': return GPNoteHarmonicType.Natural
            }
            return GPNoteHarmonicType.Tap
        }

        const propertyName = propertyNode.toElement().attribute('name').value()
        if (propertyName === 'HarmonicFret') {
            note.setHarmonicFret(gpToDouble(propertyNode.firstChild().toElement().text()))
        } else if (propertyName === 'HarmonicType') {
            note.setHarmonicType(harmonicType(propertyNode.firstChild().toElement().text()))
        }
    }

    protected readBeatProperties(propertiesNode: XmlDomNode, beat: GPBeat): void {
        const brushType = (brush: string): GPBeatBrush => (brush === 'Down' ? GPBeatBrush.Down : GPBeatBrush.Up)
        const vibratoType = (str: string): GPBeatVibratoWTremBar => {
            if (str === 'Wide') {
                return GPBeatVibratoWTremBar.Wide
            } else if (str === 'Slight') {
                return GPBeatVibratoWTremBar.Slight
            }
            return GPBeatVibratoWTremBar.None
        }
        const rasgueadoType = (str: string): GPBeatRasgueado => {
            switch (str) {
            case 'ii_1': return GPBeatRasgueado.II_1
            case 'mi_1': return GPBeatRasgueado.MII_1
            case 'mii_1': return GPBeatRasgueado.MII_1
            case 'mii_2': return GPBeatRasgueado.MII_2
            case 'ami_1': return GPBeatRasgueado.AMI_1
            case 'ami_2': return GPBeatRasgueado.AMI_2
            case 'pai_1': return GPBeatRasgueado.PAI_1
            case 'pai_2': return GPBeatRasgueado.PAI_2
            case 'pei_1': return GPBeatRasgueado.PEI_1
            case 'pei_2': return GPBeatRasgueado.PEI_2
            case 'pmp_1': return GPBeatRasgueado.PMP_1
            case 'pmp_2': return GPBeatRasgueado.PMP_2
            case 'ppp_1': return GPBeatRasgueado.PPP_1
            case 'amii_1': return GPBeatRasgueado.AMII_1
            case 'amip_1': return GPBeatRasgueado.AMIP_1
            case 'eami_1': return GPBeatRasgueado.EAMI_1
            case 'eamii_1': return GPBeatRasgueado.EAMII_1
            case 'peami_1': return GPBeatRasgueado.PEAMI_1
            }
            return GPBeatRasgueado.None
        }
        const pickStrokeType = (str: string): GPBeatPickStroke => {
            if (str === 'Up') {
                return GPBeatPickStroke.Up
            } else if (str === 'Down') {
                return GPBeatPickStroke.Down
            }
            return GPBeatPickStroke.None
        }

        let propertyNode = propertiesNode.firstChild()

        while (!propertyNode.isNull()) {
            const propertyName = propertyNode.toElement().attribute('name').value()
            const firstChildText = (): string => propertyNode.firstChild().toElement().text()
            const enabled = (): boolean => propertyNode.firstChild().nodeName() === 'Enable'

            if (propertyName === 'Popped') {
                if (enabled()) {
                    beat.setPopped(true)
                }
            } else if (propertyName === 'Slapped') {
                if (enabled()) {
                    beat.setSlapped(true)
                }
            } else if (propertyName === 'Brush') {
                beat.setBrush(brushType(firstChildText()))
            } else if (propertyName === 'VibratoWTremBar') {
                beat.setVibratoWTremBar(vibratoType(firstChildText()))
            } else if (propertyName === 'Rasgueado') {
                beat.setRasgueado(rasgueadoType(firstChildText()))
            } else if (propertyName === 'PickStroke') {
                beat.setPickStroke(pickStrokeType(firstChildText()))
            } else if (propertyName === 'BarreFret') {
                beat.setBarreFret(gpToInt(firstChildText()))
            } else if (propertyName === 'BarreString') {
                beat.setBarreString(gpToInt(firstChildText()))
            } else if (propertyName === 'WhammyBar') {
                beat.setDive(true)
            }
            // TODO: implement dive (WhammyBarDestinationOffset, ...)

            propertyNode = propertyNode.nextSibling()
        }
    }

    protected readTrackProperties(propertiesNode: XmlDomNode, track: GPTrack, ignoreTuningFlats: boolean): void {
        const property = new GPTrackStaffProperty()
        property.ignoreFlats = ignoreTuningFlats

        let propertyNode = propertiesNode.firstChild()

        while (!propertyNode.isNull()) {
            const propertyName = propertyNode.toElement().attribute('name').value()

            if (propertyName === 'CapoFret') {
                property.capoFret = gpToInt(propertyNode.firstChild().toElement().text())
            } else if (propertyName === 'FretCount') {
                property.fretCount = gpToInt(propertyNode.firstChild().toElement().text())
            } else if (propertyName === 'Tuning') {
                const tunningStr = propertyNode.firstChildElement('Pitches').text()
                property.tunning = tunningStr.split(' ').map(val => gpToInt(val))
                property.useFlats = !propertyNode.firstChildElement('Flat').isNull()
            } else if (propertyName === 'TuningFlat') {
                property.useFlats = !propertyNode.firstChildElement('Enable').isNull()
            } else if (propertyName === 'DiagramCollection' || propertyName === 'DiagramWorkingSet') {
                this.readDiagram(propertyNode.firstChild(), track)
            }

            propertyNode = propertyNode.nextSibling()
        }

        track.addStaffProperty(property)
    }

    protected readDiagram(items: XmlDomNode, track: GPTrack): void {
        let item = items.firstChild()

        while (!item.isNull()) {
            const diagram = new GPTrackDiagram()

            diagram.id = gpToInt(item.toElement().attribute('id').value())
            diagram.name = item.toElement().attribute('name').value()

            const diagramNode = item.firstChild()
            diagram.stringCount = gpToInt(diagramNode.toElement().attribute('stringCount').value())
            diagram.fretCount = gpToInt(diagramNode.toElement().attribute('fretCount').value())
            diagram.baseFret = gpToInt(diagramNode.toElement().attribute('baseFret').value())

            let fretNode = diagramNode.firstChild()
            while (!fretNode.isNull()) {
                if (fretNode.nodeName() === 'Fret') {
                    const string = gpToInt(fretNode.toElement().attribute('string').value())
                    const fret = gpToInt(fretNode.toElement().attribute('fret').value())
                    diagram.frets.set(string, fret)
                }

                fretNode = fretNode.nextSibling()
            }

            track.addDiagram([diagram.id, diagram])

            item = item.nextSibling()
        }
    }

    protected readLyrics(items: XmlDomNode, track: GPTrack): void {
        const lineNode = items.firstChildElement('Line')

        // This code doesn't support multiple lines of lyrics.
        if (!lineNode.isNull()) {
            const textNode = lineNode.firstChildElement('Text')
            if (!textNode.isNull()) {
                track.setLyrics(textNode.toElement().text())
            }

            const offsetNode = lineNode.firstChildElement('Offset')
            if (!offsetNode.isNull()) {
                track.setLyricsOffset(gpToInt(offsetNode.toElement().text()))
            }
        }
    }

    protected readEnding(endNode: XmlDomNode): number[] {
        return endNode.toElement().text().split(' ').map(val => gpToInt(val))
    }

    protected readRepeat(repeatNode: XmlDomNode): GPMasterBarRepeat {
        const repeatType = (start: string, end: string): GPMasterBarRepeatType => {
            if (start === 'true' && end === 'false') {
                return GPMasterBarRepeatType.Start
            } else if (start === 'false' && end === 'true') {
                return GPMasterBarRepeatType.End
            } else if (start === 'true' && end === 'true') {
                return GPMasterBarRepeatType.StartEnd
            }
            return GPMasterBarRepeatType.None
        }

        const start = repeatNode.toElement().attribute('start').value()
        const end = repeatNode.toElement().attribute('end').value()
        const count = gpToInt(repeatNode.toElement().attribute('count').value())

        const repeat = new GPMasterBarRepeat()
        repeat.type = repeatType(start, end)
        repeat.count = count
        return repeat
    }

    protected readMasterBarSection(sectionNode: XmlDomNode): [string, string] {
        const section: [string, string] = ['', '']

        let node = sectionNode.firstChild()

        while (!node.isNull()) {
            const nodeName = node.nodeName()

            if (nodeName === 'Letter') {
                section[0] = node.toElement().text()
            } else if (nodeName === 'Text') {
                section[1] = node.toElement().text()
            }

            node = node.nextSibling()
        }

        return section
    }

    protected readFermatas(fermatasNode: XmlDomNode): GPMasterBarFermata[] {
        const fermataType = (str: string): GPMasterBarFermataType => {
            if (str === 'Short') {
                return GPMasterBarFermataType.Short
            } else if (str === 'Medium') {
                return GPMasterBarFermataType.Medium
            }
            return GPMasterBarFermataType.Long
        }

        const fermatas: GPMasterBarFermata[] = []

        let fermataNode = fermatasNode.firstChild()

        while (!fermataNode.isNull()) {
            const fermata = new GPMasterBarFermata()

            let fermataProperty = fermataNode.firstChild()
            while (!fermataProperty.isNull()) {
                const nodeName = fermataProperty.nodeName()
                if (nodeName === 'Type') {
                    fermata.type = fermataType(fermataProperty.toElement().text())
                } else if (nodeName === 'Offset') {
                    const numbers = fermataProperty.toElement().text().split('/')
                    fermata.offsetNum = gpToInt(numbers[0])
                    fermata.offsetDenom = gpToInt(numbers[1])
                } else if (nodeName === 'Length') {
                    fermata.length = gpToDouble(fermataProperty.toElement().text())
                }

                fermataProperty = fermataProperty.nextSibling()
            }

            fermatas.push(fermata)
            fermataNode = fermataNode.nextSibling()
        }

        return fermatas
    }

    protected readRepeatsJumps(repeatsJumpsNode: XmlDomNode): GPMasterBarDirection[] {
        const repeatsJumps: GPMasterBarDirection[] = []

        let innerNode = repeatsJumpsNode.firstChild()

        while (!innerNode.isNull()) {
            const repeatJump = new GPMasterBarDirection()
            repeatJump.type = (innerNode.nodeName() === 'Jump' ? GPMasterBarDirectionType.Jump : GPMasterBarDirectionType.Repeat)
            repeatJump.name = innerNode.toElement().text()

            // GP encodes "To Coda" instructions as Jumps, but MuseScore uses Markers for that
            if ((repeatJump.name === 'DaCoda') || (repeatJump.name === 'DaDoubleCoda')) {
                repeatJump.type = GPMasterBarDirectionType.Marker
            }

            repeatsJumps.push(repeatJump)
            innerNode = innerNode.nextSibling()
        }

        return repeatsJumps
    }
}
