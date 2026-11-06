// SPDX-License-Identifier: GPL-3.0-only
// Comments (not in MuseScore, comments/api.ts): saved in a metaTag of the main score, anchored to an element or to the
// measure's EID, undoable, not shown or lost by the project properties; the markers on the pages; the markdown.
import { describe, expect, test } from 'vitest'
import { unzipSync } from 'fflate'
import {
    COMMENTS_META_TAG, COMMENT_MIME_FORMAT, addCommentAtSelection, canPasteCommentAtSelection, commentMimeData,
    pasteCommentAtSelection, commentElement, commentList, commentMarkers, isModified, layoutScore,
    loadScore, markSaved, moveComment, redo, removeComment, saveMscz, scoreComments, setCommentText, undo,
    type EngravingItem, type MasterScore,
} from '../src/index'
import { Fraction } from '../src/engraving/types/fraction'
import { DPI, ElementType } from '../src/engraving/types/types'
import { SelectType } from '../src/engraving/dom/select'
import { projectMetaInfo, setProjectMetaInfo } from '../src/project/projectpropertiesmodel'
import { commentPlainText, parseCommentMarkdown } from '../shared/comments/markdown'
import { VTEST, hasSubmodule, openScore, scoreHash } from './helpers'

const mainMscx = (mscz: Uint8Array): string => {
    const files = unzipSync(mscz)
    const name = Object.keys(files).find(n => n.endsWith('.mscx') && !n.includes('/'))!
    return new TextDecoder().decode(files[name])
}

async function open(file: string): Promise<MasterScore> {
    const score = await openScore(`${VTEST}/${file}`)
    layoutScore(score)
    markSaved(score)
    return score
}

/** adds a comment at a position (a range selection of one measure's staff at a tick) */
function addAtTick(score: MasterScore, tick: Fraction, staffIdx: number, text: string): string {
    score.select(score.tick2measure(tick)!, SelectType.RANGE, staffIdx)
    score.selection().setStartSegment(score.tick2leftSegment(tick)!)
    const c = addCommentAtSelection(score, text)!
    expect(c).not.toBeNull()
    return c.id
}

describe.skipIf(!hasSubmodule)('comments', () => {
    test('saved in a metaTag and read again', async () => {
        const score = await open('measure-repeat-3.mscx')
        expect(scoreComments(score).comments()).toHaveLength(0)

        const m2 = score.firstMeasure()!.nextMeasure()!
        addAtTick(score, m2.tick(), 0, 'Line 1\nLine 2 <&> "quoted"')
        expect(isModified(score)).toBe(true)

        const mscz = saveMscz(score)
        markSaved(score)
        expect(isModified(score)).toBe(false)
        expect(mainMscx(mscz)).toContain(`<metaTag name="${COMMENTS_META_TAG}">`)

        const loaded = loadScore(mscz)
        layoutScore(loaded)
        const read = scoreComments(loaded).comments()
        expect(read).toHaveLength(1)
        expect(read[0].text).toBe('Line 1\nLine 2 <&> "quoted"')
        const pos = scoreComments(loaded).position(read[0])!
        expect(pos.tick.ticks()).toBe(m2.tick().ticks())
        expect(pos.measure.no()).toBe(1)
        expect(pos.staffIdx).toBe(0)

        const markers = commentMarkers(loaded)
        expect(markers).toHaveLength(1)
        expect(markers[0].page).toBe(0)
        expect(commentList(loaded)[0].measureNo).toBe(2)
        expect(commentElement(loaded, read[0])?.tick().ticks()).toBe(pos.tick.ticks())

        // removing all comments removes the tag
        removeComment(loaded, read[0].id)
        expect(mainMscx(saveMscz(loaded))).not.toContain(COMMENTS_META_TAG)
    })

    test('undo and redo; the layout does not change', async () => {
        const score = await open('measure-repeat-3.mscx')
        const hash = scoreHash(score)
        const id = addAtTick(score, Fraction.fromTicks(0), 0, 'a')
        expect(setCommentText(score, id, 'b')).toBe(true)
        expect(setCommentText(score, id, 'b')).toBe(false) // nothing changed: no command
        expect(moveComment(score, id, 1.5, -2)).toBe(true)
        const comments = scoreComments(score)
        expect(comments.comment(id)).toMatchObject({ text: 'b', dx: 1.5, dy: -2 })
        expect(scoreHash(score)).toBe(hash)

        undo(score)
        expect(comments.comment(id)).toMatchObject({ text: 'b', dx: 0, dy: 0 })
        undo(score)
        expect(comments.comment(id)?.text).toBe('a')
        undo(score)
        expect(comments.comments()).toHaveLength(0)
        expect(isModified(score)).toBe(false)
        redo(score)
        redo(score)
        expect(comments.comment(id)?.text).toBe('b')
        removeComment(score, id)
        expect(comments.comments()).toHaveLength(0)
        undo(score)
        expect(comments.comment(id)?.text).toBe('b')
        expect(scoreHash(score)).toBe(hash)
    })

    test('attached to a note: the marker follows it and moves with its offset', async () => {
        const score = await open('accidental-1.mscx')
        let note: EngravingItem | null = null
        score.scanElements((e) => {
            if (!note && e.isNote()) {
                note = e
            }
        })
        expect(note).not.toBeNull()
        score.select(note!)
        const c = addCommentAtSelection(score, 'note')!
        expect(c.element).toBe(note!.eid())
        expect(commentList(score)[0].elementName).toBe(note!.translatedTypeUserName())
        expect(commentElement(score, c)).toBe(note)
        const before = commentMarkers(score)[0]
        expect(before.attached).toBe(true)
        moveComment(score, c.id, 2, 1)
        const after = commentMarkers(score)[0]
        expect(after.x - before.x).toBeCloseTo(2 * before.spatium, 5)
        expect(after.y - before.y).toBeCloseTo(before.spatium, 5)
        // the anchor (the top of the note) stays; the moved marker is connected with it
        expect(before.moved).toBe(false)
        expect(after.moved).toBe(true)
        expect(after.anchorX).toBeCloseTo(before.anchorX, 6)
        expect(after.anchorY).toBeCloseTo(before.anchorY, 6)
        const r = note!.canvasBoundingRect()
        const page = score.pages()[before.page].pos()
        expect(before.anchorY).toBeCloseTo((r.top() - page.y()) / DPI, 6)

        // saved and read: still attached to the note (its EID)
        const loaded = loadScore(saveMscz(score))
        layoutScore(loaded)
        const read = scoreComments(loaded).comments()[0]
        expect(commentElement(loaded, read)?.isNote()).toBe(true)
        expect(commentMarkers(loaded)[0].attached).toBe(true)
    })

    test('attached to a text in a frame; the fallback is the next measure', async () => {
        const score = await open('articulation-1.mscx')
        let text: EngravingItem | null = null
        score.pages()[0].scanElements((e) => {
            if (!text && e.type() === ElementType.TEXT && e.parentItem()?.isVBox()) {
                text = e
            }
        })
        expect(text).not.toBeNull()
        score.select(text!)
        const c = addCommentAtSelection(score, 'title')!
        expect(c).not.toBeNull()
        expect(commentMarkers(score)[0].attached).toBe(true)
        expect(c.measure).toBe(score.firstMeasure()!.eid())
        // the text is gone: the comment stays at the start of the measure
        c.element = 'missing'
        expect(scoreComments(score).position(c)!.measure).toBe(score.firstMeasure())
    })

    test('the measure EID keeps the position when the saved tick is wrong', async () => {
        const score = await open('measure-repeat-3.mscx')
        const m3 = score.firstMeasure()!.nextMeasure()!.nextMeasure()!
        const id = addAtTick(score, m3.tick(), 0, 'x')
        const c = { ...scoreComments(score).comment(id)!, tick: 0 }
        expect(scoreComments(score).position(c)!.measure).toBe(m3)
    })

    test('copied and pasted at another element (undoable)', async () => {
        const score = await open('measure-repeat-3.mscx')
        score.select(score.firstMeasure()!)
        const c = addCommentAtSelection(score, '**memo**', 'me')!
        const data = commentMimeData(score, c.id)!
        expect(data['text/plain']).toBe('**memo**')

        // pasted onto a measure: attached to it, a new comment with the text and author
        const m2 = score.firstMeasure()!.nextMeasure()!
        score.select(m2)
        expect(canPasteCommentAtSelection(score, data[COMMENT_MIME_FORMAT])).toBe(true)
        expect(canPasteCommentAtSelection(score, 'not json')).toBe(false)
        const pasted = pasteCommentAtSelection(score, data[COMMENT_MIME_FORMAT])!
        expect(pasted.id).not.toBe(c.id)
        expect(pasted.text).toBe('**memo**')
        expect(pasted.author).toBe('me')
        expect(scoreComments(score).position(pasted)!.measure).toBe(m2)
        expect(scoreComments(score).comments()).toHaveLength(2)

        // cut = copy + remove
        expect(removeComment(score, c.id)).toBe(true)
        expect(scoreComments(score).comments().map(x => x.id)).toEqual([pasted.id])
        undo(score)
        undo(score)
        expect(scoreComments(score).comments().map(x => x.id)).toEqual([c.id])

        // nothing selected: cannot paste
        score.deselectAll()
        expect(canPasteCommentAtSelection(score, data[COMMENT_MIME_FORMAT])).toBe(false)
    })

    test('the project properties neither show nor drop the comments', async () => {
        const score = await open('measure-repeat-3.mscx')
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

describe('comment markdown', () => {
    test('bold, italic, strikethrough, nesting, escapes', () => {
        expect(parseCommentMarkdown('a **b** c')).toEqual(['a ', { tag: 'strong', children: ['b'] }, ' c'])
        expect(parseCommentMarkdown('__b__ _i_ *i* ~~s~~')).toEqual([
            { tag: 'strong', children: ['b'] }, ' ', { tag: 'em', children: ['i'] }, ' ', { tag: 'em', children: ['i'] }, ' ',
            { tag: 's', children: ['s'] },
        ])
        expect(parseCommentMarkdown('**bold *and italic***')).toEqual([
            { tag: 'strong', children: ['bold ', { tag: 'em', children: ['and italic'] }] },
        ])
        expect(parseCommentMarkdown('snake_case_name 2 * 3 * 4 \\*no\\* **open')).toEqual(['snake_case_name 2 * 3 * 4 *no* **open'])
        expect(commentPlainText('**Fingering:** use *3*')).toBe('Fingering: use 3')
    })
})
