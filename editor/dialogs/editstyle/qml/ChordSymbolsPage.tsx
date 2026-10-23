/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's ChordSymbolsPage.qml (Style dialog, Chord symbols page).
 */
import { useRef } from 'react'
import { ChordSymbolsPageModel, type StyleItem } from '../../../../src/index'
import { qtrc } from '../../../i18n'
import type { QmlPageProps } from '../qmlpages'
import {
    CheckBox, Column, ComboBoxDropdown, FlatButton, FlatRadioButtons, GroupBox, IconAndTextButtonSelector, Label, Row, RoundedRadioButton,
    SpinBox, StyleToggle, TextField, useStyleModel,
} from './controls'

const tr = (s: string): string => qtrc('notation/editstyle/chordsymbols', s)
const toggle = (item: StyleItem): void => item.modifyValue(!item.value())

function resetStyles(styles: readonly StyleItem[]): void {
    for (const styleItem of styles) {
        styleItem.modifyValue(styleItem.defaultValue())
    }
}

function isResetEnabled(styles: readonly StyleItem[]): boolean {
    return styles.some(s => !s.isDefault())
}

function ResetButton({ styles }: { styles: readonly StyleItem[] }): React.JSX.Element {
    return <FlatButton icon="UNDO" title={qtrc('global', 'Reset')} enabled={isResetEnabled(styles)} onClick={() => resetStyles(styles)} />
}

/** a percentage IncrementalPropertyControl of a factor style */
function PercentSpinBox({ styleItem, min, label }: { styleItem: StyleItem; min: number; label: string }): React.JSX.Element {
    return (
        <SpinBox width={80} value={Math.round(Number(styleItem.value()) * 100)} min={min} max={999} step={1} decimals={0} unit="%"
            label={label} onEdited={(v) => styleItem.modifyValue(v / 100)} />
    )
}

function SpSpinBox({ styleItem, step, label }: { styleItem: StyleItem; step: number; label: string }): React.JSX.Element {
    return (
        <SpinBox width={80} value={Number(styleItem.value())} min={0} max={99} step={step} decimals={2} unit={qtrc('global', 'sp')}
            label={label} onEdited={(v) => styleItem.modifyValue(v)} />
    )
}

export function ChordSymbolsPage({ style, goToTextStylePage }: QmlPageProps): React.JSX.Element {
    const m = useStyleModel(style, s => new ChordSymbolsPageModel(s))
    const fileInput = useRef<HTMLInputElement>(null)

    const extensionStyles = [m.extensionMag(), m.extensionAdjust()]
    const modifierStyles = [m.modifierMag(), m.modifierAdjust(), m.verticallyStackModifiers()]
    const bassStyles = [m.chordBassNoteStagger(), m.chordBassNoteScale()]
    const polychordStyles = [m.polychordDividerThickness(), m.polychordDividerSpacing()]
    const alignmentStyles = [m.verticallyAlignChordSymbols(), m.chordAlignmentToNotehead(), m.chordAlignmentToFretboard(),
        m.chordAlignmentExcludeModifiers()]
    const capitalizationStyles = [m.automaticCapitalization(), m.lowerCaseMinorChords(), m.lowerCaseBassNotes(), m.allCapsNoteNames()]
    const positioningStyles = [m.harmonyFretDist(), m.minHarmonyDist()]
    const playbackStyles = [m.harmonyVoiceLiteral(), m.harmonyVoicing(), m.harmonyDuration()]
    const capoStyles = [m.displayCapoChords(), m.capoPosition()]

    const autoCaps = m.automaticCapitalization().value() === true
    const spelling = m.chordSymbolSpelling().value()

    return (
        <Column spacing={12}>
            <GroupBox title={tr('Preset')} minWidth={500}>
                <div style={{ minWidth: 192 }}>
                    <ComboBoxDropdown styleItem={m.chordStylePreset()} model={m.possiblePresetOptions()} label={tr('Preset')}
                        onHandleItem={(value) => m.setChordStyle(Number(value))} />
                </div>
                {m.isCustomXml() && (
                    <Row spacing={8}>
                        <TextField value={String(m.chordDescriptionFile().value() ?? '')} enabled={false} onEdited={() => {}} />
                        <FlatButton icon="OPEN_FILE" title={qtrc('notation', 'Load style')} onClick={() => fileInput.current?.click()} />
                        <input ref={fileInput} type="file" accept=".xml" hidden onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file) {
                                void file.text().then(content => m.selectChordDescriptionFile(file.name, content))
                            }
                        }} />
                    </Row>
                )}
            </GroupBox>
            <GroupBox title={tr('Appearance')} minWidth={500}>
                <div>
                    <FlatButton text={qtrc('notation', 'Edit chord symbol text style')} onClick={() => goToTextStylePage('chord-symbols')} />
                </div>
                <GroupBox title={tr('Spelling')}>
                    <Row spacing={12}>
                        {m.possibleChordSymbolSpellings().map(o => (
                            <RoundedRadioButton key={o.value} text={o.text} checked={o.value === spelling}
                                onToggled={() => m.chordSymbolSpelling().modifyValue(o.value)} />
                        ))}
                        <ResetButton styles={[m.chordSymbolSpelling()]} />
                    </Row>
                </GroupBox>
                <GroupBox title={tr('Capitalization')}>
                    <Row spacing={8}>
                        <StyleToggle styleItem={m.automaticCapitalization()} text={tr('Automatically capitalize note names')} />
                        <ResetButton styles={capitalizationStyles} />
                    </Row>
                    <Column spacing={8}>
                        <CheckBox text={tr('Lowercase minor chords')} enabled={autoCaps} checked={m.lowerCaseMinorChords().value() === true}
                            onClicked={() => toggle(m.lowerCaseMinorChords())} />
                        <CheckBox text={tr('Lowercase bass notes')} enabled={autoCaps} checked={m.lowerCaseBassNotes().value() === true}
                            onClicked={() => toggle(m.lowerCaseBassNotes())} />
                        <CheckBox text={tr('All caps (for Solfeggio and French)')} enabled={autoCaps && (spelling === 3 || spelling === 4)}
                            checked={m.allCapsNoteNames().value() === true} onClicked={() => toggle(m.allCapsNoteNames())} />
                    </Column>
                </GroupBox>
                <GroupBox title={tr('Extensions (e.g. 7, 11)')}>
                    <Row spacing={6}>
                        <Label text={qtrc('notation', 'Scale:')} />
                        <PercentSpinBox styleItem={m.extensionMag()} min={0} label={qtrc('notation', 'Scale:')} />
                        <ResetButton styles={extensionStyles} />
                    </Row>
                    <Row spacing={6}>
                        <Label text={qtrc('notation', 'Vertical offset:')} />
                        <PercentSpinBox styleItem={m.extensionAdjust()} min={-999} label={qtrc('notation', 'Vertical offset:')} />
                    </Row>
                </GroupBox>
                <GroupBox title={tr('Modifiers (e.g. sus4, no 3)')}>
                    <Row spacing={6}>
                        <Label text={qtrc('notation', 'Scale:')} />
                        <PercentSpinBox styleItem={m.modifierMag()} min={0} label={qtrc('notation', 'Scale:')} />
                        <ResetButton styles={modifierStyles} />
                    </Row>
                    <Row spacing={6}>
                        <Label text={qtrc('notation', 'Vertical offset:')} />
                        <PercentSpinBox styleItem={m.modifierAdjust()} min={-999} label={qtrc('notation', 'Vertical offset:')} />
                    </Row>
                    <CheckBox text={tr('Vertically stack modifiers')} checked={m.verticallyStackModifiers().value() === true}
                        onClicked={() => toggle(m.verticallyStackModifiers())} />
                </GroupBox>
                <GroupBox title={tr('Altered bass notes (e.g. A7/G)')}>
                    <Row spacing={6}>
                        <Label text={qtrc('notation', 'Style:')} />
                        <FlatRadioButtons buttonWidth={48} buttonHeight={48} iconSize={16} enabled={!m.isLegacyXml()}
                            value={m.chordBassNoteStagger().value()} onToggled={(v) => m.chordBassNoteStagger().modifyValue(v)} model={[
                                { iconCode: 'CHORD_BASS_ALIGN', value: false },
                                { iconCode: 'CHORD_BASS_OFFSET', value: true },
                            ]} />
                        <ResetButton styles={bassStyles} />
                    </Row>
                    <Row spacing={6}>
                        <Label text={qtrc('notation', 'Bass note scale:')} />
                        <PercentSpinBox styleItem={m.chordBassNoteScale()} min={0} label={qtrc('notation', 'Bass note scale:')} />
                    </Row>
                </GroupBox>
                <GroupBox title={tr('Polychords (e.g. C|F♯)')}>
                    <Row spacing={6}>
                        <Label text={qtrc('notation', 'Divider thickness:')} />
                        <SpSpinBox styleItem={m.polychordDividerThickness()} step={0.01} label={qtrc('notation', 'Divider thickness:')} />
                        <ResetButton styles={polychordStyles} />
                    </Row>
                    <Row spacing={6}>
                        <Label text={qtrc('notation', 'Divider spacing:')} />
                        <SpSpinBox styleItem={m.polychordDividerSpacing()} step={0.01} label={qtrc('notation', 'Divider spacing:')} />
                    </Row>
                </GroupBox>
                <CheckBox text={tr('Use SMuFL symbols')} checked={m.useSmuflSymbols().value() === true}
                    onClicked={() => toggle(m.useSmuflSymbols())} />
            </GroupBox>
            <GroupBox title={tr('Alignment')} minWidth={500}>
                <Row spacing={6}>
                    <CheckBox text={tr('Vertically align chord symbols and fretboard diagrams on the same system')}
                        checked={m.verticallyAlignChordSymbols().value() === true} onClicked={() => toggle(m.verticallyAlignChordSymbols())} />
                    <ResetButton styles={alignmentStyles} />
                </Row>
                <IconAndTextButtonSelector styleItem={m.chordAlignmentToNotehead()} label={qtrc('notation', 'Alignment to notehead:')}
                    controlAreaWidth={98} buttonHeight={30} hasReset={false} model={[
                        { iconCode: 'NOTE_ALIGN_LEFT', iconSize: 16, value: 0 },
                        { iconCode: 'NOTE_ALIGN_CENTER', iconSize: 16, value: 2 },
                        { iconCode: 'NOTE_ALIGN_RIGHT', iconSize: 16, value: 1 },
                    ]} />
                <IconAndTextButtonSelector styleItem={m.chordAlignmentToFretboard()} label={qtrc('notation', 'Alignment to fretboard diagram:')}
                    controlAreaWidth={98} buttonHeight={30} hasReset={false} model={[
                        { iconCode: 'ALIGN_LEFT', iconSize: 16, value: 0 },
                        { iconCode: 'ALIGN_HORIZONTAL_CENTER', iconSize: 16, value: 2 },
                        { iconCode: 'ALIGN_RIGHT', iconSize: 16, value: 1 },
                    ]} />
                <CheckBox text={tr('Exclude modifiers from horizontal alignment')} checked={m.chordAlignmentExcludeModifiers().value() === true}
                    onClicked={() => toggle(m.chordAlignmentExcludeModifiers())} />
            </GroupBox>
            <GroupBox title={tr('Positioning')} minWidth={500}>
                <Row spacing={6}>
                    <Label text={qtrc('notation', 'Min. space to fretboard diagram:')} />
                    <SpSpinBox styleItem={m.harmonyFretDist()} step={0.05} label={qtrc('notation', 'Min. space to fretboard diagram:')} />
                    <ResetButton styles={positioningStyles} />
                </Row>
                <Row spacing={6}>
                    <Label text={qtrc('notation', 'Min. space to other notation:')} />
                    <SpSpinBox styleItem={m.minHarmonyDist()} step={0.05} label={qtrc('notation', 'Min. space to other notation:')} />
                </Row>
                <Row spacing={6}>
                    <Label text={qtrc('notation', 'Min. space between chord symbols:')} />
                    <SpSpinBox styleItem={m.harmonyHarmonyDist()} step={0.05} label={qtrc('notation', 'Min. space between chord symbols:')} />
                </Row>
            </GroupBox>
            <GroupBox title={tr('Playback')} minWidth={500}>
                <div className="sd-grid" style={{ gridTemplateColumns: 'auto auto 1fr', columnGap: 6, rowGap: 12 }}>
                    <Label text={qtrc('notation', 'Interpretation:')} />
                    <ComboBoxDropdown styleItem={m.harmonyVoiceLiteral()} model={m.possibleHarmonyVoiceLiteralOptions()}
                        label={qtrc('notation', 'Interpretation:')} />
                    <div style={{ justifySelf: 'end' }}><ResetButton styles={playbackStyles} /></div>
                    <Label text={qtrc('notation', 'Voicing:')} />
                    <ComboBoxDropdown styleItem={m.harmonyVoicing()} model={m.possibleHarmonyVoicingOptions()} label={qtrc('notation', 'Voicing:')} />
                    <span />
                    <Label text={qtrc('notation', 'Duration:')} />
                    <ComboBoxDropdown styleItem={m.harmonyDuration()} model={m.possibleHarmonyDurationOptions()} label={qtrc('notation', 'Duration:')} />
                    <span />
                </div>
            </GroupBox>
            <GroupBox title={tr('Capo')} minWidth={500}>
                <Row spacing={6}>
                    <Column spacing={0}>
                        {m.possibleCapoDisplayOptions().map(o => (
                            <div key={o.value} style={{ height: 30, display: 'flex', alignItems: 'center' }}>
                                <RoundedRadioButton text={o.text} checked={o.value === m.displayCapoChords().value()}
                                    onToggled={() => m.displayCapoChords().modifyValue(o.value)} />
                            </div>
                        ))}
                    </Column>
                    <ResetButton styles={capoStyles} />
                </Row>
                <Row spacing={6} enabled={m.displayCapoChords().value() !== 0}>
                    <Label text={qtrc('notation', 'Capo fret position:')} />
                    <SpinBox value={Number(m.capoPosition().value())} min={0} max={11} step={1} decimals={0}
                        enabled={m.displayCapoChords().value() !== 0} label={qtrc('notation', 'Capo fret position:')}
                        onEdited={(v) => m.capoPosition().modifyValue(v)} />
                </Row>
            </GroupBox>
        </Column>
    )
}
