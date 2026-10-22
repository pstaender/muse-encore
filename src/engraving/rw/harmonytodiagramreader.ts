/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/harmonytodiagramreader.h/.cpp
 */

import type { XmlReader } from './xmlreader'

export interface FretDiagramInfo {
    xml: string
    pattern: string
}

export class HarmonyToDiagramReader {
    static read(reader: XmlReader): Map<string, FretDiagramInfo> {
        const result = new Map<string, FretDiagramInfo>()

        while (reader.readNextStartElement()) {
            if (reader.name() !== 'Data') {
                break
            }

            while (reader.readNextStartElement()) {
                if (reader.name() === 'HarmonyToDiagram') {
                    let harmony = ''
                    let diagram = ''
                    let pattern = ''
                    while (reader.readNextStartElement()) {
                        if (reader.name() === 'Harmony') {
                            while (reader.readNextStartElement()) {
                                if (reader.name() === 'name') {
                                    harmony = reader.readText()
                                } else {
                                    reader.unknown()
                                }
                            }
                        } else if (reader.name() === 'FretDiagram') {
                            // C++ readBody() + skipCurrentElement()
                            diagram = reader.readXml()
                        } else if (reader.name() === 'pattern') {
                            pattern = reader.readText()
                        } else {
                            reader.unknown()
                        }
                    }

                    // C++ std::unordered_map::insert keeps the first entry of a name
                    if (harmony && diagram && !result.has(harmony)) {
                        result.set(harmony, { xml: diagram, pattern })
                    }
                } else {
                    reader.unknown()
                }
            }
        }

        return result
    }
}
