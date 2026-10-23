/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The properties panel (port of src/inspector/qml/MuseScore/Inspector/InspectorForm.qml and
 * InspectorSectionDelegate.qml): the sections of the library's InspectorListModel for the selection of the score
 * (inspectorSections), each an expandable blank (ExpandableBlank / ExpandableBlankSection) with its view.
 * Keyboard: the section headers are buttons (Enter/Space expand or collapse), the controls are in tab order.
 */
import { useMemo, useState } from 'react'
import { inspectorSections, type InspectorModelInfo } from '../../../src/index'
import { useLanguage } from '../../i18n'
import type { MenuItem } from '../../menus/appmenu'
import { currentScore, useScoreView } from '../../scoreview'
import { canChangeProperties } from '../editbridge'
import { icon, InspectorContext, type ModelRef } from './common'
import { GeneralInspectorView } from './GeneralInspectorView'
import { NotationSection } from './NotationViews'
import { PartsSettings } from './PartsSettings'
import { MeasuresInspectorView, ScoreAppearanceInspectorView, ScoreDisplayInspectorView } from './ScoreSections'
import { TextInspectorView } from './TextInspectorView'
import './inspector.css'

/** the items of the tab's context menu before "Close" (none in MuseScore) */
export function inspectorPanelMenu(): MenuItem[] {
    return []
}

/** the collapsed sections (kept while the panel is closed, like the expanded state of MuseScore's delegates) */
const s_collapsed = new Set<string>()

function SectionView({ m }: { m: ModelRef }): React.JSX.Element | null {
    switch (m.model.sectionType) {
    case 'SECTION_GENERAL': return <GeneralInspectorView m={m} />
    case 'SECTION_MEASURES': return <MeasuresInspectorView m={m} />
    case 'SECTION_NOTATION': return <NotationSection m={m} />
    case 'SECTION_TEXT': return <TextInspectorView m={m} />
    case 'SECTION_SCORE_DISPLAY': return <ScoreDisplayInspectorView />
    case 'SECTION_SCORE_APPEARANCE': return <ScoreAppearanceInspectorView />
    case 'SECTION_PARTS': return <PartsSettings m={m} />
    default: return null
    }
}

/** InspectorSectionDelegate: ExpandableBlank with the section's view */
function Section({ model }: { model: InspectorModelInfo }): React.JSX.Element {
    const [expanded, setExpanded] = useState(!s_collapsed.has(model.sectionType))
    const toggle = (): void => {
        if (expanded) {
            s_collapsed.add(model.sectionType)
        } else {
            s_collapsed.delete(model.sectionType)
        }
        setExpanded(!expanded)
    }
    const contentId = `insp-section-${model.sectionType}`
    return (
        <section className="insp-section" data-section={model.sectionType} aria-label={model.title}>
            <button type="button" className="insp-section-header" aria-expanded={expanded} aria-controls={contentId} onClick={toggle}>
                <span className={`insp-arrow${expanded ? '' : ' collapsed'}`} aria-hidden="true">{icon('SMALL_ARROW_DOWN')}</span>
                <span className="insp-section-title">{model.title}</span>
            </button>
            {expanded && (
                <div id={contentId} className="insp-section-content">
                    <SectionView m={{ model, section: model.sectionType, path: [] }} />
                </div>
            )}
        </section>
    )
}

export function InspectorForm(): React.JSX.Element {
    const lang = useLanguage()
    const view = useScoreView()
    const score = view.hasScore ? currentScore() : null
    // the sections are read again when the selection or the score changes
    const sections = useMemo(() => inspectorSections(score), [score, view.selectionVersion, view.scoreVersion, lang])
    const canEdit = canChangeProperties(score)
    return (
        <InspectorContext.Provider value={{ score, canEdit }}>
            <div className={`inspector${canEdit ? '' : ' readonly'}`}>
                {sections.map(s => <Section key={s.sectionType} model={s} />)}
            </div>
        </InspectorContext.Provider>
    )
}
