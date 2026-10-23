/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The menu bar (port of MuseScore's AppMenuModel, src/appshell/qml/MuseScore/AppShell/appmenumodel.cpp).
 * Left out: everything about playback, sounds, the mixer and MIDI, plugins, online services (cloud, publishing,
 * audio/PDF import), updates, diagnostics and workspaces. Items whose action has no handler yet are disabled.
 */
import type { TrString } from '../actions/uiactiondata'

export type MenuItem =
    | { kind: 'action'; code: string; title?: TrString; args?: readonly string[] }
    | { kind: 'menu'; id: string; title: TrString; items: MenuItem[] | (() => MenuItem[]) }
    | { kind: 'separator' }

const item = (code: string, title?: TrString): MenuItem => ({ kind: 'action', code, title })
const menu = (title: TrString, items: MenuItem[] | (() => MenuItem[]), id = ''): MenuItem => ({ kind: 'menu', id, title, items })
const sep: MenuItem = { kind: 'separator' }

/** the recent scores (set by the app: RecentFilesController) */
let recentScores: () => MenuItem[] = () => []

export function setRecentScoresProvider(fn: () => MenuItem[]): void {
    recentScores = fn
}

function makeFileMenu(): MenuItem {
    return menu(['appshell/menu/file', '&File'], [
        item('file-new'),
        item('file-open'),
        menu(['appshell/menu/file', 'Open &recent'], () => {
            const recent = recentScores()
            return recent.length ? [...recent, sep, item('clear-recent')] : []
        }, 'menu-file-open'),
        item('file-close'),
        sep,
        item('file-save'),
        item('file-save-as'),
        menu(['appshell/menu/file', 'Save o&ther'], [
            item('file-save-a-copy'),
            item('file-save-selection'),
        ]),
        sep,
        item('file-export'),
        sep,
        item('project-properties'),
        item('parts', ['action', 'Parts…']),
        sep,
        item('print'),
    ], 'menu-file')
}

function makeEditMenu(): MenuItem {
    return menu(['appshell/menu/edit', '&Edit'], [
        item('action://notation/undo'),
        item('action://notation/redo'),
        item('toggle-undo-history-panel'),
        sep,
        item('action://notation/cut'),
        item('action://notation/copy'),
        item('action://notation/paste'),
        item('notation-paste-half'),
        item('notation-paste-double'),
        item('notation-swap'),
        item('action://notation/delete'),
        sep,
        item('notation-select-all'),
        item('notation-select-section'),
        item('find'),
        sep,
        item('preference-dialog'),
    ], 'menu-edit')
}

function makeViewMenu(toolbarItems: () => MenuItem[]): MenuItem {
    return menu(['appshell/menu/view', '&View'], [
        item('fullscreen'),
        item('toggle-palettes'),
        item('masterpalette'),
        item('toggle-instruments'),
        item('inspector'),
        item('toggle-selection-filter'),
        item('toggle-undo-history-panel'),
        item('toggle-navigator'),
        item('toggle-braille-panel'),
        item('toggle-timeline'),
        item('toggle-piano-keyboard'),
        item('toggle-percussion-panel'),
        sep,
        menu(['appshell/menu/view', '&Toolbars'], toolbarItems, 'menu-toolbars'),
        sep,
        menu(['appshell/menu/view', '&Show'], [
            item('show-invisible'),
            item('show-unprintable'),
            item('show-frames'),
            item('show-pageborders'),
            item('show-irregular'),
        ], 'menu-show'),
        // not in MuseScore's View menu (its status bar has the view modes)
        menu([null, 'View mode'], [
            item('view-mode-page'),
            item('view-mode-continuous'),
            item('view-mode-single'),
            item('view-mode-fit-width'),
        ], 'menu-view-mode'),
        sep,
        item('dock-restore-default-layout'),
    ], 'menu-view')
}

function makeAddMenu(): MenuItem {
    return menu(['appshell/menu/add', '&Add'], [
        menu(['appshell/menu/add', '&Notes'], [
            item('note-input'),
            sep,
            ...['c', 'd', 'e', 'f', 'g', 'a', 'b'].map(n => item(`note-${n}`)),
            sep,
            ...['c', 'd', 'e', 'f', 'g', 'a', 'b'].map(n => item(`chord-${n}`)),
        ], 'menu-notes'),
        menu(['appshell/menu/add', '&Intervals'], [
            ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => item(`interval${i}`)),
            sep,
            ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => item(`interval-${i}`)),
        ], 'menu-intervals'),
        menu(['appshell/menu/add', 'T&uplets'], [
            ...['duplet', 'triplet', 'quadruplet', 'quintuplet', 'sextuplet', 'septuplet', 'octuplet', 'nonuplet', 'tuplet-dialog'].map(c => item(c)),
        ], 'menu-tuplets'),
        sep,
        menu(['appshell/menu/add', '&Measures'], [
            item('insert-measure', ['notation', '&Insert one measure before selection']),
            item('append-measure', ['notation', 'Insert &one measure at end of score']),
            sep,
            item('insert-measures', ['notation', 'Insert &before selection…']),
            item('insert-measures-after-selection', ['notation', 'Insert &after selection…']),
            sep,
            item('insert-measures-at-start-of-score', ['notation', 'Insert at &start of score…']),
            item('append-measures', ['notation', 'Insert at &end of score…']),
        ], 'menu-measures'),
        menu(['appshell/menu/add', '&Frames'], [
            item('insert-hbox'),
            item('insert-vbox'),
            item('insert-textframe'),
            item('insert-fretframe'),
            sep,
            menu(['notation', 'Insert at end of score'], [
                item('append-hbox'),
                item('append-vbox'),
                item('append-textframe'),
                item('append-fretframe'),
            ]),
        ], 'menu-frames'),
        menu(['appshell/menu/add', '&Text'], [
            ...['title-text', 'subtitle-text', 'composer-text', 'poet-text', 'part-text'].map(c => item(c)),
            sep,
            ...['system-text', 'staff-text', 'add-dynamic', 'expression-text', 'rehearsalmark-text', 'instrument-change-text',
                'fingering-text'].map(c => item(c)),
            sep,
            ...['sticking-text', 'chord-text', 'roman-numeral-text', 'nashville-number-text', 'lyrics', 'figured-bass',
                'tempo'].map(c => item(c)),
        ], 'menu-text'),
        menu(['appshell/menu/add', '&Lines'], [
            ...['add-slur', 'add-hairpin', 'add-hairpin-reverse', 'add-8va', 'add-8vb', 'add-noteline'].map(c => item(c)),
        ], 'menu-lines'),
        menu(['appshell/menu/add', '&Chords and fretboard diagrams'], [
            item('chord-text'),
            item('add-fretboard-diagram'),
            sep,
            item('insert-fretframe', ['appshell/menu/add/chordandfret', 'Fretboard diagram legend']),
        ], 'menu-chord-and-frets'),
    ], 'menu-add')
}

function makeFormatMenu(): MenuItem {
    return menu(['appshell/menu/format', 'F&ormat'], [
        item('edit-style'),
        item('page-settings'),
        sep,
        item('measures-per-system'),
        menu(['appshell/menu/format', 'Str&etch'], [
            item('stretch+'),
            item('stretch-'),
            item('reset-stretch'),
        ], 'menu-stretch'),
        sep,
        item('reset-text-style-overrides'),
        item('reset-beammode'),
        item('reset'),
        item('reset-to-default-layout'),
        sep,
        item('load-style'),
        item('save-style'),
    ], 'menu-format')
}

function makeToolsMenu(): MenuItem {
    return menu(['appshell/menu/tools', '&Tools'], [
        item('transpose'),
        sep,
        item('explode'),
        item('implode'),
        item('realize-chord-symbols'),
        menu(['appshell/menu/tools', '&Voices'], ['voice-x12', 'voice-x13', 'voice-x14', 'voice-x23', 'voice-x24', 'voice-x34'].map(c => item(c)), 'menu-voices'),
        menu(['appshell/menu/tools', '&Measures'], [item('split-measure'), item('join-measures')], 'menu-tools-measures'),
        item('time-delete'),
        sep,
        item('slash-fill'),
        item('slash-rhythm'),
        sep,
        item('pitch-spell-sharps'),
        item('pitch-spell-flats'),
        menu(['appshell/menu/tools', 'Enharmonic spelling'], [item('enh-both'), item('enh-current'), item('pitch-spell')], 'menu-enharmonic-spelling'),
        sep,
        item('reset-groupings'),
        item('resequence-rehearsal-marks'),
        sep,
        item('copy-lyrics-to-clipboard'),
        item('del-empty-measures'),
    ], 'menu-tools')
}

function makeHelpMenu(): MenuItem {
    return menu(['appshell/menu/help', '&Help'], [
        item('online-handbook'),
        item('ask-help'),
        sep,
        item('about-musescore'),
        item('about-musicxml'),
        item('accessibility-statement'),
        sep,
        item('revert-factory'),
    ], 'menu-help')
}

/** AppMenuModel::load (without the Plugins menu) */
export function appMenu(toolbarItems: () => MenuItem[]): MenuItem[] {
    return [makeFileMenu(), makeEditMenu(), makeViewMenu(toolbarItems), makeAddMenu(), makeFormatMenu(), makeToolsMenu(), makeHelpMenu()]
}
