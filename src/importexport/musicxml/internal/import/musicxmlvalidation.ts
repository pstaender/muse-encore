/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/import/musicxmlvalidation.h/.cpp
 *
 * TODO(port): the validation against the MusicXML schema (QXmlSchemaValidator with the bundled XSD files) and its
 * dialog are not ported; like a build with MUSICXML_NO_VALIDATION every file is valid.
 */

import { Err } from '../../../../engraving/engravingerrors'

export class MusicXmlValidation {
    static validate(name: string, data: Uint8Array): Err {
        void name
        void data
        return Err.NoError
    }
}
