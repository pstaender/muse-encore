/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's score templates (share/templates of the MuseScore submodule, in the categories of categories.json,
 * like TemplatesRepository::templates). The files are bundled and loaded when needed.
 */
import categories from '../MuseScore/share/templates/categories.json'

const DIR = '../MuseScore/share/templates/'
const files = import.meta.glob<string>('../MuseScore/share/templates/**/*.mscx', { query: '?raw', import: 'default' })
// a template directory is read like a score container: its score_style.mss is the style of the template
const styles = import.meta.glob<string>('../MuseScore/share/templates/**/score_style.mss', { query: '?raw', import: 'default' })

export interface TemplateInfo {
    /** path relative to share/templates, e.g. "03-Chamber_Music/01-String_Quartet/01-String_Quartet.mscx" */
    path: string
    title: string
    category: string
}

/**
 * MuseScore shows the title text of the template, which is its file name without the number (e.g.
 * "02-SATB_+_Organ.mscx" -> "SATB + Organ"); the files are only read when one is selected.
 */
function titleFromPath(path: string): string {
    return path.split('/').pop()!.replace(/\.mscx$/, '').replace(/^\d+-/, '').replaceAll('_', ' ')
}

export const templateCategories: { title: string; templates: TemplateInfo[] }[] = categories
    .map(c => ({
        title: c.title,
        templates: c.files
            .filter(f => `${DIR}${f}` in files)
            .map(f => ({ path: f, title: titleFromPath(f), category: c.title })),
    }))
    .filter(c => c.templates.length)

/** the template file and its style (null if it has none) */
export async function loadTemplate(path: string): Promise<{ mscx: string; style: string | null }> {
    const load = files[`${DIR}${path}`]
    if (!load) {
        throw new Error(`no template ${path}`)
    }
    const style = styles[`${DIR}${path.replace(/[^/]*$/, '')}score_style.mss`]
    const [mscx, s] = await Promise.all([load(), style ? style() : null])
    return { mscx, style: s }
}
