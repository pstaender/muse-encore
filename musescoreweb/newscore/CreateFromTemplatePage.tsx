/*
 * SPDX-License-Identifier: GPL-3.0-only
 * "Create from template" (MuseScore's CreateFromTemplatePage.qml): categories, templates and a preview of the
 * template (TemplatePaintView draws the template score itself).
 */
import { useEffect, useRef, useState } from 'react'
import { drawPage, layoutScore, loadTemplate as loadTemplateScore, pageCount, pageSize, type MasterScore } from '../../src/index'
import { qtrc, useLanguage } from '../i18n'
import { fontsReady } from '../scoreview'
import { loadTemplate, templateCategories, type TemplateInfo } from '../templates'

const previews = new Map<string, Promise<MasterScore>>()

function templateScore(path: string): Promise<MasterScore> {
    let p = previews.get(path)
    if (!p) {
        p = Promise.all([loadTemplate(path), fontsReady]).then(([t]) => {
            const s = loadTemplateScore(t.mscx, t.style)
            layoutScore(s)
            return s
        })
        previews.set(path, p)
    }
    return p
}

function TemplatePreview({ template }: { template: TemplateInfo }): React.JSX.Element {
    const box = useRef<HTMLDivElement>(null)
    const [state, setState] = useState<{ score: MasterScore | null; error: string | null }>({ score: null, error: null })
    const [width, setWidth] = useState(0)

    useEffect(() => {
        let cancelled = false
        setState({ score: null, error: null })
        templateScore(template.path).then(
            score => !cancelled && setState({ score, error: null }),
            (e: Error) => !cancelled && setState({ score: null, error: e.message }),
        )
        return () => { cancelled = true }
    }, [template.path])

    useEffect(() => {
        const el = box.current
        if (!el) {
            return
        }
        const ro = new ResizeObserver(() => setWidth(el.clientWidth))
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const pages = state.score ? pageCount(state.score) : 0
    return (
        <div className="template-preview" ref={box} aria-label={qtrc('project/template', template.title)} role="img">
            {state.error && <p className="muted">Could not show the template: {state.error}</p>}
            {state.score && width > 0 && Array.from({ length: pages }, (_, i) => (
                <PreviewPage key={i} score={state.score!} idx={i} width={width - 32} />
            ))}
            {!state.score && !state.error && <div className="spinner small" aria-hidden="true" />}
        </div>
    )
}

function PreviewPage({ score, idx, width }: { score: MasterScore; idx: number; width: number }): React.JSX.Element {
    const ref = useRef<HTMLCanvasElement>(null)
    const size = pageSize(score, idx)
    const cssDpi = Math.max(1, width) / size.width
    useEffect(() => {
        const c = ref.current
        if (!c) {
            return
        }
        const dpi = cssDpi * window.devicePixelRatio
        c.width = Math.round(size.width * dpi)
        c.height = Math.round(size.height * dpi)
        drawPage(score, idx, c.getContext('2d')!, { dpi })
    }, [score, idx, cssDpi, size.width, size.height])
    return <canvas ref={ref} className="preview-page" style={{ width: size.width * cssDpi, height: size.height * cssDpi }} />
}

export function CreateFromTemplatePage({ template, setTemplate }: {
    template: TemplateInfo | null
    setTemplate: (t: TemplateInfo) => void
}): React.JSX.Element {
    useLanguage()
    const [category, setCategory] = useState(() => template?.category ?? templateCategories[0]?.title ?? '')
    const templates = templateCategories.find(c => c.title === category)?.templates ?? []

    useEffect(() => {
        if (!template && templates.length) {
            setTemplate(templates[0])
        }
    }, [template, templates, setTemplate])

    const keyActivate = (fn: () => void) => (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fn()
        }
    }

    return (
        <div className="choose-template">
            <section className="column" aria-labelledby="category-title">
                <h3 id="category-title">{qtrc('project/newscore', 'Category')}</h3>
                <ul className="list" role="listbox" aria-label={qtrc('project/newscore', 'Category')}>
                    {templateCategories.map(c => {
                        const select = (): void => {
                            setCategory(c.title)
                            setTemplate(c.templates[0])
                        }
                        return (
                            <li key={c.title} role="option" aria-selected={c.title === category} tabIndex={0}
                                onClick={select} onKeyDown={keyActivate(select)}>{qtrc('project/templatecategory', c.title)}</li>
                        )
                    })}
                </ul>
            </section>
            <section className="column" aria-labelledby="template-title">
                <h3 id="template-title">{qtrc('project/newscore', 'Template')}</h3>
                <ul className="list" role="listbox" aria-label={qtrc('project/newscore', 'Template')}>
                    {templates.map(t => (
                        <li key={t.path} role="option" aria-selected={t.path === template?.path} tabIndex={0}
                            onClick={() => setTemplate(t)} onKeyDown={keyActivate(() => setTemplate(t))}>{qtrc('project/template', t.title)}</li>
                    ))}
                </ul>
            </section>
            <section className="column preview-column" aria-label={qtrc('project/newscore', 'Preview')}>
                {template && <TemplatePreview template={template} />}
            </section>
        </div>
    )
}
