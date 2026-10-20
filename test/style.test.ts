import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MscReader } from '../src/engraving/infrastructure/mscreader'
import { MStyle } from '../src/engraving/style/style'
import { Sid } from '../src/engraving/style/styledef'
import { Spatium } from '../src/engraving/types/dimension'

import { VTEST } from './helpers'

describe('MStyle', () => {
    it('has defaults', () => {
        const s = new MStyle()
        s.precomputeValues()
        expect(s.spatium()).toBeCloseTo(1.75 * 1200 / 25.4)
        expect((s.value(Sid.staffDistance) as Spatium).val()).toBe(6.5)
        expect(s.styleMM(Sid.staffDistance)).toBeCloseTo(6.5 * s.spatium())
        expect(s.styleB(Sid.pageTwosided)).toBe(true)
    })

    it('reads score_style.mss from mscz', () => {
        const r = new MscReader(readFileSync(`${VTEST}/beams-24.mscz`))
        expect(r.isContainer()).toBe(true)
        const style = new MStyle()
        style.readDocument(r.readStyleFile()!)
        expect(style.spatium()).toBeGreaterThan(10)
        const score = new TextDecoder().decode(r.readScoreFile()!)
        expect(score).toContain('<museScore version="4.60">')
    })
})
