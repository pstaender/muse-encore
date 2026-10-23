/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gp6dombuilder.h/.cpp
 */

import type { XmlDomNode } from '../../../../framework/global/serialization/xmldom'
import { GP67DomBuilder, gpToDouble, gpToInt } from './gp67dombuilder'
import { GPTrack, GPTrackSoundAutomation } from './gptrack'

export class GP6DomBuilder extends GP67DomBuilder {
    protected override createGPTrack(trackNode: XmlDomNode, _versionNode: XmlDomNode): [number, GPTrack] {
        // unused nodes: Color, SystemsDefaultLayout, SystemsLayout, SystemsDefautLayout, PalmMute, AutoAccentuation,
        // PlayingStyle, UseOneChannelPerString, PartSounding, PlaybackState

        const trackIdx = gpToInt(trackNode.toElement().attribute('id').value())
        const track = new GPTrack(trackIdx)
        let trackChildNode = trackNode.firstChild()
        while (!trackChildNode.isNull()) {
            const nodeName = trackChildNode.nodeName()
            if (nodeName === 'Name') {
                track.setName(trackChildNode.toElement().text())
            } else if (nodeName === 'RSE') {
                track.setRSE(this.readTrackRSE(trackChildNode))
                const bankChangesNode = trackChildNode.firstChildElement('BankChanges')
                if (!bankChangesNode.isNull()) {
                    let bankChange = bankChangesNode.firstChild()
                    while (!bankChange.isNull()) {
                        track.addSoundAutomation(this.readRsePickUp(bankChange))
                        bankChange = bankChange.nextSibling()
                    }
                }
            } else if (nodeName === 'GeneralMidi') {
                if (trackChildNode.hasChildNodes()) {
                    track.setProgramm(gpToInt(trackChildNode.firstChildElement('Program').text()))
                    track.setMidiChannel(gpToInt(trackChildNode.firstChildElement('PrimaryChannel').text()))
                }
            } else if (nodeName === 'ShortName') {
                track.setShortName(trackChildNode.toElement().text())
            } else if (nodeName === 'Properties') {
                this.readTrackProperties(trackChildNode, track, false)
            } else if (nodeName === 'Instrument') {
                this.setUpInstrument(trackChildNode, track)
            } else if (nodeName === 'Lyrics') {
                this.readLyrics(trackChildNode, track)
            }
            trackChildNode = trackChildNode.nextSibling()
        }

        return [trackIdx, track]
    }

    private setUpInstrument(trackChildNode: XmlDomNode, track: GPTrack): void {
        const ref = trackChildNode.toElement().attribute('ref').value()
        track.setInstrument(ref)

        if (ref.endsWith('-gs') || ref.startsWith('2')) { // grand staff
            track.setStaffCount(2)
        }

        if (ref.includes('gtr') || ref.includes('bass')) {
            // NOTE Guitar notation is transposed to octave by default (see music grammar)
            track.setTranspose(-12)
            track.setIsGuitar(true)
        }
    }

    private readRsePickUp(bankChangesNode: XmlDomNode): GPTrackSoundAutomation {
        const result = new GPTrackSoundAutomation()
        result.bar = gpToInt(bankChangesNode.toElement().attribute('barIndex').value())
        result.value = bankChangesNode.toElement().attribute('bankId').value()
        result.position = gpToDouble(bankChangesNode.toElement().attribute('tickOffset').value())
        return result
    }
}
