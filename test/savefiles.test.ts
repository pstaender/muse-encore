// SPDX-License-Identifier: GPL-3.0-only
// The file names of saved scores in the editor (editor/files.ts).
import { describe, expect, it } from 'vitest'
import { baseName, isMsczName, msczFileName } from '../editor/files'

describe('saved file names', () => {
    it('strips the extension of MuseScore files', () => {
        expect(baseName('Amazing grace.mscz')).toBe('Amazing grace')
        expect(baseName('score.MSCX')).toBe('score')
        expect(baseName('notes.txt')).toBe('notes.txt')
    })

    it('makes .mscz file names (Save as, Save a copy)', () => {
        expect(msczFileName('My song')).toBe('My song.mscz')
        expect(msczFileName(' My song.mscz ')).toBe('My song.mscz')
        expect(msczFileName('old.mscx')).toBe('old.mscz')
        expect(msczFileName('a/b: c?')).toBe('a_b_ c_.mscz')
        expect(msczFileName('   ')).toBe('Untitled score.mscz')
        expect(msczFileName('Song.mscz', ' - copy')).toBe('Song - copy.mscz')
        expect(isMsczName('x.mscz')).toBe(true)
        expect(isMsczName('x.mscx')).toBe(false)
    })
})
