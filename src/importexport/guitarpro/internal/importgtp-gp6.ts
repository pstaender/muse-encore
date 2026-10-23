/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/importgtp-gp6.cpp (GuitarPro6): reads the GPX container of Guitar Pro 6
 * files (BCFZ compressed / BCFS file system) and converts its score.gpif with the GPConverter.
 */

import type { Buffer } from '../../../framework/global/io/buffer'
import { XmlDomDocument, type XmlDomNode } from '../../../framework/global/serialization/xmldom'
import type { MasterScore } from '../../../engraving/dom/masterscore'
import type { Segment } from '../../../engraving/dom/segment'
import { GuitarPro } from './importgtp'
import { GP6DomBuilder } from './gtp/gp6dombuilder'
import { GPConverter } from './gtp/gpconverter'
import type { IGPDomBuilder } from './gtp/igpdombuilder'

/** a growable byte array (C++ muse::ByteArray) */
type ByteArray = number[] | Uint8Array

export class GuitarPro6 extends GuitarPro {
    // an integer stored in the header indicating that the file is not compressed (BCFS).
    private readonly GPX_HEADER_UNCOMPRESSED = 1397113666
    // an integer stored in the header indicating that the file is not compressed (BCFZ).
    private readonly GPX_HEADER_COMPRESSED = 1514554178
    private position = 0
    // a constant storing the amount of bits per byte
    private readonly BITS_IN_BYTE = 8

    static readonly instrumentMapping = new Map<string, string>([
    ['2Mrcs', 'maracas'],
    ['a-bass4', 'acoustic-bass'],
    ['a-bass5', 'acoustic-bass'],
    ['a-bass6', 'acoustic-bass'],
    ['alt-c', 'alto'],
    ['alt-s', 'alto'],
    ['a-piano-gs', 'piano'],
    ['a-piano-ss', 'piano'],
    ['bass-c', 'bass'],
    ['bass-flt-c', 'bass-flute'],
    ['bassn', 'bassoon'],
    ['bass-s', 'bass'],
    ['basstuba-eb', 'bass-eb-tuba'],
    ['bnj4', 'banjo'],
    ['bnj5', 'banjo'],
    ['bnj6', 'banjo'],
    ['bongo', 'bongos'],
    ['brthns', 'baritone-horn'],
    ['brtn-c', 'baritone'],
    ['brtn-s', 'baritone'],
    ['cbs', 'cabasa'],
    ['cello', 'violoncello'],
    ['china', 'chinese-tom-toms'],
    ['clrnt-a', 'a-clarinet'],
    ['clrnt-bb-bass', 'bass-clarinet'],
    ['clrnt-bb', 'bb-clarinet'],
    ['clrnt-c', 'c-clarinet'],
    ['clrnt-d', 'd-clarinet'],
    ['clrnt-eb', 'eb-clarinet'],
    ['clrnt', 'clarinet'],
    ['clst-gs', 'celesta'],
    ['clst-ss', 'celesta'],
    ['clvs', 'claves'],
    ['cngKit', 'congas'],
    ['conga', 'congas'],
    ['cowbell', 'cowbell'],
    ['crash', 'crash-cymbal'],
    ['cstnt', 'castanets'],
    ['ctbassn', 'contrabassoon'],
    ['ctbass', 'contrabass'],
    ['cuicaKit', 'cuica'],
    ['cuica', 'cuica'],
    ['drmkt', 'drumset'],
    ['e-bass4', 'bass-guitar'],
    ['e-bass5', 'bass-guitar'],
    ['e-bass6', 'bass-guitar'],
    ['e-gtr12', 'electric-guitar-treble-clef'],
    ['e-gtr6', 'electric-guitar-treble-clef'],
    ['e-gtr7', 'electric-guitar-treble-clef'],
    ['e-gtr8', 'electric-guitar-treble-clef'],
    ['em-organ-gs', 'organ'],
    ['em-organ-ss', 'organ'],
    ['en-horn', 'english-horn'],
    ['e-piano-gs', 'electric-piano'],
    ['e-piano-ss', 'electric-piano'],
    ['flt-c', 'flute'],
    ['flt-g', 'alto-flute'],
    ['flt-whstl', 'tin-whistle'],
    ['fr-horn', 'horn'],
    ['grcss', 'bass-drum'], //grancassa is an alternative name for bass drum
    ['guiro', 'guiro'],
    ['harp-gs', 'harp'],
    ['harp-ss', 'harp'],
    ['hclap', 'hand-clap'],
    ['hihat', 'hi-hat'],
    ['hrpch-gs', 'harpsichord'],
    ['hrpch-ss', 'harpsichord'],
    ['jngl-bell', 'sleigh-bells'],
    ['klmb', 'kalimba'],
    ['mrcs', 'maracas'],
    ['n-gtr6', 'guitar-nylon-treble-clef'],
    ['n-gtr7', 'guitar-nylon-treble-clef'],
    ['n-gtr8', 'guitar-nylon-treble-clef'],
    ['oboe', 'oboe'],
    ['ocrn', 'ocarina'],
    ['pccl', 'piccolo'],
    ['pedalhihat', 'hi-hat'],
    ['pnflt', 'pan-flute'],
    ['ptt', 'cymbal'], //piatti is cymbal in italian
    ['rec', 'recorder'],
    ['ride', 'ride-cymbal'],
    ['rvs-cymb', 'cymbal'],
    ['sax-alt-eb', 'alto-saxophone'],
    ['sax-bar-eb', 'baritone-saxophone'],
    ['sax-bass-eb', 'bass-saxophone'],
    ['sax-ms-f', 'mezzo-soprano-saxophone'],
    ['sax-sop-bb', 'soprano-saxophone'],
    ['sax-ten-bb', 'tenor-saxophone'],
    ['sax-ten-c', 'melody-saxophone'],
    ['s-bass4', 'electric-bass'],
    ['s-bass5', '5-string-electric-bass'],
    ['s-gtr12', 'guitar-steel-treble-clef'],
    ['s-gtr6', 'guitar-steel-treble-clef'],
    ['s-gtr7', 'guitar-steel-treble-clef'],
    ['s-gtr8', 'guitar-steel-treble-clef'],
    ['shkr', 'percussion'],
    ['shmsn', 'shamisen'],
    ['shn', 'sheng'],
    ['snare', 'snare-drum'],
    ['snr', 'snare-drum'],
    ['snt-brass-gs', 'brass-synthesizer'],
    ['snt-brass-ss', 'brass-synthesizer'],
    //{"snt-key-gs",    ""},
    //{"snt-key-ss",    ""},
    //{"snt-seq-gs",    ""},
    //{"snt-seq-ss",    ""},
    ['snt-lead-gs', 'poly-synth'],
    ['snt-lead-ss', 'poly-synth'],
    ['snt-pad', 'pad-synth'],
    ['snt-pad-gs', 'pad-synth'],
    ['snt-pad-ss', 'pad-synth'],
    ['splash', 'splash-cymbal'],
    ['sprn-c', 'soprano'],
    ['sprn-s', 'soprano'],
    ['tmbrn', 'tambourine'], // to be mapped
    ['Tambourine-Perc', 'tambourine'],
    ['Tambourine', 'tambourine'],
    ['tmblKit', 'timbales'],
    ['tmbl', 'timbales'],
    ['tmpn', 'timpani'],
    ['tnklbll', 'tubular-bells'], //The short form does not match but this is very likely due to the description
    ['tnr-c', 'tenor'],
    ['tnr-s', 'tenor'],
    ['Triangle-Percu', 'triangle'],
    ['trmbn-bb-bass', 'bass-trombone'],
    ['trmbn-bb', 'tenor-trombone'],
    ['trmbn-bb-treble', 'trombone-treble'],
    ['trmbn-eb', 'alto-trombone'],
    ['trmpt-a', 'a-trumpet'],
    ['trmpt-bb', 'bb-trumpet'],
    ['trmpt-c-bass', 'c-bass-trumpet'],
    ['trmpt-c', 'c-trumpet'],
    ['trmpt-d', 'd-trumpet'],
    ['trmpt-eb-bass', 'eb-bass-trumpet'],
    ['trmpt-eb', 'eb-trumpet'],
    ['trmpt-e', 'e-trumpet'],
    ['trmpt-f', 'f-trumpet'],
    ['trmpt-flgh', 'flugelhorn'],
    ['trngl', 'triangle'],
    ['ukll4', 'ukulele'],
    ['vbrphn', 'vibraphone'],
    ['vbrslp', 'vibraslap'], // to be mapped
    ['vla', 'viola'],
    ['vln', 'violin'],
    ['wdblckKit', 'wood-blocks'],
    ['wdblck', 'wood-blocks'],
    ['whstlKit', 'slide-whistle'],
    ['whstl', 'tin-whistle'],
    ['xlphn', 'xylophone'],
    ])

    constructor(s: MasterScore, v = 6) {
        super(s, v)
    }

    protected override createGPDomBuilder(): IGPDomBuilder | null {
        return new GP6DomBuilder()
    }

    protected override readBeatEffects(_track: number, _segment: Segment): number { return 0 }

    private readBit(buffer: ByteArray): number {
        // calculate the byte index by dividing the position in bits by the bits per byte
        const byteIndex = Math.trunc(this.position / this.BITS_IN_BYTE)

        // calculate our offset so we know how much to bit shift
        const byteOffset = ((this.BITS_IN_BYTE - 1) - (this.position % this.BITS_IN_BYTE))

        // calculate the bit which we want to read
        const byte = byteIndex < buffer.length ? buffer[byteIndex] : 0
        const bit = (((byte & 0xff) >> byteOffset) & 0x01)

        // increment our current position so we know this bit has been read
        this.position++
        return bit // return the bit we calculated
    }

    private readBits(buffer: ByteArray, bitsToRead: number): number {
        let bits = 0
        for (let i = (bitsToRead - 1); i >= 0; i--) {
            bits |= (this.readBit(buffer) << i)
        }
        return bits
    }

    private readBitsReversed(buffer: ByteArray, bitsToRead: number): number {
        let bits = 0
        for (let i = 0; i < bitsToRead; i++) {
            bits |= this.readBit(buffer) << i
        }
        return bits
    }

    private getBytes(buffer: ByteArray, offset: number, length: number): number[] {
        const newBytes: number[] = []
        // compute new bytes from our buffer and return byte array
        for (let i = 0; i < length; i++) {
            if (buffer.length > offset + i) {
                newBytes.push(buffer[offset + i])
            }
        }
        return newBytes
    }

    private readInteger(buffer: ByteArray, offset: number): number {
        // take four bytes from the buffer
        const b0 = buffer[offset + 0] ?? 0
        const b1 = buffer[offset + 1] ?? 0
        const b2 = buffer[offset + 2] ?? 0
        const b3 = buffer[offset + 3] ?? 0
        // increment positioning so we keep track of where we are
        this.position += 4 * this.BITS_IN_BYTE
        // bit shift in order to compute our integer value and return
        return ((b3 & 0xff) << 24) | ((b2 & 0xff) << 16) | ((b1 & 0xff) << 8) | (b0 & 0xff)
    }

    private readString(buffer: ByteArray, offset: number, length: number): string {
        let filename = ''
        // compute the string by iterating through the buffer
        for (let i = 0; i < length; i++) {
            const charValue = ((buffer[offset + i] ?? 0) & 0xff)
            if (charValue === 0) {
                break
            }
            filename += String.fromCharCode(charValue)
        }
        return filename
    }

    /** C++ getNode */
    private getNode(id: string, currentDomNode: XmlDomNode): XmlDomNode {
        while (!currentDomNode.isNull()) {
            const currentId = currentDomNode.toElement().attribute('id').value()
            if (currentId === id) {
                return currentDomNode
            }
            currentDomNode = currentDomNode.nextSibling()
        }
        return currentDomNode
    }

    protected readGpif(data: Uint8Array): void {
        const domDoc = new XmlDomDocument()
        domDoc.setContent(data)
        const domElem = domDoc.rootElement()

        const builder = this.createGPDomBuilder()!
        builder.buildGPDomModel(domElem)

        const scoreBuilder = new GPConverter(this.score, builder.getGPDomModel()!)
        scoreBuilder.convertGP()
    }

    private parseFile(filename: string, data: ByteArray): void {
        // test to check if we are dealing with the score
        if (filename === 'score.gpif') {
            this.readGpif(data instanceof Uint8Array ? data : Uint8Array.from(data))
        }
    }

    private readGPX(buffer: ByteArray): void {
        // start by reading the file header. It will tell us if the byte array is compressed.
        const fileHeader = this.readInteger(buffer, 0)

        if (fileHeader === this.GPX_HEADER_COMPRESSED) {
            // this is  a compressed file.
            const length = this.readInteger(buffer, Math.trunc(this.position / this.BITS_IN_BYTE))
            const bcfsBuffer: number[] = []
            while (Math.trunc(this.position / this.BITS_IN_BYTE) < length) {
                // read the bit indicating compression information
                const flag = this.readBits(buffer, 1)

                if (flag) {
                    const bits = this.readBits(buffer, 4)
                    const offs = this.readBitsReversed(buffer, bits)
                    const size = this.readBitsReversed(buffer, bits)

                    const pos = bcfsBuffer.length - offs
                    const n = size > offs ? offs : size
                    for (let i = 0; i < n; i++) {
                        bcfsBuffer.push(bcfsBuffer[pos + i] ?? 0)
                    }
                } else {
                    const size = this.readBitsReversed(buffer, 2)
                    for (let i = 0; i < size; i++) {
                        bcfsBuffer.push(this.readBits(buffer, 8))
                    }
                }
            }
            // recurse on the decompressed file stored as a byte array
            this.readGPX(bcfsBuffer)
        } else if (fileHeader === this.GPX_HEADER_UNCOMPRESSED) {
            // this is an uncompressed file - strip the header off
            buffer = buffer.slice(4)
            const sectorSize = 0x1000
            let offset = 0
            while ((offset = (offset + sectorSize)) + 3 < buffer.length) {
                const newInt = this.readInteger(buffer, offset)
                if (newInt === 2) {
                    const indexFileName = (offset + 4)
                    const indexFileSize = (offset + 0x8C)
                    const indexOfBlock = (offset + 0x94)

                    // create a byte array and put information about files found in it
                    let block = 0
                    let blockCount = 0
                    const fileBytes: number[] = []
                    while ((block = this.readInteger(buffer, (indexOfBlock + (4 * (blockCount++))))) !== 0) {
                        for (const b of this.getBytes(buffer, (offset = (block * sectorSize)), sectorSize)) {
                            fileBytes.push(b)
                        }
                    }
                    // get file information and read the file
                    const fileSize = this.readInteger(buffer, indexFileSize) >>> 0
                    if (fileBytes.length >= fileSize) {
                        const filename = this.readString(buffer, indexFileName, 127)
                        const data = this.getBytes(fileBytes, 0, fileSize)
                        this.parseFile(filename, data)
                    }
                }
            }
        }
    }

    override read(io: Buffer): boolean {
        this.f = io
        this.previousTempo = -1
        // decompress and read files contained within GPX file
        const ba = io.readAll()

        this.readGPX(ba)

        return true
    }
}
