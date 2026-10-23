// SPDX-License-Identifier: GPL-3.0-only
// Find / Go to: SearchCommandsParser (MuseScore's searchcommandsparser tests) and the selection of searchNotation.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { layoutScore, loadScore, searchNotation } from '../src/index'
import { SearchCommandsParser, SearchDataType } from '../src/notation/internal/searchcommandsparser'
import { ROOT, initFonts } from './helpers'

const VTEST = `${ROOT}MuseScore/vtest/scores/`

describe('SearchCommandsParser', () => {
    it('parses measures, measure ranges, pages and rehearsal marks', () => {
        expect(SearchCommandsParser.parse('')).toEqual({ type: SearchDataType.Invalid })
        expect(SearchCommandsParser.parse('12')).toEqual({ type: SearchDataType.Measure, measureIndex: 12 })
        expect(SearchCommandsParser.parse('3-7')).toEqual({ type: SearchDataType.MeasureRange, measureRange: [3, 7] })
        // a reversed range is no measure command: the text is searched as a rehearsal mark
        expect(SearchCommandsParser.parse('7-3')).toEqual({ type: SearchDataType.RehearsalMark, rehearsalMark: '7-3' })
        expect(SearchCommandsParser.parse('p2')).toEqual({ type: SearchDataType.Page, pageIndex: 2 })
        expect(SearchCommandsParser.parse('P10')).toEqual({ type: SearchDataType.Page, pageIndex: 10 })
        expect(SearchCommandsParser.parse('rB')).toEqual({ type: SearchDataType.RehearsalMark, rehearsalMark: 'b' })
        expect(SearchCommandsParser.parse('Intro')).toEqual({ type: SearchDataType.RehearsalMark, rehearsalMark: 'intro' })
        expect(SearchCommandsParser.parse('pa')).toEqual({ type: SearchDataType.RehearsalMark, rehearsalMark: 'pa' })
    })
})

describe.skipIf(!existsSync(VTEST))('searchNotation', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('selects a measure, a measure range and nothing for an unknown rehearsal mark', () => {
        const score = loadScore(readFileSync(`${VTEST}beams-10.mscx`))
        layoutScore(score)
        expect(searchNotation(score, '2')).toBe(1)
        expect(score.selection().isRange()).toBe(true)
        expect(score.selection().startSegment()!.measure()).toBe(score.firstMeasure()!.nextMeasure())

        expect(searchNotation(score, '1-3')).toBe(2)
        expect(score.selection().isRange()).toBe(true)
        expect(score.selection().startSegment()!.measure()).toBe(score.firstMeasure())

        expect(searchNotation(score, 'zzz')).toBe(0)
        expect(score.selection().isNone()).toBe(true)
        expect(searchNotation(score, 'p1')).toBe(1)
    })
})
