/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gp7dombuilder.h/.cpp
 */

import type { XmlDomNode } from '../../../../framework/global/serialization/xmldom'
import { GP67DomBuilder, gpToDouble, gpToInt } from './gp67dombuilder'
import { GPTrack, GPTrackSound, GPTrackSoundAutomation } from './gptrack'

export class GP7DomBuilder extends GP67DomBuilder {
    protected override createGPTrack(trackNode: XmlDomNode, versionNode: XmlDomNode): [number, GPTrack] {
        // unused nodes: Color, SystemsDefautLayout, SystemsLayout, AutoBrush, PalmMute, AutoAccentuation, PlayingStyle,
        // UseOneChannelPerString, IconId, InstrumentSet, ForcedSound, PlaybackState, AudioEngineState

        const trackIdx = gpToInt(trackNode.toElement().attribute('id').value())
        const track = new GPTrack(trackIdx)
        let trackChildNode = trackNode.firstChild()
        const version = versionNode.toElement().text()

        while (!trackChildNode.isNull()) {
            const nodeName = trackChildNode.nodeName()
            if (nodeName === 'Name') {
                track.setName(trackChildNode.toElement().text())
            } else if (nodeName === 'RSE') {
                track.setRSE(this.readTrackRSE(trackChildNode))
            } else if (nodeName === 'MidiConnection') {
                track.setMidiChannel(this.readMidiChannel(trackChildNode))
            } else if (nodeName === 'ShortName') {
                track.setShortName(trackChildNode.toElement().text())
            } else if (nodeName === 'Sounds') {
                const programm = this.readMidiProgramm(trackChildNode)
                let soundNode = trackChildNode.firstChild()
                while (!soundNode.isNull()) {
                    track.addSound(this.readSounds(soundNode))
                    soundNode = soundNode.nextSibling()
                }
                track.setProgramm(programm)
            } else if (nodeName === 'Staves') {
                let staffNode = trackChildNode.firstChild()
                let staffCount = 0
                while (!staffNode.isNull()) {
                    const propertyNode = staffNode.firstChild()
                    // there is a bug in gp v 7.0.0
                    // All parts marked to use flat for tuning string,
                    // but in real world gp uses tuning presets
                    // sp we have to ignore <Flats/> and <TuningFlat> props
                    this.readTrackProperties(propertyNode, track, version === '7')
                    staffNode = staffNode.nextSibling()
                    staffCount++
                }
                track.setStaffCount(staffCount)
            } else if (nodeName === 'NotationPatch') {
                const innerNode = trackChildNode.firstChildElement('LineCount')
                if (!innerNode.isNull()) {
                    track.setLineCount(gpToInt(innerNode.toElement().text()))
                }
            } else if (nodeName === 'Transpose') {
                const octave = gpToInt(trackChildNode.firstChildElement('Octave').toElement().text())
                const chromatic = gpToInt(trackChildNode.firstChildElement('Chromatic').toElement().text())
                track.setTranspose(12 * octave + chromatic)
            } else if (nodeName === 'Lyrics') {
                this.readLyrics(trackChildNode, track)
            } else if (nodeName === 'Automations') {
                let automationNode = trackChildNode.firstChild()
                while (!automationNode.isNull()) {
                    const automation = this.readTrackAutomation(automationNode)
                    if (automation.type.length) {
                        track.addSoundAutomation(automation)
                    }
                    automationNode = automationNode.nextSibling()
                }
            }
            trackChildNode = trackChildNode.nextSibling()
        }

        return [trackIdx, track]
    }

    private readMidiChannel(trackChildNode: XmlDomNode): number {
        return gpToInt(trackChildNode.firstChildElement('PrimaryChannel').text())
    }

    private readMidiProgramm(trackChildNode: XmlDomNode): number {
        return gpToInt(trackChildNode.firstChild()
            .firstChildElement('MIDI')
            .firstChildElement('Program')
            .text())
    }

    private readSounds(soundNode: XmlDomNode): GPTrackSound {
        const result = new GPTrackSound()
        result.programm = gpToInt(soundNode.firstChildElement('MIDI').firstChildElement('Program').text())
        result.name = soundNode.firstChildElement('Name').text()
        result.label = soundNode.firstChildElement('Label').text()
        result.path = soundNode.firstChildElement('Path').text()
        result.role = soundNode.firstChildElement('Role').text()
        return result
    }

    private readTrackAutomation(automationNode: XmlDomNode): GPTrackSoundAutomation {
        const result = new GPTrackSoundAutomation()
        const type = automationNode.firstChildElement('Type').text()
        if (type !== 'Sound') {
            return result
        }

        result.type = type
        result.linear = automationNode.firstChildElement('Linear').text() === 'true'
        result.bar = gpToInt(automationNode.firstChildElement('Bar').text())
        result.value = automationNode.firstChildElement('Value').text()
        result.position = gpToDouble(automationNode.firstChildElement('Position').text())
        return result
    }
}
