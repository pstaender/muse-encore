// SPDX-License-Identifier: GPL-3.0-only
// Comments (not in MuseScore, comments/api.ts): saved in a metaTag of the main score, anchored to the measure's EID,
// not shown or lost by the project properties, the markers on the pages.
import { describe, expect, test } from 'vitest'
import { unzipSync } from 'fflate'
import {
    COMMENTS_META_TAG, addCommentAtSelection, commentElement, commentMarkers, isModified, layoutScore, loadScore,
    markSaved, saveMscz, scoreComments,
} from '../src/index'
import { Fraction } from '../src/engraving/types/fraction'
import { projectMetaInfo, setProjectMetaInfo } from '../src/project/projectpropertiesmodel'
import { VTEST, hasSubmodule, openScore } from './helpers'

const mainMscx = (mscz: Uint8Array): string => {
    const files = unzipSync(mscz)
    const name = Object.keys(files).find(n => n.endsWith('.mscx') && !n.includes('/'))!
    return new TextDecoder().decode(files[name])
}

describe.skipIf(!hasSubmodule)('comments', () => {
    test('saved in a metaTag and read again', async () => {
        const score = await openScore(`${VTEST}/measure-repeat-3.mscx`)
        layoutScore(score)
        const comments = scoreComments(score)
        expect(comments.comments()).toHaveLength(0)
        markSaved(score)

        const m2 = score.firstMeasure()!.nextMeasure()!
        const c = comments.addComment(score, m2.tick().plus(new Fraction(1, 4)), 0, 'Line 1\nLine 2 <&> "quoted"')!
        expect(c).not.toBeNull()
        expect(isModified(score)).toBe(true)

        const mscz = saveMscz(score)
        markSaved(score)
        expect(isModified(score)).toBe(false)
        const xml = mainMscx(mscz)
        expect(xml).toContain(`<metaTag name="${COMMENTS_META_TAG}">`)

        const loaded = loadScore(mscz)
        layoutScore(loaded)
        const read = scoreComments(loaded).comments()
        expect(read).toHaveLength(1)
        expect(read[0].text).toBe('Line 1\nLine 2 <&> "quoted"')
        const pos = scoreComments(loaded).position(read[0])!
        expect(pos.tick.ticks()).toBe(m2.tick().ticks() + 480)
        expect(pos.measure.no()).toBe(1)
        expect(pos.staffIdx).toBe(0)

        const markers = commentMarkers(loaded)
        expect(markers).toHaveLength(1)
        expect(markers[0].page).toBe(0)
        expect(markers[0].measureNo).toBe(2)
        expect(commentElement(loaded, read[0])?.tick().ticks()).toBeLessThanOrEqual(pos.tick.ticks())

        // removing all comments removes the tag
        scoreComments(loaded).removeComment(read[0].id)
        expect(mainMscx(saveMscz(loaded))).not.toContain(COMMENTS_META_TAG)
    })

    test('the measure EID keeps the position when measures are inserted before', async () => {
        const score = await openScore(`${VTEST}/measure-repeat-3.mscx`)
        layoutScore(score)
        const m3 = score.firstMeasure()!.nextMeasure()!.nextMeasure()!
        const c = scoreComments(score).addComment(score, m3.tick(), 0, 'x')!
        // the saved tick is wrong after measures were inserted: the measure's EID wins
        c.tick = 0
        expect(scoreComments(score).position(c)!.measure).toBe(m3)
    })

    test('the project properties neither show nor drop the comments', async () => {
        const score = await openScore(`${VTEST}/measure-repeat-3.mscx`)
        layoutScore(score)
        score.select(score.firstMeasure()!)
        expect(addCommentAtSelection(score, 'memo')).not.toBeNull()
        const meta = projectMetaInfo(score)
        expect([...meta.additionalTags.keys()]).not.toContain(COMMENTS_META_TAG)
        meta.title = 'Changed'
        setProjectMetaInfo(score, meta, null)
        const loaded = loadScore(saveMscz(score))
        expect(scoreComments(loaded).comments().map(c => c.text)).toEqual(['memo'])
    })
})
