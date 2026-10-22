/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Copies src/engraving/data/harmony_to_diagram.xml (the fret diagrams of the chord symbols, FretDiagram's
 * HARMONY_TO_DIAGRAM_FILE_PATH) to fonts/harmony_to_diagram.xml without the whitespace between the tags (half the size;
 * the file has no mixed content).
 *
 * usage: tsx tools/gen/gen-harmonytodiagram.ts <path to MuseScore source tree (v4.7.5)>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const src = process.argv[2]
if (!src) {
    console.error('usage: tsx tools/gen/gen-harmonytodiagram.ts <MuseScore source dir>')
    process.exit(1)
}

const xml = readFileSync(join(src, 'src/engraving/data/harmony_to_diagram.xml'), 'utf8')
const out = xml.replace(/>\s+</g, '><').trim() + '\n'
writeFileSync(join(import.meta.dirname, '../../fonts/harmony_to_diagram.xml'), out)
console.log(`fonts/harmony_to_diagram.xml: ${out.length} bytes`)
