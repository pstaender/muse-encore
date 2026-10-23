/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/types/projectmeta.h (ProjectMeta, the tags), NotationProject::metaInfo/setMetaInfo
 * (src/project/internal/notationproject.cpp) and the Project properties dialog's model
 * (src/project/qml/MuseScore/Project/internal/Properties/projectpropertiesmodel.cpp, File > Project properties…).
 * Dates are QDate's ISO strings ("yyyy-MM-dd"); the dialog shows them like QDate::toString() (Qt::TextDate).
 */

import { qtrc } from '../framework/global/translation'
import { TranslatableString } from '../framework/global/types/translatablestring'
import { ChangeMetaTags } from '../engraving/editing/editscoreproperties'
import type { MasterScore } from '../engraving/dom/masterscore'
import type { NotationUndoStack } from '../notation/internal/notationundostack'

// Tags
export const WORK_TITLE_TAG = 'workTitle'
export const WORK_NUMBER_TAG = 'workNumber'
export const SUBTITLE_TAG = 'subtitle'
export const COMPOSER_TAG = 'composer'
export const ARRANGER_TAG = 'arranger'
export const LYRICIST_TAG = 'lyricist'
export const COPYRIGHT_TAG = 'copyright'
export const TRANSLATOR_TAG = 'translator'
export const MOVEMENT_TITLE_TAG = 'movementTitle'
export const MOVEMENT_NUMBER_TAG = 'movementNumber'
export const CREATION_DATE_TAG = 'creationDate'
export const PLATFORM_TAG = 'platform'

// Cloud-related tags
export const SOURCE_TAG = 'source'
export const SOURCE_REVISION_ID_TAG = 'sourceRevisionId'
export const AUDIO_COM_URL_TAG = 'audioComUrl'

const STANDARD_TAGS: ReadonlySet<string> = new Set([
    WORK_TITLE_TAG, WORK_NUMBER_TAG, SUBTITLE_TAG, COMPOSER_TAG, ARRANGER_TAG, LYRICIST_TAG, COPYRIGHT_TAG, TRANSLATOR_TAG,
    MOVEMENT_TITLE_TAG, MOVEMENT_NUMBER_TAG, CREATION_DATE_TAG, PLATFORM_TAG,
    SOURCE_TAG, SOURCE_REVISION_ID_TAG, AUDIO_COM_URL_TAG,
])

const PROJECT_META_TAGS: ReadonlySet<string> = new Set([
    WORK_TITLE_TAG, SUBTITLE_TAG, COMPOSER_TAG, ARRANGER_TAG, LYRICIST_TAG, COPYRIGHT_TAG, TRANSLATOR_TAG,
    CREATION_DATE_TAG, PLATFORM_TAG, SOURCE_TAG, AUDIO_COM_URL_TAG,
])

export function isStandardTag(tag: string): boolean {
    return STANDARD_TAGS.has(tag)
}

export function isRepresentedInProjectMeta(tag: string): boolean {
    return PROJECT_META_TAGS.has(tag)
}

export interface ProjectMeta {
    filePath: string
    title: string
    subtitle: string
    composer: string
    arranger: string
    lyricist: string
    translator: string
    copyright: string
    /** ISO date ("yyyy-MM-dd"), '' = invalid */
    creationDate: string
    partsCount: number
    source: string
    audioComUrl: string
    platform: string
    musescoreVersion: string
    musescoreRevision: number
    mscVersion: number
    additionalTags: Map<string, string>
}

// ---- QDate (ISO <-> Qt::TextDate, C locale) ----

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isValidDate(y: number, m: number, d: number): boolean {
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** QDate::fromString(s, Qt::ISODate).toString() (Qt::TextDate, e.g. "Fri Oct 23 2026"); '' for an invalid date */
export function isoDateToText(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
    if (!m || !isValidDate(+m[1], +m[2], +m[3])) {
        return ''
    }
    const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    return `${DAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} ${date.getUTCFullYear()}`
}

/** QDate::fromString(s) (Qt::TextDate).toString(Qt::ISODate); '' for an invalid date */
export function textDateToIso(text: string): string {
    const m = /^\s*(\w{3})\s+(\w{3})\s+(\d{1,2})\s+(-?\d+)\s*$/.exec(text)
    if (!m) {
        return ''
    }
    const month = MONTHS.indexOf(m[2]) + 1
    const day = +m[3]
    const year = +m[4]
    if (month === 0 || !DAYS.includes(m[1]) || !isValidDate(year, month, day)) {
        return ''
    }
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** NotationProject::metaInfo (filePath: the path or name the app shows) */
export function projectMetaInfo(score: MasterScore, filePath = ''): ProjectMeta {
    const allTags = score.metaTags()
    const tag = (name: string): string => allTags.get(name) ?? '' // C++ logs a warning for a missing tag

    const iso = allTags.get(CREATION_DATE_TAG)
    const meta: ProjectMeta = {
        filePath,
        title: tag(WORK_TITLE_TAG),
        subtitle: tag(SUBTITLE_TAG),
        composer: tag(COMPOSER_TAG),
        arranger: tag(ARRANGER_TAG),
        lyricist: tag(LYRICIST_TAG),
        translator: tag(TRANSLATOR_TAG),
        copyright: tag(COPYRIGHT_TAG),
        creationDate: iso !== undefined && isoDateToText(iso) ? iso.trim() : '',
        partsCount: score.excerpts().length,
        source: tag(SOURCE_TAG),
        audioComUrl: tag(AUDIO_COM_URL_TAG),
        platform: tag(PLATFORM_TAG),
        musescoreVersion: score.mscoreVersion(),
        musescoreRevision: score.mscoreRevision(),
        mscVersion: score.mscVersion(),
        additionalTags: new Map(),
    }

    for (const [t, value] of allTags) {
        if (isRepresentedInProjectMeta(t)) {
            continue
        }

        meta.additionalTags.set(t, value)
    }

    return meta
}

function metaEquals(a: ProjectMeta, b: ProjectMeta): boolean {
    for (const k of Object.keys(a) as (keyof ProjectMeta)[]) {
        if (k === 'additionalTags') {
            if (a.additionalTags.size !== b.additionalTags.size
                || [...a.additionalTags].some(([t, v]) => b.additionalTags.get(t) !== v)) {
                return false
            }
        } else if (a[k] !== b[k]) {
            return false
        }
    }
    return true
}

/** NotationProject::setMetaInfo (undoable: one command "Edit project properties") */
export function setProjectMetaInfo(score: MasterScore, meta: ProjectMeta, undoStack: NotationUndoStack | null): void {
    if (metaEquals(meta, projectMetaInfo(score, meta.filePath))) {
        return
    }

    const tags = new Map<string, string>([
        [WORK_TITLE_TAG, meta.title],
        [SUBTITLE_TAG, meta.subtitle],
        [COMPOSER_TAG, meta.composer],
        [ARRANGER_TAG, meta.arranger],
        [LYRICIST_TAG, meta.lyricist],
        [TRANSLATOR_TAG, meta.translator],
        [COPYRIGHT_TAG, meta.copyright],
        [CREATION_DATE_TAG, meta.creationDate],
        [SOURCE_TAG, meta.source],
        [AUDIO_COM_URL_TAG, meta.audioComUrl],
        [PLATFORM_TAG, meta.platform],
    ])

    for (const [t, value] of meta.additionalTags) {
        tags.set(t, value)
    }

    if (undoStack) {
        undoStack.prepareChanges(new TranslatableString('undoableAction', 'Edit project properties'))
        score.undo(new ChangeMetaTags(score, tags))
        undoStack.commitChanges()
    } else {
        score.setMetaTags(tags)
    }
}

export interface ProjectProperty {
    /** the tag; '' for a property added in the dialog */
    key: string
    name: string
    value: string
    isStandardProperty: boolean
    isMultiLineEdit: boolean
}

export class ProjectPropertiesModel {
    private m_projectMetaInfo: ProjectMeta
    private m_properties: ProjectProperty[] = []

    constructor(private m_score: MasterScore, private m_undoStack: NotationUndoStack | null, filePath = '') {
        this.m_projectMetaInfo = projectMetaInfo(m_score, filePath)
    }

    load(): void {
        const meta = this.m_projectMetaInfo
        const additionalProperties = meta.additionalTags
        const std = (key: string, name: string, value: string, isMultiLineEdit = false): ProjectProperty =>
            ({ key, name: qtrc('project', name), value, isStandardProperty: true, isMultiLineEdit })

        this.m_properties = [
            std(WORK_TITLE_TAG, 'Work title', meta.title),
            std(SUBTITLE_TAG, 'Subtitle', meta.subtitle),
            std(COMPOSER_TAG, 'Composer', meta.composer),
            std(ARRANGER_TAG, 'Arranger', meta.arranger),
            std(LYRICIST_TAG, 'Lyricist', meta.lyricist),
            std(TRANSLATOR_TAG, 'Translator', meta.translator),
            std(COPYRIGHT_TAG, 'Copyright', meta.copyright, /*isMultiLineEdit*/ true),
            std(WORK_NUMBER_TAG, 'Work number', additionalProperties.get(WORK_NUMBER_TAG) ?? ''),
            std(MOVEMENT_TITLE_TAG, 'Movement title', additionalProperties.get(MOVEMENT_TITLE_TAG) ?? ''),
            std(MOVEMENT_NUMBER_TAG, 'Movement number', additionalProperties.get(MOVEMENT_NUMBER_TAG) ?? ''),
            std(CREATION_DATE_TAG, 'Creation date', isoDateToText(meta.creationDate)),
            std(PLATFORM_TAG, 'Platform', meta.platform),
            std(SOURCE_TAG, 'Source', meta.source),
            std(AUDIO_COM_URL_TAG, 'Audio.com URL', meta.audioComUrl),
        ]

        // (QVariantMap::keys() is sorted)
        for (const propertyName of [...additionalProperties.keys()].sort()) {
            if (!isStandardTag(propertyName)) {
                this.m_properties.push({
                    key: '', name: propertyName, value: additionalProperties.get(propertyName)!,
                    isStandardProperty: false, isMultiLineEdit: false,
                })
            }
        }
    }

    properties(): readonly ProjectProperty[] { return this.m_properties }

    setPropertyName(index: number, name: string): void {
        if (this.m_properties[index]) {
            this.m_properties[index] = { ...this.m_properties[index], name }
        }
    }

    setPropertyValue(index: number, value: string): void {
        if (this.m_properties[index]) {
            this.m_properties[index] = { ...this.m_properties[index], value }
        }
    }

    filePath(): string { return this.m_projectMetaInfo.filePath }
    version(): string { return this.m_projectMetaInfo.musescoreVersion }

    revision(): string {
        const rev = this.m_projectMetaInfo.musescoreRevision
        // MuseScore 1.3 is decimal 5702, 2.0 and later uses a 7-digit hex SHA
        return rev > 99999 ? rev.toString(16) : rev.toString(10)
    }

    apiLevel(): string { return String(this.m_projectMetaInfo.mscVersion) }

    /** returns the index of the new property (C++ propertyAdded) */
    newProperty(): number {
        this.m_properties.push({ key: '', name: '', value: '', isStandardProperty: false, isMultiLineEdit: false })
        return this.m_properties.length - 1
    }

    deleteProperty(index: number): void {
        if (index < 0 || index >= this.m_properties.length) {
            return
        }
        this.m_properties.splice(index, 1)
    }

    saveProperties(): void {
        const meta = projectMetaInfo(this.m_score, this.m_projectMetaInfo.filePath)
        meta.additionalTags = new Map()

        for (const property of this.m_properties) {
            switch (property.key) {
            case WORK_TITLE_TAG: meta.title = property.value; break
            case SUBTITLE_TAG: meta.subtitle = property.value; break
            case COMPOSER_TAG: meta.composer = property.value; break
            case ARRANGER_TAG: meta.arranger = property.value; break
            case LYRICIST_TAG: meta.lyricist = property.value; break
            case TRANSLATOR_TAG: meta.translator = property.value; break
            case COPYRIGHT_TAG: meta.copyright = property.value; break
            case CREATION_DATE_TAG: meta.creationDate = textDateToIso(property.value); break
            case SOURCE_TAG: meta.source = property.value; break
            case AUDIO_COM_URL_TAG: meta.audioComUrl = property.value; break
            case PLATFORM_TAG: meta.platform = property.value; break
            default:
                if (property.key) {
                    meta.additionalTags.set(property.key, property.value)
                } else if (property.name && property.value) {
                    meta.additionalTags.set(property.name, property.value)
                }
            }
        }

        setProjectMetaInfo(this.m_score, meta, this.m_undoStack)
    }
}
