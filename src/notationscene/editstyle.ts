/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the logic of src/notationscene/widgets/editstyle.h/.cpp (the Style dialog, without its QML parts) with
 * alignSelect, offsetSelect, fontStyleSelect and colorlabel.
 *
 * The widgets of editstyle.ui (editstyleui.ts, generated) are modelled as WidgetStates (value, check state, combo
 * items, enabled/visible ...) that the app renders. Like Qt widgets they emit signals when their value changes:
 * changes of the UI call the setters (setValue, setChecked, setCurrentIndex, ..., click), which run the slots
 * connected in the constructor like the C++ EditStyle constructor; setValues() writes the style into the widgets
 * with blocked signals. Deviations: the last shown page is kept per session (the app's configuration), the text
 * style font list are the fonts known to the fonts database (QFontComboBox: the system's fonts).
 * TODO(port): the voicing select widget (commented out in C++ too), "chordsXmlFile", "capoPosition"
 */

import { Color } from '../framework/draw/types/color'
import { PointF } from '../framework/draw/types/geometry'
import { qtrc } from '../framework/global/translation'
import { TranslatableString } from '../framework/global/types/translatablestring'
import { Spatium } from '../engraving/types/dimension'
import { P_TYPE, propertyValueEquals, type PropertyValue } from '../engraving/types/propertyvalue'
import {
    Align, AlignH, AlignV, CourtesyBarlineMode, DirectionV, DurationType, FontStyle, InstrumentLabelVisibility, LineType,
    LyricsDashSystemStart, PlacementV, TextStyleType,
} from '../engraving/types/types'
import { TConv } from '../engraving/types/typesconv'
import { SymId } from '../engraving/types/symid'
import { SymNames } from '../engraving/types/symnames'
import { Sid } from '../engraving/style/styledef'
import { MStyle } from '../engraving/style/style'
import { TextStylePropertyType, editableTextStyles, textStyle } from '../engraving/style/textstyle'
import { ArticulationStemSideAlign } from '../engraving/dom/articulation'
import { ParenthesizeTiedFret, ShowTiedFret } from '../engraving/dom/stafftype'
import { TupletBracketType, TupletNumberType } from '../engraving/dom/tuplet'
import { FrameType } from '../engraving/dom/textbase'
import { FiguredBass } from '../engraving/dom/figuredbass'
import { engravingFonts } from '../engraving/infrastructure/engravingfont'
import { fontsDatabase } from '../engraving/infrastructure/engravingcontext'
import { PAGE_LIST, PAGE_STACK, type UiString, type UiWidget } from './editstyleui'
import type { Score } from '../engraving/dom/score'
import type { NotationStyle } from '../notation/internal/notationstyle'
import type { NotationUndoStack } from '../notation/internal/notationundostack'

export const ALL_PAGE_CODES: readonly string[] = [
    'score',
    'spacing',
    'sizes',
    'header-and-footer',
    'measure-number',
    'system',
    'clefs-key-and-time-signatures',
    'accidentals',
    'barlines',
    'notes',
    'rests',
    'repeats',
    'beams',
    'tuplets',
    'arpeggios',
    'chord-brackets',
    'slurs-and-ties',
    'dynamics-hairpins',
    'volta',
    'ottava',
    'pedal',
    'trill',
    'vibrato',
    'glissando-note-line',
    'bend',
    'text-line',
    'system-text-line',
    'articulations-and-ornaments',
    'hammer-ons-pull-offs-and-tapping',
    'fermatas',
    'staff-text',
    'tempo-text',
    'lyrics',
    'expression',
    'rehearsal-marks',
    'figured-bass',
    'chord-symbols',
    'fretboard-diagrams',
    'tablature-styles',
    'text-styles',
]

export const ALL_TEXT_STYLE_SUBPAGE_CODES: readonly string[] = [
    'title',
    'subtitle',
    'composer',
    'poet',
    'translator',
    'frame',
    'instrument-name-part',
    'instrument-name-long',
    'instrument-name-short',
    'instrument-change',
    'header',
    'footer',
    'copyright',
    'page-number',
    'measure-number',
    'measure-number-alternate',
    'multimeasure-rest-range',
    'tempo',
    'tempo-change',
    'metronome',
    'repeat-play-count',
    'repeat-text-left',
    'repeat-text-right',
    'rehearsal-mark',
    'system',
    'staff',
    'expression',
    'hairpin',
    'lyrics-odd-lines',
    'lyrics-even-lines',
    'chord-symbols',
    'chord-symbols-alternate',
    'roman-numeral-analysis',
    'nashville-number',
    'tuplet',
    'articulation',
    'sticking',
    'fingering',
    'tab-fret-number',
    'lh-guitar-fingering',
    'rh-guitar-fingering',
    'hammer-ons-pull-offs-and-tapping',
    'string-number',
    'string-tunings',
    'fretboard-diagram-fingering',
    'fretboard-diagram-fret-number',
    'harp-pedal-diagram',
    'harp-pedal-text-diagram',
    'text-line',
    'system-text-line',
    'note-line',
    'volta',
    'ottava',
    'glissando',
    'pedal',
    'bend',
    'let-ring',
    'whammy-bar',
    'palm-mute',
    'user1',
    'user2',
    'user3',
    'user4',
    'user5',
    'user6',
    'user7',
    'user8',
    'user9',
    'user10',
    'user11',
    'user12',
]

/** EditStyle::StyleWidget: a style value, its widget (or button group) and reset button (object names) */
export interface StyleWidget {
    idx: Sid
    showPercent: boolean
    widget: string
    reset: string | null
}

/** EditStyle::styleWidgets */
export const STYLE_WIDGETS: readonly StyleWidget[] = [
    //   idx --- showPercent --- widget --- resetButton
    { idx: Sid.figuredBassAlignment, showPercent: false, widget: 'fbAlign', reset: null },
    { idx: Sid.figuredBassStyle, showPercent: false, widget: 'fbStyle', reset: null },
    { idx: Sid.figuredBassFontSize, showPercent: false, widget: 'doubleSpinFBSize', reset: null },
    { idx: Sid.figuredBassYOffset, showPercent: false, widget: 'doubleSpinFBVertPos', reset: null },
    { idx: Sid.figuredBassLineHeight, showPercent: true, widget: 'spinFBLineHeight', reset: null },
    { idx: Sid.ottavaLineStyle, showPercent: false, widget: 'ottavaLineStyle', reset: 'resetOttavaLineStyle' },
    { idx: Sid.ottavaDashLineLen, showPercent: false, widget: 'ottavaLineStyleDashSize', reset: 'resetOttavaLineStyleDashSize' },
    { idx: Sid.ottavaDashGapLen, showPercent: false, widget: 'ottavaLineStyleGapSize', reset: 'resetOttavaLineStyleGapSize' },
    { idx: Sid.pedalLineStyle, showPercent: false, widget: 'pedalLineStyle', reset: 'resetPedalLineStyle' },
    { idx: Sid.pedalDashLineLen, showPercent: false, widget: 'pedalLineStyleDashSize', reset: 'resetPedalLineStyleDashSize' },
    { idx: Sid.pedalDashGapLen, showPercent: false, widget: 'pedalLineStyleGapSize', reset: 'resetPedalLineStyleGapSize' },
    { idx: Sid.textLineLineStyle, showPercent: false, widget: 'textLineLineStyle', reset: 'resetTextLineLineStyle' },
    { idx: Sid.textLineDashLineLen, showPercent: false, widget: 'textLineLineStyleDashSize', reset: 'resetTextLineLineStyleDashSize' },
    { idx: Sid.textLineDashGapLen, showPercent: false, widget: 'textLineLineStyleGapSize', reset: 'resetTextLineLineStyleGapSize' },
    { idx: Sid.systemTextLineLineStyle, showPercent: false, widget: 'systemTextLineLineStyle', reset: 'resetSystemTextLineLineStyle' },
    { idx: Sid.systemTextLineDashLineLen, showPercent: false, widget: 'systemTextLineLineStyleDashSize', reset: 'resetSystemTextLineLineStyleDashSize' },
    { idx: Sid.systemTextLineDashGapLen, showPercent: false, widget: 'systemTextLineLineStyleGapSize', reset: 'resetSystemTextLineLineStyleGapSize' },
    { idx: Sid.staffUpperBorder, showPercent: false, widget: 'staffUpperBorder', reset: 'resetStaffUpperBorder' },
    { idx: Sid.staffLowerBorder, showPercent: false, widget: 'staffLowerBorder', reset: 'resetStaffLowerBorder' },
    { idx: Sid.staffDistance, showPercent: false, widget: 'staffDistance', reset: 'resetStaffDistance' },
    { idx: Sid.akkoladeDistance, showPercent: false, widget: 'akkoladeDistance', reset: 'resetAkkoladeDistance' },
    { idx: Sid.enableVerticalSpread, showPercent: false, widget: 'enableVerticalSpread', reset: null },
    { idx: Sid.minSystemDistance, showPercent: false, widget: 'minSystemDistance', reset: 'resetMinSystemDistance' },
    { idx: Sid.maxSystemDistance, showPercent: false, widget: 'maxSystemDistance', reset: 'resetMaxSystemDistance' },
    { idx: Sid.spreadSystem, showPercent: false, widget: 'spreadSystem', reset: 'resetSpreadSystem' },
    { idx: Sid.spreadSquareBracket, showPercent: false, widget: 'spreadSquareBracket', reset: 'resetSpreadSquareBracket' },
    { idx: Sid.spreadCurlyBracket, showPercent: false, widget: 'spreadCurlyBracket', reset: 'resetSpreadCurlyBracket' },
    { idx: Sid.minSystemSpread, showPercent: false, widget: 'minSystemSpread', reset: 'resetMinSystemSpread' },
    { idx: Sid.maxSystemSpread, showPercent: false, widget: 'maxSystemSpread', reset: 'resetMaxSystemSpread' },
    { idx: Sid.minStaffSpread, showPercent: false, widget: 'minStaffSpread', reset: 'resetMinStaffSpread' },
    { idx: Sid.maxStaffSpread, showPercent: false, widget: 'maxStaffSpread', reset: 'resetMaxStaffSpread' },
    { idx: Sid.maxAkkoladeDistance, showPercent: false, widget: 'maxAkkoladeDistance', reset: 'resetMaxAkkoladeDistance' },
    { idx: Sid.maxPageFillSpread, showPercent: false, widget: 'maxPageFillSpread', reset: 'resetMaxPageFillSpread' },
    { idx: Sid.lyricsPlacement, showPercent: false, widget: 'lyricsPlacement', reset: 'resetLyricsPlacement' },
    { idx: Sid.lyricsPosAbove, showPercent: false, widget: 'yLyricsPosAbove', reset: 'resetLyricsPosAbove' },
    { idx: Sid.lyricsPosBelow, showPercent: false, widget: 'yLyricsPosBelow', reset: 'resetLyricsPosBelow' },
    { idx: Sid.lyricsMinTopDistance, showPercent: false, widget: 'lyricsMinTopDistance', reset: 'resetLyricsMinTopDistance' },
    { idx: Sid.lyricsMinBottomDistance, showPercent: false, widget: 'lyricsMinBottomDistance', reset: 'resetLyricsMinBottomDistance' },
    { idx: Sid.lyricsMinDistance, showPercent: false, widget: 'lyricsMinDistance', reset: 'resetLyricsMinDistance' },
    { idx: Sid.lyricsLineHeight, showPercent: true, widget: 'lyricsLineHeight', reset: 'resetLyricsLineHeight' },
    { idx: Sid.lyricsDashMinLength, showPercent: false, widget: 'lyricsDashMinLength', reset: 'resetLyricsDashMinLength' },
    { idx: Sid.lyricsDashMaxLength, showPercent: false, widget: 'lyricsDashMaxLength', reset: 'resetLyricsDashMaxLength' },
    { idx: Sid.lyricsDashMaxDistance, showPercent: false, widget: 'lyricsDashMaxDistance', reset: 'resetLyricsDashMaxDistance' },
    { idx: Sid.lyricsDashForce, showPercent: false, widget: 'lyricsDashForce', reset: 'resetLyricsDashForce' },
    { idx: Sid.lyricsAlignVerseNumber, showPercent: false, widget: 'lyricsAlignVerseNumber', reset: 'resetLyricsAlignVerseNumber' },
    { idx: Sid.lyricsLineThickness, showPercent: false, widget: 'lyricsLineThickness', reset: 'resetLyricsLineThickness' },
    { idx: Sid.lyricsMelismaPad, showPercent: false, widget: 'lyricsMelismaPad', reset: 'resetLyricsMelismaPad' },
    { idx: Sid.lyricsDashPad, showPercent: false, widget: 'lyricsDashPad', reset: 'resetLyricsDashPad' },
    { idx: Sid.lyricsDashLineThickness, showPercent: false, widget: 'lyricsDashLineThickness', reset: 'resetLyricsDashLineThickness' },
    { idx: Sid.lyricsDashYposRatio, showPercent: false, widget: 'lyricsDashYposRatio', reset: 'resetLyricsDashYposRatio' },
    { idx: Sid.lyricsShowDashIfSyllableOnFirstNote, showPercent: false, widget: 'lyricsShowDashIfSyllableOnFirstNote', reset: 'resetLyricsShowDashIfSyllableOnFirstNote' },
    { idx: Sid.lyricsMelismaMinLength, showPercent: false, widget: 'minMelismaLength', reset: 'resetMinMelismaLength' },
    { idx: Sid.lyricsMelismaForce, showPercent: false, widget: 'lyricsMelismaForce', reset: 'resetLyricsMelismaForce' },
    { idx: Sid.lyricsDashPosAtStartOfSystem, showPercent: false, widget: 'lyricsDashStartSystemPlacement', reset: 'resetLyricsDashStartSystemPlacement' },
    { idx: Sid.lyricsAvoidBarlines, showPercent: false, widget: 'lyricsAvoidBarlines', reset: 'resetLyricsAvoidBarlines' },
    { idx: Sid.lyricsLimitDashCount, showPercent: false, widget: 'limitDashCount', reset: null },
    { idx: Sid.lyricsMaxDashCount, showPercent: false, widget: 'lyricsMaxDashCount', reset: 'resetLyricsMaxDashCount' },
    { idx: Sid.lyricsCenterDashedSyllables, showPercent: false, widget: 'lyricsCenterDashedSyllables', reset: 'lyricsResetCenterDashedSyllables' },
    { idx: Sid.systemFrameDistance, showPercent: false, widget: 'systemFrameDistance', reset: 'resetSystemFrameDistance' },
    { idx: Sid.frameSystemDistance, showPercent: false, widget: 'frameSystemDistance', reset: 'resetFrameSystemDistance' },
    { idx: Sid.spacingDensity, showPercent: true, widget: 'spacingDensity', reset: 'resetSpacingDensity' },
    { idx: Sid.minMeasureWidth, showPercent: false, widget: 'minMeasureWidth_2', reset: 'resetMinMeasureWidth' },
    { idx: Sid.measureSpacing, showPercent: false, widget: 'measureSpacing', reset: 'resetMeasureSpacing' },
    { idx: Sid.barWidth, showPercent: false, widget: 'barWidth', reset: 'resetBarWidth' },
    { idx: Sid.endBarWidth, showPercent: false, widget: 'endBarWidth', reset: 'resetEndBarWidth' },
    { idx: Sid.endBarDistance, showPercent: false, widget: 'endBarDistance', reset: 'resetEndBarDistance' },
    { idx: Sid.doubleBarWidth, showPercent: false, widget: 'doubleBarWidth', reset: 'resetDoubleBarWidth' },
    { idx: Sid.doubleBarDistance, showPercent: false, widget: 'doubleBarDistance', reset: 'resetDoubleBarDistance' },
    { idx: Sid.repeatBarlineDotSeparation, showPercent: false, widget: 'repeatBarlineDotSeparation', reset: 'resetRepeatBarlineDotSeparation' },
    { idx: Sid.barGraceDistance, showPercent: false, widget: 'barGraceDistance', reset: 'resetBarGraceDistance' },
    { idx: Sid.concertPitch, showPercent: false, widget: 'concertPitch', reset: null },
    { idx: Sid.createMultiMeasureRests, showPercent: false, widget: 'multiMeasureRests', reset: null },
    { idx: Sid.minEmptyMeasures, showPercent: false, widget: 'minEmptyMeasures', reset: null },
    { idx: Sid.singleMeasureMMRestUseNormalRest, showPercent: false, widget: 'singleMeasureMMRest', reset: null },
    { idx: Sid.singleMeasureMMRestShowNumber, showPercent: false, widget: 'singleMMRestShowNumber', reset: null },
    { idx: Sid.mmRestConstantWidth, showPercent: false, widget: 'mmRestConstantWidth', reset: null },
    { idx: Sid.mmRestReferenceWidth, showPercent: false, widget: 'mmRestRefDuration', reset: 'resetMMRestRefDuration' },
    { idx: Sid.mmRestMaxWidthIncrease, showPercent: false, widget: 'mmRestMaxMeasures', reset: 'mmRestMaxMeasuresReset' },
    { idx: Sid.minMMRestWidth, showPercent: false, widget: 'minMeasureWidth', reset: 'resetMinMMRestWidth' },
    { idx: Sid.mmRestNumberPos, showPercent: false, widget: 'mmRestNumberPos', reset: 'resetMMRestNumberPos' },
    { idx: Sid.mmRestBetweenStaves, showPercent: false, widget: 'placeBetweenStaves', reset: 'resetPlaceBetweenStaves' },
    { idx: Sid.mmRestNumberMaskHBar, showPercent: false, widget: 'mmRestNumberMaskHBar', reset: 'resetMMRestNumberMaskHBar' },
    { idx: Sid.mmRestHBarThickness, showPercent: false, widget: 'mmRestHBarThickness', reset: 'resetMMRestHBarThickness' },
    { idx: Sid.multiMeasureRestMargin, showPercent: false, widget: 'multiMeasureRestMargin', reset: 'resetMultiMeasureRestMargin' },
    { idx: Sid.mmRestHBarVStrokeThickness, showPercent: false, widget: 'mmRestHBarVStrokeThickness', reset: 'resetMMRestHBarVStrokeThickness' },
    { idx: Sid.mmRestHBarVStrokeHeight, showPercent: false, widget: 'mmRestHBarVStrokeHeight', reset: 'resetMMRestHBarVStrokeHeight' },
    { idx: Sid.oldStyleMultiMeasureRests, showPercent: false, widget: 'oldStyleMultiMeasureRests', reset: null },
    { idx: Sid.mmRestOldStyleMaxMeasures, showPercent: false, widget: 'mmRestOldStyleMaxMeasures', reset: 'resetMMRestOldStyleMaxMeasures' },
    { idx: Sid.mmRestOldStyleSpacing, showPercent: false, widget: 'mmRestOldStyleSpacing', reset: 'resetMMRestOldStyleSpacing' },
    { idx: Sid.hideEmptyStaves, showPercent: false, widget: 'hideEmptyStaves', reset: null },
    { idx: Sid.dontHideStavesInFirstSystem, showPercent: false, widget: 'dontHideStavesInFirstSystem', reset: null },
    { idx: Sid.enableIndentationOnFirstSystem, showPercent: false, widget: 'enableIndentationOnFirstSystem', reset: null },
    { idx: Sid.firstSystemIndentationValue, showPercent: false, widget: 'indentationValue', reset: 'resetFirstSystemIndentation' },
    { idx: Sid.alwaysShowBracketsWhenEmptyStavesAreHidden, showPercent: false, widget: 'alwaysShowBrackets', reset: null },
    { idx: Sid.hideInstrumentNameIfOneInstrument, showPercent: false, widget: 'hideInstrumentNameIfOneInstrument', reset: null },
    { idx: Sid.firstSystemInstNameVisibility, showPercent: false, widget: 'firstSysLabels', reset: 'resetFirstSystemLabel' },
    { idx: Sid.subsSystemInstNameVisibility, showPercent: false, widget: 'subsSysLabels', reset: 'resetSubsSystemLabel' },
    { idx: Sid.accidentalNoteDistance, showPercent: false, widget: 'accidentalNoteDistance', reset: null },
    { idx: Sid.accidentalDistance, showPercent: false, widget: 'accidentalDistance', reset: null },
    { idx: Sid.minNoteDistance, showPercent: false, widget: 'minNoteDistance', reset: 'resetMinNoteDistance' },
    { idx: Sid.barNoteDistance, showPercent: false, widget: 'barNoteDistance', reset: 'resetBarNoteDistance' },
    { idx: Sid.barAccidentalDistance, showPercent: false, widget: 'barAccidentalDistance', reset: 'resetBarAccidentalDistance' },
    { idx: Sid.noteBarDistance, showPercent: false, widget: 'noteBarDistance', reset: 'resetNoteBarDistance' },
    { idx: Sid.clefLeftMargin, showPercent: false, widget: 'clefLeftMargin', reset: 'resetClefLeftMargin' },
    { idx: Sid.keysigLeftMargin, showPercent: false, widget: 'keysigLeftMargin', reset: 'resetKeysigLeftMargin' },
    { idx: Sid.timesigLeftMargin, showPercent: false, widget: 'timesigLeftMargin', reset: 'resetTimesigLeftMargin' },
    { idx: Sid.clefKeyRightMargin, showPercent: false, widget: 'clefKeyRightMargin', reset: 'resetClefKeyRightMargin' },
    { idx: Sid.clefKeyDistance, showPercent: false, widget: 'clefKeyDistance', reset: 'resetClefKeyDistance' },
    { idx: Sid.clefTimesigDistance, showPercent: false, widget: 'clefTimesigDistance', reset: 'resetClefTimesigDistance' },
    { idx: Sid.keyTimesigDistance, showPercent: false, widget: 'keyTimesigDistance', reset: 'resetKeyTimesigDistance' },
    { idx: Sid.keyBarlineDistance, showPercent: false, widget: 'keyBarlineDistance', reset: 'resetKeyBarlineDistance' },
    { idx: Sid.systemHeaderDistance, showPercent: false, widget: 'systemHeaderDistance', reset: 'resetSystemHeaderDistance' },
    { idx: Sid.systemHeaderTimeSigDistance, showPercent: false, widget: 'systemHeaderTimeSigDistance', reset: 'resetSystemHeaderTimeSigDistance' },
    { idx: Sid.systemHeaderMinStartOfSystemDistance, showPercent: false, widget: 'systemHeaderMinStartOfSystemDistance', reset: 'resetSystemHeaderMinStartOfSystemDistance' },
    { idx: Sid.clefBarlineDistance, showPercent: false, widget: 'clefBarlineDistance', reset: 'resetClefBarlineDistance' },
    { idx: Sid.timesigBarlineDistance, showPercent: false, widget: 'timesigBarlineDistance', reset: 'resetTimesigBarlineDistance' },
    { idx: Sid.staffLineWidth, showPercent: false, widget: 'staffLineWidth', reset: 'resetStaffLineWidth' },
    { idx: Sid.hairpinPosAbove, showPercent: false, widget: 'hairpinPosAbove', reset: 'resetHairpinPosAbove' },
    { idx: Sid.hairpinPosBelow, showPercent: false, widget: 'hairpinPosBelow', reset: 'resetHairpinPosBelow' },
    { idx: Sid.hairpinLineWidth, showPercent: false, widget: 'hairpinLineWidth', reset: 'resetHairpinLineWidth' },
    { idx: Sid.hairpinHeight, showPercent: false, widget: 'hairpinHeight', reset: 'resetHairpinHeight' },
    { idx: Sid.hairpinContHeight, showPercent: false, widget: 'hairpinContinueHeight', reset: 'resetHairpinContinueHeight' },
    { idx: Sid.dotNoteDistance, showPercent: false, widget: 'noteDotDistance', reset: null },
    { idx: Sid.dotDotDistance, showPercent: false, widget: 'dotDotDistance', reset: null },
    { idx: Sid.stemWidth, showPercent: false, widget: 'stemWidth', reset: null },
    { idx: Sid.ledgerLineWidth, showPercent: false, widget: 'ledgerLineWidth', reset: null },
    { idx: Sid.ledgerLineLength, showPercent: false, widget: 'ledgerLineLength', reset: null },
    { idx: Sid.shortestStem, showPercent: false, widget: 'shortestStem', reset: null },
    { idx: Sid.combineVoice, showPercent: false, widget: 'combineVoices', reset: 'resetCombineVoices' },
    { idx: Sid.arpeggioNoteDistance, showPercent: false, widget: 'arpeggioNoteDistance', reset: 'arpeggioNoteDistanceReset' },
    { idx: Sid.arpeggioLineWidth, showPercent: false, widget: 'arpeggioLineWidth', reset: 'arpeggioLineWidthReset' },
    { idx: Sid.arpeggioHiddenInStdIfTab, showPercent: false, widget: 'arpeggioHiddenInStdIfTab', reset: null },
    { idx: Sid.chordBracketNoteDistance, showPercent: false, widget: 'chordBracketNoteDistance', reset: 'chordBracketNoteDistanceReset' },
    { idx: Sid.chordBracketLineWidth, showPercent: false, widget: 'chordBracketLineWidth', reset: 'chordBracketLineWidthReset' },
    { idx: Sid.chordBracketHookLen, showPercent: false, widget: 'chordBracketHookLen', reset: 'chordBracketHookLenReset' },
    { idx: Sid.bracketWidth, showPercent: false, widget: 'bracketWidth', reset: 'resetBracketThickness' },
    { idx: Sid.bracketDistance, showPercent: false, widget: 'bracketDistance', reset: 'resetBracketDistance' },
    { idx: Sid.akkoladeWidth, showPercent: false, widget: 'akkoladeWidth', reset: 'resetBraceThickness' },
    { idx: Sid.akkoladeBarDistance, showPercent: false, widget: 'akkoladeBarDistance', reset: 'resetBraceDistance' },
    { idx: Sid.dividerLeft, showPercent: false, widget: 'dividerLeft', reset: null },
    { idx: Sid.dividerLeftX, showPercent: false, widget: 'dividerLeftX', reset: 'dividerLeftXReset' },
    { idx: Sid.dividerLeftY, showPercent: false, widget: 'dividerLeftY', reset: 'dividerLeftYReset' },
    { idx: Sid.dividerRight, showPercent: false, widget: 'dividerRight', reset: null },
    { idx: Sid.dividerRightX, showPercent: false, widget: 'dividerRightX', reset: 'dividerRightXReset' },
    { idx: Sid.dividerRightY, showPercent: false, widget: 'dividerRightY', reset: 'dividerRightYReset' },
    { idx: Sid.dividerLeftSize, showPercent: true, widget: 'dividerLeftSize', reset: 'dividerLeftSizeReset' },
    { idx: Sid.dividerRightSize, showPercent: true, widget: 'dividerRightSize', reset: 'dividerRightSizeReset' },
    { idx: Sid.dividerLeftAlignToSystemBarline, showPercent: true, widget: 'dividerLeftAlignToSystemBarline', reset: null },
    { idx: Sid.dividerRightAlignToSystemBarline, showPercent: false, widget: 'dividerRightAlignToSystemBarline', reset: null },
    { idx: Sid.articulationMinDistance, showPercent: false, widget: 'articMinVerticalDist', reset: 'resetArticMinVerticalDist' },
    { idx: Sid.propertyDistanceHead, showPercent: false, widget: 'articNoteHeadDist', reset: 'resetArticNoteHeadDist' },
    { idx: Sid.propertyDistanceStem, showPercent: false, widget: 'articStemDist', reset: 'resetArticStemDist' },
    { idx: Sid.propertyDistance, showPercent: false, widget: 'articStaffDist', reset: 'resetArticStaffDist' },
    { idx: Sid.articulationStemHAlign, showPercent: false, widget: 'articulationStemSide', reset: null },
    { idx: Sid.articulationKeepTogether, showPercent: false, widget: 'articulationKeepTogether', reset: null },
    { idx: Sid.trillAlwaysShowCueNote, showPercent: false, widget: 'trillAlwaysShowCueNote', reset: null },
    { idx: Sid.ottavaPosAbove, showPercent: false, widget: 'ottavaPosAbove', reset: 'resetOttavaPosAbove' },
    { idx: Sid.ottavaPosBelow, showPercent: false, widget: 'ottavaPosBelow', reset: 'resetOttavaPosBelow' },
    { idx: Sid.ottavaHookAbove, showPercent: false, widget: 'ottavaHookAbove', reset: 'resetOttavaHookAbove' },
    { idx: Sid.ottavaHookBelow, showPercent: false, widget: 'ottavaHookBelow', reset: 'resetOttavaHookBelow' },
    { idx: Sid.ottavaLineWidth, showPercent: false, widget: 'ottavaLineWidth', reset: 'resetOttavaLineWidth' },
    { idx: Sid.pedalPlacement, showPercent: false, widget: 'pedalLinePlacement', reset: 'resetPedalLinePlacement' },
    { idx: Sid.pedalPosAbove, showPercent: false, widget: 'pedalLinePosAbove', reset: 'resetPedalLinePosAbove' },
    { idx: Sid.pedalPosBelow, showPercent: false, widget: 'pedalLinePosBelow', reset: 'resetPedalLinePosBelow' },
    { idx: Sid.pedalLineWidth, showPercent: false, widget: 'pedalLineWidth', reset: 'resetPedalLineWidth' },
    { idx: Sid.trillPlacement, showPercent: false, widget: 'trillLinePlacement', reset: 'resetTrillLinePlacement' },
    { idx: Sid.trillPosAbove, showPercent: false, widget: 'trillLinePosAbove', reset: 'resetTrillLinePosAbove' },
    { idx: Sid.trillPosBelow, showPercent: false, widget: 'trillLinePosBelow', reset: 'resetTrillLinePosBelow' },
    { idx: Sid.vibratoPlacement, showPercent: false, widget: 'vibratoLinePlacement', reset: 'resetVibratoLinePlacement' },
    { idx: Sid.vibratoPosAbove, showPercent: false, widget: 'vibratoLinePosAbove', reset: 'resetVibratoLinePosAbove' },
    { idx: Sid.vibratoPosBelow, showPercent: false, widget: 'vibratoLinePosBelow', reset: 'resetVibratoLinePosBelow' },
    { idx: Sid.tupletVHeadDistance, showPercent: false, widget: 'tupletVHeadDistance', reset: 'resetTupletVHeadDistance' },
    { idx: Sid.tupletVStemDistance, showPercent: false, widget: 'tupletVStemDistance', reset: 'resetTupletVStemDistance' },
    { idx: Sid.tupletStemLeftDistance, showPercent: false, widget: 'tupletStemLeftDistance', reset: 'resetTupletStemLeftDistance' },
    { idx: Sid.tupletStemRightDistance, showPercent: false, widget: 'tupletStemRightDistance', reset: 'resetTupletStemRightDistance' },
    { idx: Sid.tupletNoteLeftDistance, showPercent: false, widget: 'tupletNoteLeftDistance', reset: 'resetTupletNoteLeftDistance' },
    { idx: Sid.tupletNoteRightDistance, showPercent: false, widget: 'tupletNoteRightDistance', reset: 'resetTupletNoteRightDistance' },
    { idx: Sid.tupletBracketWidth, showPercent: false, widget: 'tupletBracketWidth', reset: 'resetTupletBracketWidth' },
    { idx: Sid.tupletBracketHookHeight, showPercent: false, widget: 'tupletBracketHookHeight', reset: 'resetTupletBracketHookHeight' },
    { idx: Sid.tupletDirection, showPercent: false, widget: 'tupletDirection', reset: 'resetTupletDirection' },
    { idx: Sid.tupletNumberType, showPercent: false, widget: 'tupletNumberType', reset: 'resetTupletNumberType' },
    { idx: Sid.tupletBracketType, showPercent: false, widget: 'tupletBracketType', reset: 'resetTupletBracketType' },
    { idx: Sid.tupletMaxSlope, showPercent: true, widget: 'tupletMaxSlope', reset: 'resetTupletMaxSlope' },
    { idx: Sid.tupletOutOfStaff, showPercent: false, widget: 'tupletOutOfStaff', reset: null },
    { idx: Sid.tupletUseSymbols, showPercent: false, widget: 'tupletUseSymbols', reset: 'resetTupletUseSymbols' },
    { idx: Sid.tupletExtendToEndOfDuration, showPercent: false, widget: 'tupletExtendToEndOfDuration', reset: null },
    { idx: Sid.repeatBarTips, showPercent: false, widget: 'showRepeatBarTips', reset: 'resetShowRepeatBarTips' },
    { idx: Sid.startBarlineSingle, showPercent: false, widget: 'showStartBarlineSingle', reset: 'resetShowStartBarlineSingle' },
    { idx: Sid.startBarlineMultiple, showPercent: false, widget: 'showStartBarlineMultiple', reset: 'resetShowStartBarlineMultiple' },
    { idx: Sid.maskBarlinesForText, showPercent: false, widget: 'maskBarlines', reset: 'resetMaskBarlines' },
    { idx: Sid.dividerLeftSym, showPercent: false, widget: 'dividerLeftSym', reset: 'dividerLeftSymReset' },
    { idx: Sid.dividerRightSym, showPercent: false, widget: 'dividerRightSym', reset: 'dividerRightSymReset' },
    { idx: Sid.graceNoteMag, showPercent: true, widget: 'graceNoteSize', reset: 'resetGraceNoteSize' },
    { idx: Sid.smallStaffMag, showPercent: true, widget: 'smallStaffSize', reset: 'resetSmallStaffSize' },
    { idx: Sid.smallNoteMag, showPercent: true, widget: 'smallNoteSize', reset: 'resetSmallNoteSize' },
    { idx: Sid.scaleRythmicSpacingForSmallNotes, showPercent: true, widget: 'reduceRythmicSpacing', reset: null },
    { idx: Sid.smallClefMag, showPercent: true, widget: 'smallClefSize', reset: 'resetSmallClefSize' },
    { idx: Sid.lastSystemFillLimit, showPercent: true, widget: 'lastSystemFillThreshold', reset: 'resetLastSystemFillThreshold' },
    { idx: Sid.keySigCourtesyBarlineMode, showPercent: false, widget: 'ksbl', reset: null },
    { idx: Sid.timeSigCourtesyBarlineMode, showPercent: false, widget: 'tsbl', reset: null },
    { idx: Sid.swingRatio, showPercent: false, widget: 'swingBox', reset: null },
    { idx: Sid.dotMag, showPercent: true, widget: 'dotMag', reset: null },
    { idx: Sid.articulationMag, showPercent: true, widget: 'articulationMag', reset: 'resetArticulationMag' },
    { idx: Sid.shortenStem, showPercent: false, widget: 'shortenStem', reset: null },
    { idx: Sid.showHeader, showPercent: false, widget: 'showHeader', reset: null },
    { idx: Sid.headerFirstPage, showPercent: false, widget: 'showHeaderFirstPage', reset: null },
    { idx: Sid.headerOddEven, showPercent: false, widget: 'headerOddEven', reset: null },
    { idx: Sid.evenHeaderL, showPercent: false, widget: 'evenHeaderL', reset: null },
    { idx: Sid.evenHeaderC, showPercent: false, widget: 'evenHeaderC', reset: null },
    { idx: Sid.evenHeaderR, showPercent: false, widget: 'evenHeaderR', reset: null },
    { idx: Sid.oddHeaderL, showPercent: false, widget: 'oddHeaderL', reset: null },
    { idx: Sid.oddHeaderC, showPercent: false, widget: 'oddHeaderC', reset: null },
    { idx: Sid.oddHeaderR, showPercent: false, widget: 'oddHeaderR', reset: null },
    { idx: Sid.showFooter, showPercent: false, widget: 'showFooter', reset: null },
    { idx: Sid.footerFirstPage, showPercent: false, widget: 'showFooterFirstPage', reset: null },
    { idx: Sid.footerOddEven, showPercent: false, widget: 'footerOddEven', reset: null },
    { idx: Sid.evenFooterL, showPercent: false, widget: 'evenFooterL', reset: null },
    { idx: Sid.evenFooterC, showPercent: false, widget: 'evenFooterC', reset: null },
    { idx: Sid.evenFooterR, showPercent: false, widget: 'evenFooterR', reset: null },
    { idx: Sid.oddFooterL, showPercent: false, widget: 'oddFooterL', reset: null },
    { idx: Sid.oddFooterC, showPercent: false, widget: 'oddFooterC', reset: null },
    { idx: Sid.oddFooterR, showPercent: false, widget: 'oddFooterR', reset: null },
    { idx: Sid.ottavaNumbersOnly, showPercent: false, widget: 'ottavaNumbersOnly', reset: 'resetOttavaNumbersOnly' },
    { idx: Sid.scaleBarlines, showPercent: false, widget: 'scaleBarlines', reset: 'resetScaleBarlines' },
    { idx: Sid.crossMeasureValues, showPercent: false, widget: 'crossMeasureValues', reset: null },
    { idx: Sid.musicalSymbolFont, showPercent: false, widget: 'musicalSymbolFont', reset: null },
    { idx: Sid.musicalTextFont, showPercent: false, widget: 'musicalTextFont', reset: null },
    { idx: Sid.autoplaceHairpinDynamicsDistance, showPercent: false, widget: 'autoplaceHairpinDynamicsDistance', reset: 'resetAutoplaceHairpinDynamicsDistance' },
    { idx: Sid.dynamicsPosAbove, showPercent: false, widget: 'dynamicsPosAbove', reset: 'resetDynamicsPosAbove' },
    { idx: Sid.dynamicsPosBelow, showPercent: false, widget: 'dynamicsPosBelow', reset: 'resetDynamicsPosBelow' },
    { idx: Sid.dynamicsMinDistance, showPercent: false, widget: 'dynamicsMinDistance', reset: 'resetDynamicsMinDistance' },
    { idx: Sid.avoidBarLines, showPercent: false, widget: 'avoidBarLines', reset: 'resetAvoidBarLines' },
    { idx: Sid.snapToDynamics, showPercent: false, widget: 'snapExpression', reset: 'resetSnapExpression' },
    { idx: Sid.dynamicsSize, showPercent: true, widget: 'dynamicsSize', reset: 'resetDynamicsSize' },
    { idx: Sid.dynamicsOverrideFont, showPercent: false, widget: 'dynamicsOverrideFont', reset: null },
    { idx: Sid.dynamicsFont, showPercent: false, widget: 'dynamicsFont', reset: null },
    { idx: Sid.dynamicsHairpinVoiceBasedPlacement, showPercent: false, widget: 'dynamicsAndHairpinPos', reset: 'resetDynamicsAndHairpinPos' },
    { idx: Sid.dynamicsHairpinsAutoCenterOnGrandStaff, showPercent: false, widget: 'dynamicsAndHairpinsCenterOnGrandStaff', reset: null },
    { idx: Sid.dynamicsHairpinsAboveForVocalStaves, showPercent: false, widget: 'dynamicsAndHairpinsAboveOnVocalStaves', reset: null },
    { idx: Sid.tempoPlacement, showPercent: false, widget: 'tempoTextPlacement', reset: 'resetTempoTextPlacement' },
    { idx: Sid.tempoPosAbove, showPercent: false, widget: 'tempoTextPosAbove', reset: 'resetTempoTextPosAbove' },
    { idx: Sid.tempoPosBelow, showPercent: false, widget: 'tempoTextPosBelow', reset: 'resetTempoTextPosBelow' },
    { idx: Sid.tempoMinDistance, showPercent: false, widget: 'tempoTextMinDistance', reset: 'resetTempoTextMinDistance' },
    { idx: Sid.rehearsalMarkPlacement, showPercent: false, widget: 'rehearsalMarkPlacement', reset: 'resetRehearsalMarkPlacement' },
    { idx: Sid.rehearsalMarkPosAbove, showPercent: false, widget: 'rehearsalMarkPosAbove', reset: 'resetRehearsalMarkPosAbove' },
    { idx: Sid.rehearsalMarkPosBelow, showPercent: false, widget: 'rehearsalMarkPosBelow', reset: 'resetRehearsalMarkPosBelow' },
    { idx: Sid.rehearsalMarkMinDistance, showPercent: false, widget: 'rehearsalMarkMinDistance', reset: 'resetRehearsalMarkMinDistance' },
    { idx: Sid.minVerticalDistance, showPercent: false, widget: 'minVerticalDistance', reset: 'resetMinVerticalDistance' },
    { idx: Sid.textLinePlacement, showPercent: false, widget: 'textLinePlacement', reset: 'resetTextLinePlacement' },
    { idx: Sid.textLinePosAbove, showPercent: false, widget: 'textLinePosAbove', reset: 'resetTextLinePosAbove' },
    { idx: Sid.textLinePosBelow, showPercent: false, widget: 'textLinePosBelow', reset: 'resetTextLinePosBelow' },
    { idx: Sid.textLineLineWidth, showPercent: false, widget: 'textLineLineWidth', reset: 'resetTextLineLineWidth' },
    { idx: Sid.systemTextLinePlacement, showPercent: false, widget: 'systemTextLinePlacement', reset: 'resetSystemTextLinePlacement' },
    { idx: Sid.systemTextLinePosAbove, showPercent: false, widget: 'systemTextLinePosAbove', reset: 'resetSystemTextLinePosAbove' },
    { idx: Sid.systemTextLinePosBelow, showPercent: false, widget: 'systemTextLinePosBelow', reset: 'resetSystemTextLinePosBelow' },
    { idx: Sid.systemTextLineLineWidth, showPercent: false, widget: 'systemTextLineLineWidth', reset: 'resetSystemTextLineLineWidth' },
    { idx: Sid.fermataPosAbove, showPercent: false, widget: 'fermataPosAbove', reset: 'resetFermataPosAbove' },
    { idx: Sid.fermataPosBelow, showPercent: false, widget: 'fermataPosBelow', reset: 'resetFermataPosBelow' },
    { idx: Sid.fermataMinDistance, showPercent: false, widget: 'fermataMinDistance', reset: 'resetFermataMinDistance' },
    { idx: Sid.staffTextPlacement, showPercent: false, widget: 'staffTextPlacement', reset: 'resetStaffTextPlacement' },
    { idx: Sid.staffTextPosAbove, showPercent: false, widget: 'staffTextPosAbove', reset: 'resetStaffTextPosAbove' },
    { idx: Sid.staffTextPosBelow, showPercent: false, widget: 'staffTextPosBelow', reset: 'resetStaffTextPosBelow' },
    { idx: Sid.staffTextMinDistance, showPercent: false, widget: 'staffTextMinDistance', reset: 'resetStaffTextMinDistance' },
    { idx: Sid.slurShowTabSimple, showPercent: false, widget: 'slurShowTabSimple', reset: null },
    { idx: Sid.slurShowTabCommon, showPercent: false, widget: 'slurShowTabCommon', reset: null },
    { idx: Sid.fermataShowTabSimple, showPercent: false, widget: 'fermataShowTabSimple', reset: null },
    { idx: Sid.fermataShowTabCommon, showPercent: false, widget: 'fermataShowTabCommon', reset: null },
    { idx: Sid.dynamicsShowTabSimple, showPercent: false, widget: 'dynamicsShowTabSimple', reset: null },
    { idx: Sid.dynamicsShowTabCommon, showPercent: false, widget: 'dynamicsShowTabCommon', reset: null },
    { idx: Sid.hairpinShowTabSimple, showPercent: false, widget: 'hairpinShowTabSimple', reset: null },
    { idx: Sid.hairpinShowTabCommon, showPercent: false, widget: 'hairpinShowTabCommon', reset: null },
    { idx: Sid.accentShowTabSimple, showPercent: false, widget: 'accentShowTabSimple', reset: null },
    { idx: Sid.accentShowTabCommon, showPercent: false, widget: 'accentShowTabCommon', reset: null },
    { idx: Sid.staccatoShowTabSimple, showPercent: false, widget: 'staccatoShowTabSimple', reset: null },
    { idx: Sid.staccatoShowTabCommon, showPercent: false, widget: 'staccatoShowTabCommon', reset: null },
    { idx: Sid.harmonicMarkShowTabSimple, showPercent: false, widget: 'harmonicMarkShowTabSimple', reset: null },
    { idx: Sid.harmonicMarkShowTabCommon, showPercent: false, widget: 'harmonicMarkShowTabCommon', reset: null },
    { idx: Sid.letRingShowTabSimple, showPercent: false, widget: 'letRingShowTabSimple', reset: null },
    { idx: Sid.letRingShowTabCommon, showPercent: false, widget: 'letRingShowTabCommon', reset: null },
    { idx: Sid.palmMuteShowTabSimple, showPercent: false, widget: 'palmMuteShowTabSimple', reset: null },
    { idx: Sid.palmMuteShowTabCommon, showPercent: false, widget: 'palmMuteShowTabCommon', reset: null },
    { idx: Sid.rasgueadoShowTabSimple, showPercent: false, widget: 'rasgueadoShowTabSimple', reset: null },
    { idx: Sid.rasgueadoShowTabCommon, showPercent: false, widget: 'rasgueadoShowTabCommon', reset: null },
    { idx: Sid.mordentShowTabSimple, showPercent: false, widget: 'mordentShowTabSimple', reset: null },
    { idx: Sid.mordentShowTabCommon, showPercent: false, widget: 'mordentShowTabCommon', reset: null },
    { idx: Sid.turnShowTabSimple, showPercent: false, widget: 'turnShowTabSimple', reset: null },
    { idx: Sid.turnShowTabCommon, showPercent: false, widget: 'turnShowTabCommon', reset: null },
    { idx: Sid.wahShowTabSimple, showPercent: false, widget: 'wahShowTabSimple', reset: null },
    { idx: Sid.wahShowTabCommon, showPercent: false, widget: 'wahShowTabCommon', reset: null },
    { idx: Sid.golpeShowTabSimple, showPercent: false, widget: 'golpeShowTabSimple', reset: null },
    { idx: Sid.golpeShowTabCommon, showPercent: false, widget: 'golpeShowTabCommon', reset: null },
    { idx: Sid.tabShowTiedFret, showPercent: false, widget: 'tabShowTiedFrets', reset: null },
    { idx: Sid.tabParenthesizeTiedFret, showPercent: false, widget: 'tabParenthFrets', reset: null },
    { idx: Sid.parenthesizeTiedFretIfArticulation, showPercent: false, widget: 'tabParenthArticulation', reset: null },]

/**
 * The button groups of the EditStyle constructor (QButtonGroup: the buttons and their ids). They are exclusive and
 * represent an int (or bool, isBoolStyleRepresentedByButtonGroup) enumeration.
 */
export const BUTTON_GROUPS: ReadonlyMap<string, readonly (readonly [string, number])[]> = new Map([
    ['ksbl', [
        ['radioKeySigCourtesyBarlineAlwaysSingle', CourtesyBarlineMode.ALWAYS_SINGLE],
        ['radioKeySigCourtesyBarlineAlwaysDouble', CourtesyBarlineMode.ALWAYS_DOUBLE],
        ['radioKeySigCourtesyBarlineDoubleBeforeNewSystem', CourtesyBarlineMode.DOUBLE_BEFORE_COURTESY],
    ]],
    ['tsbl', [
        ['radioTimeSigCourtesyBarlineAlwaysSingle', CourtesyBarlineMode.ALWAYS_SINGLE],
        ['radioTimeSigCourtesyBarlineAlwaysDouble', CourtesyBarlineMode.ALWAYS_DOUBLE],
        ['radioTimeSigCourtesyBarlineDoubleBeforeNewSystem', CourtesyBarlineMode.DOUBLE_BEFORE_COURTESY],
    ]],
    ['fbAlign', [['radioFBTop', 0], ['radioFBBottom', 1]]],
    ['fbStyle', [['radioFBModern', 0], ['radioFBHistoric', 1]]],
    ['articulationStemSide', [
        ['radioArticAlignStem', ArticulationStemSideAlign.STEM],
        ['radioArticAlignNoteHead', ArticulationStemSideAlign.NOTEHEAD],
        ['radioArticAlignCenter', ArticulationStemSideAlign.AVERAGE],
    ]],
    ['articulationKeepTogether', [['radioArticKeepTogether', 1], ['radioArticAllowSeparate', 0]]],
    ['trillAlwaysShowCueNote', [['ornamentShowCueNoteAlways', 1], ['ornamentShowCueNoteOnlyNonSeconds', 0]]],
    ['tabShowTiedFrets', [
        ['tabShowTiesAndFret', ShowTiedFret.TIE_AND_FRET],
        ['tabShowTies', ShowTiedFret.TIE],
        ['tabShowNone', ShowTiedFret.NONE],
    ]],
    ['tabParenthFrets', [
        ['tabParenthSystem', ParenthesizeTiedFret.START_OF_SYSTEM],
        ['tabParenthMeasure', ParenthesizeTiedFret.START_OF_MEASURE],
        ['tabParenthNone', ParenthesizeTiedFret.NEVER],
    ]],
    ['firstSysLabels', [
        ['firstLongBtn', InstrumentLabelVisibility.LONG],
        ['firstShortBtn', InstrumentLabelVisibility.SHORT],
        ['firstHideBtn', InstrumentLabelVisibility.HIDE],
    ]],
    ['subsSysLabels', [
        ['subsLongBtn', InstrumentLabelVisibility.LONG],
        ['subsShortBtn', InstrumentLabelVisibility.SHORT],
        ['subsHideBtn', InstrumentLabelVisibility.HIDE],
    ]],
    ['singleMeasureMMRest', [['mmRestSingleUseHBar', 0], ['mmRestSingleUseNormalRest', 1]]],
    ['mmRestConstantWidth', [['mmRestWidthProportional', 0], ['mmRestWidthConstant', 1]]],
    ['dividerLeftAlignToSystemBarline', [['leftDividerAlignToSystemBarline', 1], ['leftDividerAlignToMargin', 0]]],
    ['dividerRightAlignToSystemBarline', [['rightDividerAlignToSystemBarline', 1], ['rightDividerAlignToPageMargin', 0]]],
])

/** EditStyle::LineStyleSelect: the line style combo box and the widgets only shown for dashed lines */
const LINE_STYLE_SELECTS: readonly (readonly [string, readonly string[]])[] = [
    ['ottavaLineStyle', [
        'label_ottava_lineStyle_dashSize', 'ottavaLineStyleDashSize', 'resetOttavaLineStyleDashSize',
        'label_ottava_lineStyle_gapSize', 'ottavaLineStyleGapSize', 'resetOttavaLineStyleGapSize',
    ]],
    ['pedalLineStyle', [
        'label_pedalLine_lineStyle_dashSize', 'pedalLineStyleDashSize', 'resetPedalLineStyleDashSize',
        'label_pedalLine_lineStyle_gapSize', 'pedalLineStyleGapSize', 'resetPedalLineStyleGapSize',
    ]],
    ['textLineLineStyle', [
        'label_textLineLine_lineStyle_dashSize', 'textLineLineStyleDashSize', 'resetTextLineLineStyleDashSize',
        'label_textLineLine_lineStyle_gapSize', 'textLineLineStyleGapSize', 'resetTextLineLineStyleGapSize',
    ]],
    ['systemTextLineLineStyle', [
        'label_systemTextLineLine_lineStyle_dashSize', 'systemTextLineLineStyleDashSize', 'resetSystemTextLineLineStyleDashSize',
        'label_systemTextLineLine_lineStyle_gapSize', 'systemTextLineLineStyleGapSize', 'resetSystemTextLineLineStyleGapSize',
    ]],
]

const LINE_STYLES: readonly TranslatableString[] = [
    //: line style
    new TranslatableString('notation/editstyle', 'Continuous'),
    //: line style
    new TranslatableString('notation/editstyle', 'Dashed'),
    //: line style
    new TranslatableString('notation/editstyle', 'Dotted'),
]

const VERTICAL_PLACEMENT_COMBO_BOXES: readonly string[] = [
    'lyricsPlacement',
    'textLinePlacement',
    'systemTextLinePlacement',
    'pedalLinePlacement',
    'trillLinePlacement',
    'vibratoLinePlacement',
    'tempoTextPlacement',
    'staffTextPlacement',
    'rehearsalMarkPlacement',
]

/** the text style widgets (TextStylePropertyType) and their reset buttons */
const TEXT_STYLE_WIDGETS: readonly (readonly [TextStylePropertyType, string, string])[] = [
    [TextStylePropertyType.FontFace, 'textStyleFontFace', 'resetTextStyleFontFace'],
    [TextStylePropertyType.FontSize, 'textStyleFontSize', 'resetTextStyleFontSize'],
    [TextStylePropertyType.MusicalSymbolsScale, 'textStyleMusicalSymbolsScale', 'resetTextStyleMusicalSymbolsScale'],
    [TextStylePropertyType.MusicalSymbolsSize, 'textStyleMusicalSymbolsSize', 'resetTextStyleMusicalSymbolsSize'],
    [TextStylePropertyType.LineSpacing, 'textStyleLineSpacing', 'resetTextStyleLineSpacing'],
    [TextStylePropertyType.FontStyle, 'textStyleFontStyle', 'resetTextStyleFontStyle'],
    [TextStylePropertyType.TextAlign, 'textStyleAlign', 'resetTextStyleAlign'],
    [TextStylePropertyType.Offset, 'textStyleOffset', 'resetTextStyleOffset'],
    [TextStylePropertyType.SizeSpatiumDependent, 'textStyleSpatiumDependent', 'resetTextStyleSpatiumDependent'],
    [TextStylePropertyType.FrameType, 'textStyleFrameType', 'resetTextStyleFrameType'],
    [TextStylePropertyType.FramePadding, 'textStyleFramePadding', 'resetTextStyleFramePadding'],
    [TextStylePropertyType.FrameWidth, 'textStyleFrameBorder', 'resetTextStyleFrameBorder'],
    [TextStylePropertyType.FrameRound, 'textStyleFrameBorderRadius', 'resetTextStyleFrameBorderRadius'],
    [TextStylePropertyType.FrameBorderColor, 'textStyleFrameForeground', 'resetTextStyleFrameForeground'],
    [TextStylePropertyType.FrameFillColor, 'textStyleFrameBackground', 'resetTextStyleFrameBackground'],
    [TextStylePropertyType.Color, 'textStyleColor', 'resetTextStyleColor'],
]

// ---------------------------------------------------------------------------------
//   the widgets
// ---------------------------------------------------------------------------------

/** the text of a .ui string (context "EditStyleBase") */
export function uiText(s: UiString | undefined): string {
    if (s === undefined) {
        return ''
    }
    if (typeof s === 'string') {
        return qtrc('EditStyleBase', s)
    }
    return s.notr ? s.s : qtrc('EditStyleBase', s.s, s.d ?? '')
}

/** an item of a combo box or list widget (text and user data) */
export interface ComboItem {
    text: TranslatableString
    data: PropertyValue | undefined
}

/** the state of a widget of the dialog (the properties of the Qt widget classes the dialog uses) */
export class WidgetState {
    enabled = true
    visible = true
    /** QSpinBox / QDoubleSpinBox */
    value = 0
    minimum = 0
    maximum = 99.99
    singleStep = 1
    decimals = 2
    /** an overridden suffix (setSuffix), else the one of the .ui */
    suffix: string | null = null
    /** QCheckBox, QRadioButton, checkable QGroupBox / QPushButton */
    checked = false
    /** QComboBox, QFontComboBox, QListWidget (current row) */
    currentIndex = -1
    items: ComboItem[] = []
    /** QLineEdit, QTextEdit; an overridden text of a QLabel (null: the .ui text) */
    text: string | null = null
    /** OffsetSelect */
    offset = new PointF()
    /** AlignSelect */
    align = new Align(AlignH.LEFT, AlignV.TOP)
    position = AlignH.LEFT
    /** FontStyleSelect */
    fontStyle = FontStyle.Normal
    /** Awl::ColorLabel */
    color = new Color(0, 0, 0)

    constructor(readonly ui: UiWidget, readonly parent: string | null) {}

    get cls(): string { return this.ui.c }
    currentData(): PropertyValue | undefined { return this.items[this.currentIndex]?.data }
    findData(data: PropertyValue | undefined): number { return this.items.findIndex(i => propertyValueEquals(i.data, data)) }
}

type Slot = () => void

interface WidgetInfo {
    ui: UiWidget
    parent: string | null
}

let s_widgetInfos: Map<string, WidgetInfo> | null = null

/** the widgets of editstyle.ui by object name, with their parent widgets */
function widgetInfos(): Map<string, WidgetInfo> {
    if (s_widgetInfos) {
        return s_widgetInfos
    }
    const infos = new Map<string, WidgetInfo>()
    const visit = (w: UiWidget, parent: string | null): void => {
        infos.set(w.n, { ui: w, parent })
        const visitLayout = (l: NonNullable<UiWidget['l']>): void => {
            for (const it of l.i) {
                if (it.w) {
                    visit(it.w, w.n)
                } else if (it.l) {
                    visitLayout(it.l)
                }
            }
        }
        if (w.l) {
            visitLayout(w.l)
        }
        for (const c of w.w ?? []) {
            visit(c, w.n)
        }
    }
    visit(PAGE_LIST, null)
    visit(PAGE_STACK, null)
    s_widgetInfos = infos
    return infos
}

/** the default state of a widget from the .ui (Qt's defaults for unset properties) */
function createWidgetState(name: string): WidgetState {
    const info = widgetInfos().get(name)
    if (!info) {
        throw new Error(`EditStyle: unknown widget ${name}`)
    }
    const w = new WidgetState(info.ui, info.parent)
    const p = info.ui.p ?? {}
    switch (info.ui.c) {
    case 'QSpinBox':
        w.decimals = 0
        w.maximum = 99
        break
    case 'QDoubleSpinBox':
        w.decimals = p.decimals ?? 2
        break
    case 'QGroupBox':
    case 'RadioButtonGroupBox':
        // QGroupBox::setCheckable(true) checks the group box
        w.checked = p.checkable ? p.checked ?? true : false
        break
    default:
        w.checked = p.checked ?? false
        break
    }
    w.minimum = p.minimum ?? w.minimum
    w.maximum = p.maximum ?? w.maximum
    w.singleStep = p.singleStep ?? w.singleStep
    w.value = Math.max(w.minimum, Math.min(w.maximum, p.value ?? 0))
    if (p.enabled === false) {
        w.enabled = false
    }
    if (info.ui.i) {
        w.items = info.ui.i.map(s => ({
            text: typeof s === 'string' ? new TranslatableString('EditStyleBase', s)
                : s.notr ? TranslatableString.untranslatable(s.s) : new TranslatableString('EditStyleBase', s.s, s.d ?? ''),
            data: undefined,
        }))
        w.currentIndex = info.ui.c === 'QListWidget' ? -1 : p.currentIndex ?? (w.items.length ? 0 : -1)
    }
    return w
}

/** the widgets that are in a QButtonGroup (name -> group) */
const s_buttonGroupOf = new Map<string, string>()
for (const [group, buttons] of BUTTON_GROUPS) {
    for (const [b] of buttons) {
        s_buttonGroupOf.set(b, group)
    }
}

const isRadio = (c: string): boolean => c === 'QRadioButton'
const isSpinBox = (c: string): boolean => c === 'QSpinBox' || c === 'QDoubleSpinBox'
const isComboBox = (c: string): boolean => c === 'QComboBox' || c === 'QFontComboBox'

// ---------------------------------------------------------------------------------
//   EditStyle
// ---------------------------------------------------------------------------------

/** the last shown page and text style (C++ configuration()->styleDialogLastPageIndex/LastSubPageIndex) */
let s_lastPageIndex = 0
let s_lastSubPageIndex = 0

export class EditStyle {
    private m_widgets = new Map<string, WidgetState>()
    private m_slots = new Map<string, Slot[]>()
    private m_clickSlots = new Map<string, Slot[]>()
    private m_blocked = new Set<string>()
    private m_listeners = new Set<() => void>()
    private m_currentPageCode = ''
    private m_currentSubPageCode = ''
    private m_pageListVisible = true

    constructor(private m_score: Score, private m_style: NotationStyle, private m_undoStack: NotationUndoStack) {
        // ====================================================
        // Combo Boxes
        // ====================================================

        for (const [cb, dashWidgets] of LINE_STYLE_SELECTS) {
            this.w(cb).items = LINE_STYLES.map((t, idx) => ({ text: t, data: idx as LineType }))
            this.connect(cb, () => {
                const isDash = this.w(cb).currentIndex === LineType.DASHED
                for (const name of dashWidgets) {
                    this.w(name).visible = isDash
                }
            })
        }

        for (const cb of VERTICAL_PLACEMENT_COMBO_BOXES) {
            this.w(cb).items = [
                { text: new TranslatableString('notation/editstyle', 'Above'), data: PlacementV.ABOVE },
                { text: new TranslatableString('notation/editstyle', 'Below'), data: PlacementV.BELOW },
            ]
        }

        this.w('tupletNumberType').items = [
            { text: new TranslatableString('notation/editstyle', 'Number'), data: TupletNumberType.SHOW_NUMBER },
            { text: new TranslatableString('notation/editstyle', 'Ratio'), data: TupletNumberType.SHOW_RELATION },
            { text: new TranslatableString('notation/editstyle', 'None', 'no tuplet number type'), data: TupletNumberType.NO_TEXT },
        ]

        this.w('tupletBracketType').items = [
            { text: new TranslatableString('notation/editstyle', 'Automatic'), data: TupletBracketType.AUTO_BRACKET },
            { text: new TranslatableString('notation/editstyle', 'Bracket'), data: TupletBracketType.SHOW_BRACKET },
            { text: new TranslatableString('notation/editstyle', 'None', 'no tuplet bracket type'), data: TupletBracketType.SHOW_NO_BRACKET },
        ]

        this.w('lyricsDashStartSystemPlacement').items = [
            { text: new TranslatableString('notation/editstyle', 'Standard'), data: LyricsDashSystemStart.STANDARD },
            { text: new TranslatableString('notation/editstyle', 'Inside the header'), data: LyricsDashSystemStart.UNDER_HEADER },
            { text: new TranslatableString('notation/editstyle', 'Under the first note'), data: LyricsDashSystemStart.UNDER_FIRST_NOTE },
        ]

        const symbolFonts: ComboItem[] = []
        const textFonts: ComboItem[] = []
        for (const f of engravingFonts().fonts()) {
            const fontDisplayName = f.name()
            const fontFamilyName = f.family()
            symbolFonts.push({ text: TranslatableString.untranslatable(fontDisplayName), data: fontDisplayName })
            // musicalTextFont must be a font family name!
            textFonts.push({ text: TranslatableString.untranslatable(fontDisplayName + ' Text'), data: fontFamilyName + ' Text' })
        }
        this.w('musicalSymbolFont').items = symbolFonts
        this.w('dynamicsFont').items = [...symbolFonts]
        this.w('musicalTextFont').items = textFonts

        const ids = [SymId.systemDivider, SymId.systemDividerLong, SymId.systemDividerExtraLong]
        const names = [
            new TranslatableString('engraving', 'Normal'),
            new TranslatableString('engraving', 'Long'),
            new TranslatableString('engraving', 'Extra long'),
        ]
        for (const cb of ['dividerLeftSym', 'dividerRightSym']) {
            this.w(cb).items = ids.map((id, i) => ({ text: names[i], data: SymNames.nameForSymId(id) }))
        }

        // ====================================================
        // Figured Bass
        // ====================================================

        this.w('comboFBFont').items = FiguredBass.fontNames().map(family => ({ text: TranslatableString.untranslatable(family), data: family }))
        this.w('comboFBFont').currentIndex = 0
        this.connect('comboFBFont', () => this.on_comboFBFont_currentIndexChanged(this.w('comboFBFont').currentIndex))

        // ====================================================
        // Miscellaneous
        // ====================================================

        this.connectClicked('enableVerticalSpread', () => this.enableVerticalSpreadClicked(this.w('enableVerticalSpread').checked))
        this.connectClicked('disableVerticalSpread', () => this.disableVerticalSpreadClicked(this.w('disableVerticalSpread').checked))
        this.connect('headerOddEven', () => this.toggleHeaderOddEven(this.w('headerOddEven').checked))
        this.connect('footerOddEven', () => this.toggleFooterOddEven(this.w('footerOddEven').checked))

        for (const radio of ['swingOff', 'swingEighth', 'swingSixteenth']) {
            this.connect(radio, () => this.setSwingParams(this.w(radio).checked))
        }

        this.connect('concertPitch', () => this.concertPitchToggled(this.w('concertPitch').checked))
        this.connect('lyricsDashMinLength', () => this.lyricsDashMinLengthValueChanged(this.w('lyricsDashMinLength').value))
        this.connect('lyricsDashMaxLength', () => this.lyricsDashMaxLengthValueChanged(this.w('lyricsDashMaxLength').value))
        this.connect('minSystemDistance', () => this.systemMinDistanceValueChanged(this.w('minSystemDistance').value))
        this.connect('maxSystemDistance', () => this.systemMaxDistanceValueChanged(this.w('maxSystemDistance').value))

        // ====================================================
        // Signal Mappers
        // ====================================================

        for (const sw of STYLE_WIDGETS) {
            const type = MStyle.valueType(sw.idx)

            if (type === P_TYPE.DIRECTION_V) {
                if (sw.idx === Sid.dynamicsHairpinVoiceBasedPlacement) {
                    this.fillDynamicHairpinComboBox(sw.widget)
                } else {
                    this.fillDirectionComboBox(sw.widget)
                }
            }

            if (sw.reset) {
                this.connectClicked(sw.reset, () => this.resetStyleValue(sw.idx))
            }

            const group = BUTTON_GROUPS.get(sw.widget)
            if (group) {
                // QButtonGroup::buttonClicked
                for (const [button] of group) {
                    this.connectClicked(button, () => this.valueChanged(sw.idx))
                }
            } else {
                this.connect(sw.widget, () => this.valueChanged(sw.idx))
            }
        }

        const textStyleItems: ComboItem[] = []
        for (const textStyleType of editableTextStyles()) {
            textStyleItems.push({ text: this.m_score.getTextStyleUserName(textStyleType), data: textStyleType })
        }
        this.w('textStyles').items = textStyleItems

        this.w('textStyleFrameType').items = [
            { text: new TranslatableString('notation/editstyle', 'None', 'no frame for text'), data: FrameType.NO_FRAME },
            { text: new TranslatableString('notation/editstyle', 'Rectangle'), data: FrameType.SQUARE },
            { text: new TranslatableString('notation/editstyle', 'Circle'), data: FrameType.CIRCLE },
        ]

        this.w('textStyleFontFace').items = this.fontFamilies().map(f => ({ text: TranslatableString.untranslatable(f), data: f }))

        this.connect('dynamicsAndHairpinPos', () => {
            this.w('dynamicsAndHairpinPosDescription').visible = this.w('dynamicsAndHairpinPos').currentIndex === DirectionV.AUTO
            this.w('dynamicsAndHairpinsAboveOnVocalStaves').enabled = this.w('dynamicsAndHairpinPos').currentIndex !== DirectionV.UP
        })

        this.connectClicked('resetTextStyleName', () => this.resetUserStyleName())
        this.connectClicked('styleName', () => this.editUserStyleName()) // textEdited

        for (const [type, widget, reset] of TEXT_STYLE_WIDGETS) {
            this.connectClicked(reset, () => {
                this.resetTextStyle(type)
                if (type === TextStylePropertyType.TextAlign) {
                    this.resetTextStyle(TextStylePropertyType.Position)
                }
            })
            this.connect(widget, () => this.textStyleValueChanged(type, this.textStyleWidgetValue(type)))
        }
        // AlignSelect::positionChanged
        this.connect('textStyleAlign#position', () => this.textStyleValueChanged(TextStylePropertyType.Position, this.w('textStyleAlign').position))

        this.connect('textStyles', () => this.textStyleChanged(this.w('textStyles').currentIndex))
        this.w('textStyles').currentIndex = Math.min(s_lastSubPageIndex, textStyleItems.length - 1)

        this.connect('pageList', () => {
            s_lastPageIndex = this.w('pageList').currentIndex
            this.m_currentPageCode = ALL_PAGE_CODES[s_lastPageIndex] ?? ''
        })
        this.w('pageList').currentIndex = s_lastPageIndex
        this.m_currentPageCode = ALL_PAGE_CODES[s_lastPageIndex]

        this.connectClicked('editLyricsTextStyleButton', () => {
            this.setCurrentIndex('pageList', ALL_PAGE_CODES.indexOf('text-styles'))
            this.setCurrentIndex('textStyles', ALL_TEXT_STYLE_SUBPAGE_CODES.indexOf('lyrics-odd-lines'))
        })

        this.connectClicked('resetLyricsMaxDashCount', () => {
            this.resetStyleValue(Sid.lyricsLimitDashCount)
            this.resetStyleValue(Sid.lyricsMaxDashCount)
        })

        this.connectClicked('resetStylesButton', () => this.on_resetStylesButton_clicked())
    }

    // ---------------------------------------------------------------------------------
    //   the widgets for the UI
    // ---------------------------------------------------------------------------------

    /** the state of a widget (by object name) */
    widget(name: string): WidgetState { return this.w(name) }

    /** the widget exists in editstyle.ui */
    static hasWidget(name: string): boolean { return widgetInfos().has(name) }

    /** a widget is enabled with all its parents (and checkable group boxes are checked) */
    isEnabledTo(name: string): boolean {
        for (let n: string | null = name; n; n = this.w(n).parent) {
            const st = this.w(n)
            if (!st.enabled) {
                return false
            }
            if (n !== name && (st.cls === 'QGroupBox' || st.cls === 'RadioButtonGroupBox') && st.ui.p?.checkable && !st.checked) {
                return false
            }
        }
        return true
    }

    /** a notification for the UI: widget states changed */
    onChanged(listener: () => void): () => void {
        this.m_listeners.add(listener)
        return () => this.m_listeners.delete(listener)
    }

    pageListVisible(): boolean { return this.m_pageListVisible }

    /** EditStyle::on_buttonTogglePagelist_clicked */
    on_buttonTogglePagelist_clicked(): void {
        this.m_pageListVisible = !this.m_pageListVisible
        this.notify()
    }

    /** QAbstractSpinBox: the value (clamped, rounded to the decimals) */
    setValue(name: string, v: number): void {
        const st = this.w(name)
        const f = 10 ** st.decimals
        const nv = Math.round(Math.max(st.minimum, Math.min(st.maximum, v)) * f) / f
        if (nv !== st.value) {
            st.value = nv
            this.emit(name)
        }
        this.notify()
    }

    /** the user toggled a check box, radio button, checkable group box or button (setChecked + clicked) */
    click(name: string, checked?: boolean): void {
        if (!EditStyle.hasWidget(name)) {
            // the buttons below the pages (resetStylesButton)
            for (const slot of this.m_clickSlots.get(name) ?? []) {
                slot()
            }
            this.notify()
            return
        }
        const st = this.w(name)
        const checkable = st.cls === 'QCheckBox' || isRadio(st.cls) || !!st.ui.p?.checkable
        if (checkable && checked !== undefined) {
            if (isRadio(st.cls) && !checked) {
                // a checked radio button cannot be unchecked by clicking it
            } else {
                this.setChecked(name, checked)
            }
        }
        for (const slot of this.m_clickSlots.get(name) ?? []) {
            slot()
        }
        this.notify()
    }

    /** QAbstractButton::setChecked (radio buttons are exclusive in their button group or parent widget) */
    setChecked(name: string, checked: boolean): void {
        const st = this.w(name)
        if (st.checked === checked) {
            return
        }
        st.checked = checked
        if (checked && isRadio(st.cls)) {
            const group = s_buttonGroupOf.get(name)
            const others = group
                ? BUTTON_GROUPS.get(group)!.map(([b]) => b)
                : [...this.m_widgets.values()].filter(w => isRadio(w.cls) && w.parent === st.parent && !s_buttonGroupOf.has(w.ui.n)).map(w => w.ui.n)
            for (const other of others) {
                if (other !== name && this.w(other).checked) {
                    this.w(other).checked = false
                    this.emit(other)
                }
            }
        }
        this.emit(name)
        this.notify()
    }

    /** QComboBox::setCurrentIndex, QListWidget::setCurrentRow */
    setCurrentIndex(name: string, index: number): void {
        const st = this.w(name)
        if (st.currentIndex !== index) {
            st.currentIndex = index
            this.emit(name)
        }
        this.notify()
    }

    /** QTextEdit::setPlainText / QLineEdit::setText (user edits: textChanged; QLineEdit: textEdited) */
    setText(name: string, text: string, byUser = true): void {
        const st = this.w(name)
        if (st.text !== text) {
            st.text = text
            if (byUser && st.cls === 'QLineEdit') {
                for (const slot of this.m_clickSlots.get(name) ?? []) {
                    slot()
                }
            }
            this.emit(name)
        }
        this.notify()
    }

    /** QLineEdit::editingFinished */
    editingFinished(name: string): void {
        if (name === 'styleName') {
            this.endEditUserStyleName()
        }
        this.notify()
    }

    setOffset(name: string, offset: PointF): void {
        const st = this.w(name)
        if (!st.offset.equals(offset)) {
            st.offset = offset.clone()
            this.emit(name)
        }
        this.notify()
    }

    /** AlignSelect: the text alignment (alignChanged) */
    setAlign(name: string, align: Align): void {
        const st = this.w(name)
        if (!st.align.equals(align)) {
            st.align = align.clone()
            this.emit(name)
        }
        this.notify()
    }

    /** AlignSelect: the position (positionChanged) */
    setPosition(name: string, position: AlignH): void {
        const st = this.w(name)
        if (st.position !== position) {
            st.position = position
            this.emit(`${name}#position`)
        }
        this.notify()
    }

    setFontStyle(name: string, fontStyle: FontStyle): void {
        const st = this.w(name)
        if (st.fontStyle !== fontStyle) {
            st.fontStyle = fontStyle
            this.emit(name)
        }
        this.notify()
    }

    setColor(name: string, color: Color): void {
        const st = this.w(name)
        if (!st.color.equals(color)) {
            st.color = color.clone()
            this.emit(name)
        }
        this.notify()
    }

    // ---------------------------------------------------------------------------------
    //   pages
    // ---------------------------------------------------------------------------------

    currentPageIndex(): number { return this.w('pageList').currentIndex }
    currentPageCode(): string { return this.m_currentPageCode }
    currentSubPageCode(): string { return this.m_currentSubPageCode }

    setCurrentPageCode(code: string): void {
        if (this.m_currentPageCode === code) {
            return
        }

        const index = ALL_PAGE_CODES.indexOf(code)
        if (index < 0) {
            return
        }

        this.setCurrentIndex('pageList', index)
        this.m_currentPageCode = code
    }

    setCurrentSubPageCode(code: string): void {
        if (this.m_currentSubPageCode === code) {
            return
        }

        if (this.m_currentPageCode !== 'text-styles') {
            return
        }

        const index = ALL_TEXT_STYLE_SUBPAGE_CODES.indexOf(code)
        if (index < 0) {
            return
        }

        this.setCurrentIndex('textStyles', index)
        this.m_currentSubPageCode = code
    }

    /** EditStyle::goToTextStylePage(QString code) and goToTextStylePage(int index) */
    goToTextStylePage(codeOrIndex: string | number): void {
        const subIndex = typeof codeOrIndex === 'number' ? codeOrIndex : ALL_TEXT_STYLE_SUBPAGE_CODES.indexOf(codeOrIndex)
        if (subIndex < 0 || subIndex >= ALL_TEXT_STYLE_SUBPAGE_CODES.length) {
            return
        }

        this.setCurrentIndex('pageList', ALL_PAGE_CODES.indexOf('text-styles'))
        this.m_currentPageCode = 'text-styles'

        this.setCurrentIndex('textStyles', subIndex)
        this.m_currentSubPageCode = ALL_TEXT_STYLE_SUBPAGE_CODES[subIndex]
    }

    // ---------------------------------------------------------------------------------
    //   the dialog
    // ---------------------------------------------------------------------------------

    /** EditStyle::showEvent */
    show(): void {
        this.setValues()
        this.m_undoStack.prepareChanges(new TranslatableString('undoableAction', 'Edit style'))
    }

    canApplyToAllParts(): boolean { return this.m_style.canApplyToAllParts() }

    applyToAllParts(): void { this.m_style.applyToAllParts() }

    /** EditStyle::accept */
    accept(): void {
        this.m_undoStack.commitChanges()
        this.m_style.styleChanged().notify()
    }

    /** EditStyle::reject */
    reject(): void {
        this.m_undoStack.rollbackChanges()
        this.m_style.styleChanged().notify()
    }

    /** EditStyle::setHeaderFooterMacroInfoText: the help text of the header/footer page (HTML) */
    headerFooterMacroInfoText(): string {
        const tr = (s: string): string => qtrc('notation/editstyle', s)
        const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const row = (macro: string, text: string): string => `<tr><td>${macro}</td><td width="12"/><td><i>${tr(text)}</i></td></tr>`
        // keep in sync with implementation in Page::replaceTextMacros (page.cpp)
        let toolTipHeaderFooter = '<html><head></head><body><p><b>'
            + tr('Using variables in the header/footer')
            + '</b><br/>'
            + tr('Type these special character combinations in the fields above to reference document data in the header/footer.')
            + '<br/></p><table>'
            + row('$p', 'Page number, except on first page')
            + row('$N', 'Page number, if there is more than one page')
            + row('$P', 'Page number, on all pages')
            + row('$n', 'Number of pages')
            + row('$f', 'File name')
            + row('$F', 'File path+name')
            + row('$i', 'Part name, except on first page')
            + row('$I', 'Part name, on all pages')
            + row('$d', 'Current date')
            + row('$D', 'Creation date')
            + row('$m', 'Last modification time')
            + row('$M', 'Last modification date')
            + row('$C', 'Copyright, on first page only')
            + row('$c', 'Copyright, on all pages')
            + row('$v', 'MuseScore Studio version this score was last saved with')
            + row('$r', 'MuseScore Studio revision this score was last saved with')
            + row('$$', 'The $ sign itself')
            + '</table><p>'
            + tr('<b>Metadata tags and current values</b> (configured in <b>File > Project properties…</b>)')
            + '<br>'
            + tr('Type $:tag: into a field above, replacing the word ‘tag’ with one of the labels below. Its associated metadata will be shown on your score.')
            + '<br/></p><table>'

        // show all tags for current score/part
        const tags = (m: ReadonlyMap<string, string>): void => {
            for (const [k, v] of m) {
                toolTipHeaderFooter += `<tr><td>${esc(k)}</td><td width="12"/><td><i>${v ? esc(v) : '-'}</i></td></tr>`
            }
        }
        if (!this.m_score.isMaster()) {
            tags(this.m_score.masterScore().metaTags())
        }
        tags(this.m_score.metaTags())

        toolTipHeaderFooter += '</table></body></html>'
        return toolTipHeaderFooter
    }

    // ---------------------------------------------------------------------------------
    //   the slots (editstyle.cpp)
    // ---------------------------------------------------------------------------------

    /** EditStyle::on_comboFBFont_currentIndexChanged */
    private on_comboFBFont_currentIndexChanged(index: number): void {
        const data = FiguredBass.fontData(index)
        if (data) {
            this.setValue('doubleSpinFBSize', data.size)
            this.setValue('spinFBLineHeight', Math.trunc(data.lineHeight * 100.0))
        }
    }

    /** EditStyle::on_resetStylesButton_clicked */
    private on_resetStylesButton_clicked(): void {
        const dontResetTheseStyles = new Set<Sid>([
            Sid.pageWidth,
            Sid.pageHeight,
            Sid.pagePrintableWidth,
            Sid.pageEvenTopMargin,
            Sid.pageEvenBottomMargin,
            Sid.pageEvenLeftMargin,
            Sid.pageOddTopMargin,
            Sid.pageOddBottomMargin,
            Sid.pageOddLeftMargin,
            Sid.pageTwosided,
            Sid.spatium,
            Sid.concertPitch,
            Sid.createMultiMeasureRests,
        ])

        this.m_style.resetAllStyleValues(dontResetTheseStyles)
        this.setValues()
    }

    static isBoolStyleRepresentedByButtonGroup(id: Sid): boolean {
        switch (id) {
        case Sid.articulationKeepTogether:
        case Sid.trillAlwaysShowCueNote:
        case Sid.genClef:
        case Sid.genKeysig:
        case Sid.singleMeasureMMRestUseNormalRest:
        case Sid.mmRestConstantWidth:
        case Sid.angleHangingSlursAwayFromStaff:
        case Sid.dividerLeftAlignToSystemBarline:
        case Sid.dividerRightAlignToSystemBarline:
            return true
        default:
            return false
        }
    }

    /** EditStyle::getValue: the current gui value */
    getValue(idx: Sid): PropertyValue {
        const sw = this.styleWidget(idx)
        const type = MStyle.valueType(idx)
        const group = BUTTON_GROUPS.get(sw.widget)
        const checkedId = (): number => group?.find(([b]) => this.w(b).checked)?.[1] ?? -1
        switch (type) {
        case P_TYPE.SPATIUM:
            return new Spatium(this.w(sw.widget).value * (sw.showPercent ? 0.01 : 1.0))
        case P_TYPE.REAL: {
            let value = this.w(sw.widget).value
            if (sw.showPercent) {
                value = value * 0.01
            }
            return value
        }
        case P_TYPE.BOOL: {
            if (EditStyle.isBoolStyleRepresentedByButtonGroup(idx)) { // special case for bool represented by a two-item buttonGroup
                return checkedId() !== 0
            } else if (sw.idx === Sid.lyricsDashForce || sw.idx === Sid.lyricsMelismaForce) { // special case where UI is presented with opposite wording
                return !this.w(sw.widget).checked
            }
            return this.w(sw.widget).checked
        }
        case P_TYPE.PLACEMENT_H:
        case P_TYPE.PLACEMENT_V:
        case P_TYPE.LINE_TYPE:
        case P_TYPE.TIMESIG_PLACEMENT:
        case P_TYPE.TIMESIG_STYLE:
        case P_TYPE.TIMESIG_MARGIN:
        case P_TYPE.INT: {
            if (group) {
                return checkedId()
            }
            const st = this.w(sw.widget)
            if (isComboBox(st.cls)) {
                return Number(st.currentData() ?? 0)
            } else if (st.cls === 'QSpinBox') {
                return Math.trunc(st.value / (sw.showPercent ? 100 : 1))
            } else if (st.cls === 'FontStyleSelect') {
                return st.fontStyle
            }
            return null
        }
        case P_TYPE.STRING: {
            const st = this.w(sw.widget)
            if (isComboBox(st.cls)) {
                return String(st.currentData() ?? '')
            }
            if (st.cls === 'QTextEdit') {
                return st.text ?? ''
            }
            return null
        }
        case P_TYPE.POINT: {
            if (idx === Sid.lyricsPosAbove || idx === Sid.lyricsPosBelow) {
                return new PointF(0.0, this.w(sw.widget).value)
            }
            return this.w(sw.widget).offset.clone()
        }
        case P_TYPE.DIRECTION_V:
            return this.w(sw.widget).currentIndex as DirectionV
        case P_TYPE.ALIGN:
            return this.w(sw.widget).align.clone()
        case P_TYPE.TIE_PLACEMENT:
            return checkedId()
        default:
            console.warn(`EditStyle::getValue: unhandled type <${type}>`)
            return null
        }
    }

    /** EditStyle::setValues: the style values into the widgets */
    setValues(): void {
        for (const sw of STYLE_WIDGETS) {
            this.m_blocked.add(sw.widget)
            const val: PropertyValue = sw.idx === Sid.lyricsPosAbove || sw.idx === Sid.lyricsPosBelow
                ? new Spatium((this.styleValue(sw.idx) as PointF).y())
                : this.styleValue(sw.idx)
            if (sw.reset) {
                this.w(sw.reset).enabled = !this.hasDefaultStyleValue(sw.idx)
            }

            const type = val instanceof Spatium ? P_TYPE.SPATIUM : MStyle.valueType(sw.idx)
            const group = BUTTON_GROUPS.get(sw.widget)
            const st = group ? new WidgetState({ c: 'QButtonGroup', n: sw.widget }, null) : this.w(sw.widget)
            switch (type) {
            case P_TYPE.SPATIUM: {
                const value = (val as Spatium).val()
                if (sw.showPercent) {
                    this.setValue(sw.widget, Math.trunc(value * 100.0))
                } else {
                    this.setValue(sw.widget, value)
                }
                break
            }
            case P_TYPE.REAL: {
                let value = val as number
                if (sw.showPercent) {
                    value = value * 100
                }
                this.setValue(sw.widget, st.cls === 'QSpinBox' ? Math.round(value) : value)
                break
            }
            case P_TYPE.BOOL: {
                const value = val as boolean
                if (EditStyle.isBoolStyleRepresentedByButtonGroup(sw.idx)) { // special case for bool represented by a two-item buttonGroup
                    this.setChecked(group!.find(([, id]) => id === 1)![0], value)
                    this.setChecked(group!.find(([, id]) => id === 0)![0], !value)
                } else if (sw.idx === Sid.lyricsDashForce || sw.idx === Sid.lyricsMelismaForce) { // special case where UI is presented with opposite wording
                    this.setChecked(sw.widget, !value)
                } else {
                    this.setChecked(sw.widget, value)
                }
                break
            }
            case P_TYPE.PLACEMENT_H:
            case P_TYPE.PLACEMENT_V:
            case P_TYPE.BARLINE_TYPE:
            case P_TYPE.LINE_TYPE:
            case P_TYPE.HOOK_TYPE:
            case P_TYPE.DYNAMIC_TYPE:
            case P_TYPE.ACCIDENTAL_ROLE:
            case P_TYPE.TIE_PLACEMENT:
            case P_TYPE.TIMESIG_PLACEMENT:
            case P_TYPE.TIMESIG_STYLE:
            case P_TYPE.TIMESIG_MARGIN:
            case P_TYPE.INT: {
                const value = Number(val)
                if (isComboBox(st.cls)) {
                    this.setCurrentIndex(sw.widget, st.findData(value))
                } else if (st.cls === 'QSpinBox') {
                    this.setValue(sw.widget, value * (sw.showPercent ? 100 : 1))
                } else if (group) {
                    const button = group.find(([, id]) => id === value)
                    if (button) {
                        this.setChecked(button[0], true)
                    }
                } else if (st.cls === 'FontStyleSelect') {
                    this.setFontStyle(sw.widget, value as FontStyle)
                } else {
                    this.unhandledType(sw)
                }
                break
            }
            case P_TYPE.STRING: {
                const value = String(val ?? '')
                if (isComboBox(st.cls)) {
                    const i = st.items.findIndex(it => it.data === value)
                    if (i >= 0) {
                        this.setCurrentIndex(sw.widget, i)
                    }
                } else if (st.cls === 'QTextEdit') {
                    this.setText(sw.widget, value, false)
                } else {
                    this.unhandledType(sw)
                }
                break
            }
            case P_TYPE.DIRECTION_V:
                this.setCurrentIndex(sw.widget, val as DirectionV)
                break
            case P_TYPE.ALIGN:
                this.setAlign(sw.widget, val as Align)
                break
            case P_TYPE.POINT:
                if (st.cls === 'OffsetSelect') {
                    this.setOffset(sw.widget, val as PointF)
                }
                break
            default:
                this.unhandledType(sw)
                break
            }

            this.m_blocked.delete(sw.widget)
        }

        this.textStyleChanged(this.w('textStyles').currentIndex)

        this.emit('dynamicsAndHairpinPos')
        this.w('resetDynamicsAndHairpinPos').enabled = !this.dynamicsAndHairpinPosPropertiesHaveDefaultStyleValue()

        //TODO: convert the rest:

        const unit = TConv.fromXmlDurationType(String(this.styleValue(Sid.swingUnit) ?? ''), DurationType.V_INVALID)

        if (unit === DurationType.V_EIGHTH) {
            this.setChecked('swingEighth', true)
            this.w('swingBox').enabled = true
        } else if (unit === DurationType.V_16TH) {
            this.setChecked('swingSixteenth', true)
            this.w('swingBox').enabled = true
        } else if (unit === DurationType.V_ZERO) {
            this.setChecked('swingOff', true)
            this.w('swingBox').enabled = false
        }

        // figured bass
        const fbFont = this.w('comboFBFont')
        for (let i = 0; i < fbFont.items.length; i++) {
            if (fbFont.items[i].data === this.styleValue(Sid.figuredBassFontFamily)) {
                this.setCurrentIndex('comboFBFont', i)
                break
            }
        }
        this.setValue('doubleSpinFBSize', this.styleValue(Sid.figuredBassFontSize) as number)
        this.setValue('doubleSpinFBVertPos', this.styleValue(Sid.figuredBassYOffset) as number)
        this.setValue('spinFBLineHeight', Math.round((this.styleValue(Sid.figuredBassLineHeight) as number) * 100.0))

        const mfont = String(this.styleValue(Sid.musicalSymbolFont)).toLowerCase()
        const dynFont = String(this.styleValue(Sid.dynamicsFont)).toLowerCase()
        const tfont = String(this.styleValue(Sid.musicalTextFont)).toLowerCase()
        let idx = 0
        for (const f of engravingFonts().fonts()) {
            if (f.name().toLowerCase() === mfont) {
                this.setCurrentIndex('musicalSymbolFont', idx)
            }
            if (f.name().toLowerCase() === dynFont) {
                this.setCurrentIndex('dynamicsFont', idx)
            }
            if ((f.family() + ' Text').toLowerCase() === tfont) {
                this.setCurrentIndex('musicalTextFont', idx)
            }
            ++idx
        }

        this.toggleHeaderOddEven(this.styleValue(Sid.headerOddEven) as boolean)
        this.toggleFooterOddEven(this.styleValue(Sid.footerOddEven) as boolean)
        this.setChecked('disableVerticalSpread', !(this.styleValue(Sid.enableVerticalSpread) as boolean))

        for (const [cb] of LINE_STYLE_SELECTS) {
            this.emit(cb, true)
        }

        this.w('singleMeasureMMRestOption').enabled = this.styleValue(Sid.minEmptyMeasures) === 1
        this.w('singleMMRestShowNumber').enabled = this.styleValue(Sid.singleMeasureMMRestUseNormalRest) as boolean
        this.w('mmRestSingleUseHBar').enabled = !(this.styleValue(Sid.oldStyleMultiMeasureRests) as boolean)
        this.w('mmRestRefDuration').enabled = this.styleValue(Sid.mmRestConstantWidth) as boolean

        this.updateLyricsDashCountWidgets()

        this.updateParenthesisIndicatingTiesGroupState()
        this.notify()
    }

    /** EditStyle::setSwingParams */
    private setSwingParams(checked: boolean): void {
        if (!checked) {
            return
        }
        let val = ''
        if (this.w('swingOff').checked) {
            val = TConv.toXmlDurationType(DurationType.V_ZERO)
            this.w('swingBox').enabled = false
        } else if (this.w('swingEighth').checked) {
            val = TConv.toXmlDurationType(DurationType.V_EIGHTH)
            this.w('swingBox').enabled = true
        } else if (this.w('swingSixteenth').checked) {
            val = TConv.toXmlDurationType(DurationType.V_16TH)
            this.w('swingBox').enabled = true
        }

        this.setStyleValue(Sid.swingUnit, val)
    }

    styleValue(id: Sid): PropertyValue { return this.m_style.styleValue(id) }
    defaultStyleValue(id: Sid): PropertyValue { return this.m_style.defaultStyleValue(id) }

    hasDefaultStyleValue(id: Sid): boolean {
        return propertyValueEquals(this.defaultStyleValue(id), this.styleValue(id))
    }

    private dynamicsAndHairpinPosPropertiesHaveDefaultStyleValue(): boolean {
        return this.hasDefaultStyleValue(Sid.dynamicsHairpinsAutoCenterOnGrandStaff)
            && this.hasDefaultStyleValue(Sid.dynamicsHairpinsAboveForVocalStaves)
            && this.hasDefaultStyleValue(Sid.dynamicsHairpinVoiceBasedPlacement)
    }

    setStyleValue(id: Sid, value: PropertyValue): void {
        this.m_style.setStyleValue(id, value)
    }

    /** EditStyle::concertPitchToggled */
    private concertPitchToggled(checked: boolean): void {
        this.setStyleValue(Sid.concertPitch, checked)
    }

    /** EditStyle::toggleHeaderOddEven */
    private toggleHeaderOddEven(checked: boolean): void {
        this.toggleOddEven('Header', checked)
    }

    /** EditStyle::toggleFooterOddEven */
    private toggleFooterOddEven(checked: boolean): void {
        this.toggleOddEven('Footer', checked)
    }

    private toggleOddEven(what: 'Header' | 'Footer', checked: boolean): void {
        if (!this.w(`show${what}`).checked) {
            return
        }
        this.w(`labelEven${what}`).enabled = checked
        this.w(`even${what}L`).enabled = checked
        this.w(`even${what}C`).enabled = checked
        this.w(`even${what}R`).enabled = checked
        const odd = uiText(this.w(`labelOdd${what}`).ui.p?.text)
        const even = uiText(this.w(`labelEven${what}`).ui.p?.text)
        if (checked) {
            this.w(`labelOdd${what}`).text = null // restore
        } else {
            this.w(`labelOdd${what}`).text = odd + '\n' + even // replace
        }
    }

    /** EditStyle::enableStyleWidget */
    enableStyleWidget(idx: Sid, enable: boolean): void {
        const sw = this.styleWidget(idx)
        this.w(sw.widget).enabled = enable
        if (sw.reset) {
            this.w(sw.reset).enabled = enable && !this.hasDefaultStyleValue(idx)
        }
    }

    /** EditStyle::enableVerticalSpreadClicked */
    private enableVerticalSpreadClicked(checked: boolean): void {
        if (checked) {
            this.setStyleValue(Sid.enableVerticalSpread, true)
            this.setChecked('disableVerticalSpread', false)
        } else {
            if (!this.w('disableVerticalSpread').checked) {
                this.setStyleValue(Sid.enableVerticalSpread, true)
                this.setChecked('enableVerticalSpread', true)
            }
        }
    }

    /** EditStyle::disableVerticalSpreadClicked */
    private disableVerticalSpreadClicked(checked: boolean): void {
        if (checked) {
            this.setStyleValue(Sid.enableVerticalSpread, false)
            this.setChecked('enableVerticalSpread', false)
        } else {
            if (!this.w('enableVerticalSpread').checked) {
                this.setStyleValue(Sid.enableVerticalSpread, false)
                this.setChecked('disableVerticalSpread', true)
            }
        }
    }

    /** Ensure lyricsDashMinLength <= lyricsDashMaxLength */
    private lyricsDashMaxLengthValueChanged(val: number): void {
        const otherVal = this.w('lyricsDashMinLength').value
        if (otherVal > val) {
            this.setValue('lyricsDashMaxLength', otherVal)
        }
    }

    private lyricsDashMinLengthValueChanged(val: number): void {
        const otherVal = this.w('lyricsDashMaxLength').value
        if (otherVal < val) {
            this.setValue('lyricsDashMinLength', otherVal)
        }
    }

    /** Ensure minSystemDistance <= maxSystemDistance */
    private systemMaxDistanceValueChanged(val: number): void {
        const otherVal = this.w('minSystemDistance').value
        if (otherVal > val) {
            this.setValue('maxSystemDistance', otherVal)
        }
    }

    private systemMinDistanceValueChanged(val: number): void {
        const otherVal = this.w('maxSystemDistance').value
        if (otherVal < val) {
            this.setValue('minSystemDistance', otherVal)
        }
    }

    styleWidget(idx: Sid): StyleWidget {
        const sw = STYLE_WIDGETS.find(s => s.idx === idx)
        if (!sw) {
            throw new Error(`EditStyle: no widget for style ${Sid[idx]}`)
        }
        return sw
    }

    /** EditStyle::valueChanged */
    valueChanged(idx: Sid): void {
        const val = this.getValue(idx)
        let setValue = false
        if (idx === Sid.musicalSymbolFont) {
            const overrideDynamicsFont = this.getValue(Sid.dynamicsOverrideFont) as boolean
            if (!overrideDynamicsFont) {
                this.setStyleValue(Sid.dynamicsFont, val) // Match dynamics font
            }
            if (this.w('optimizeStyleCheckbox').checked) {
                const scoreFont = engravingFonts().fontByName(String(val))
                if (scoreFont) {
                    for (const [sid, v] of scoreFont.engravingDefaults()) {
                        this.setStyleValue(sid, v)
                    }
                }
                setValue = true
            }
        }

        this.setStyleValue(idx, val)
        if (setValue) {
            this.setValues()
        }
        const sw = this.styleWidget(idx)
        if (sw.reset) {
            this.w(sw.reset).enabled = !this.hasDefaultStyleValue(idx)
        }

        if (idx === Sid.dynamicsHairpinVoiceBasedPlacement || idx === Sid.dynamicsHairpinsAutoCenterOnGrandStaff
            || idx === Sid.dynamicsHairpinsAboveForVocalStaves) {
            this.w('resetDynamicsAndHairpinPos').enabled = !this.dynamicsAndHairpinPosPropertiesHaveDefaultStyleValue()
        }

        if (idx === Sid.minEmptyMeasures) {
            this.w('singleMeasureMMRestOption').enabled = this.styleValue(Sid.minEmptyMeasures) === 1
        }
        if (idx === Sid.singleMeasureMMRestUseNormalRest) {
            this.w('singleMMRestShowNumber').enabled = this.styleValue(Sid.singleMeasureMMRestUseNormalRest) as boolean
        }
        if (idx === Sid.mmRestConstantWidth) {
            this.w('mmRestRefDuration').enabled = this.styleValue(Sid.mmRestConstantWidth) as boolean
        }
        if (idx === Sid.oldStyleMultiMeasureRests) {
            const useOldStyle = this.styleValue(Sid.oldStyleMultiMeasureRests) as boolean
            if (useOldStyle && !(this.styleValue(Sid.singleMeasureMMRestUseNormalRest) as boolean)) {
                this.setStyleValue(Sid.singleMeasureMMRestUseNormalRest, true)
                this.setValues()
            }
            this.w('mmRestSingleUseHBar').enabled = !useOldStyle
        }

        if (idx === Sid.lyricsLimitDashCount || idx === Sid.lyricsMaxDashCount) {
            this.updateLyricsDashCountWidgets()
        }

        if (idx === Sid.tabShowTiedFret) {
            this.updateParenthesisIndicatingTiesGroupState()
        }
    }

    private updateLyricsDashCountWidgets(): void {
        const limit = this.styleValue(Sid.lyricsLimitDashCount) as boolean
        this.w('lyricsMaxDashCount').enabled = limit
        this.w('resetLyricsMaxDashCount').enabled = !this.hasDefaultStyleValue(Sid.lyricsLimitDashCount)
            || !this.hasDefaultStyleValue(Sid.lyricsMaxDashCount)
        this.w('lyricsDashMaxDistance').enabled = !limit || (this.styleValue(Sid.lyricsMaxDashCount) as number) > 1
        this.w('resetLyricsDashMaxDistance').enabled = this.w('lyricsDashMaxDistance').enabled
            && !this.hasDefaultStyleValue(Sid.lyricsDashMaxDistance)
    }

    /** EditStyle::resetStyleValue */
    resetStyleValue(idx: Sid): void {
        this.setStyleValue(idx, this.defaultStyleValue(idx))
        if (idx === Sid.dynamicsHairpinVoiceBasedPlacement) {
            for (const id of [Sid.dynamicsHairpinsAutoCenterOnGrandStaff, Sid.dynamicsHairpinsAboveForVocalStaves]) {
                this.setStyleValue(id, this.defaultStyleValue(id))
            }
        }
        this.setValues()
    }

    private currentTextStyleType(row = this.w('textStyles').currentIndex): TextStyleType {
        return this.w('textStyles').items[row]?.data as TextStyleType
    }

    /** EditStyle::textStyleChanged: the widgets of the text style */
    private textStyleChanged(row: number): void {
        const tid = this.currentTextStyleType(row)
        const ts = textStyle(tid)
        if (!ts) {
            return
        }
        const block = (name: string, f: () => void): void => {
            // the widgets are updated without signals (C++: the slots compare with the style and do nothing)
            this.m_blocked.add(name)
            f()
            this.m_blocked.delete(name)
        }
        const differs = (sid: Sid): boolean => !this.hasDefaultStyleValue(sid)
        const findSid = (type: TextStylePropertyType): Sid | undefined => ts.find(p => p.type === type)?.sid

        for (const a of ts) {
            switch (a.type) {
            case TextStylePropertyType.FontFace: {
                const val = String(this.styleValue(a.sid))
                const ff = this.w('textStyleFontFace')
                if (!ff.items.some(i => i.data === val)) {
                    ff.items = [...ff.items, { text: TranslatableString.untranslatable(val), data: val }]
                        .sort((x, y) => String(x.data).localeCompare(String(y.data)))
                }
                block('textStyleFontFace', () => this.setCurrentIndex('textStyleFontFace', ff.findData(val)))
                this.w('resetTextStyleFontFace').enabled = differs(a.sid)
                break
            }
            case TextStylePropertyType.FontSize:
                block('textStyleFontSize', () => this.setValue('textStyleFontSize', this.styleValue(a.sid) as number))
                this.w('resetTextStyleFontSize').enabled = differs(a.sid)
                break
            case TextStylePropertyType.LineSpacing:
                block('textStyleLineSpacing', () => this.setValue('textStyleLineSpacing', this.styleValue(a.sid) as number))
                this.w('resetTextStyleLineSpacing').enabled = differs(a.sid)
                break
            case TextStylePropertyType.MusicalSymbolsScale:
                block('textStyleMusicalSymbolsScale', () => this.setValue('textStyleMusicalSymbolsScale', (this.styleValue(a.sid) as number) * 100))
                this.w('resetTextStyleMusicalSymbolsScale').enabled = differs(a.sid)
                break
            case TextStylePropertyType.MusicalSymbolsSize:
                block('textStyleMusicalSymbolsSize', () => this.setValue('textStyleMusicalSymbolsSize', this.styleValue(a.sid) as number))
                this.w('resetTextStyleMusicalSymbolsSize').enabled = differs(a.sid)
                break
            case TextStylePropertyType.FontStyle:
                block('textStyleFontStyle', () => this.setFontStyle('textStyleFontStyle', this.styleValue(a.sid) as FontStyle))
                this.w('resetTextStyleFontStyle').enabled = differs(a.sid)
                break
            case TextStylePropertyType.TextAlign: {
                block('textStyleAlign', () => this.setAlign('textStyleAlign', this.styleValue(a.sid) as Align))
                const pos = findSid(TextStylePropertyType.Position)
                this.w('resetTextStyleAlign').enabled = differs(a.sid) || (pos !== undefined && differs(pos)) // OR Position is modified
                break
            }
            case TextStylePropertyType.Position: {
                this.w('textStyleAlign').position = this.styleValue(a.sid) as AlignH
                const align = findSid(TextStylePropertyType.TextAlign)
                this.w('resetTextStyleAlign').enabled = differs(a.sid) || (align !== undefined && differs(align)) // OR TextAlign is modified
                break
            }
            case TextStylePropertyType.Offset:
                block('textStyleOffset', () => this.setOffset('textStyleOffset', this.styleValue(a.sid) as PointF))
                this.w('resetTextStyleOffset').enabled = differs(a.sid)
                break
            case TextStylePropertyType.SizeSpatiumDependent: {
                const val = this.styleValue(a.sid) as boolean
                block('textStyleSpatiumDependent', () => this.setChecked('textStyleSpatiumDependent', val))
                this.w('resetTextStyleSpatiumDependent').enabled = differs(a.sid)
                this.w('textStyleOffset').suffix = val ? qtrc('global', 'sp') : qtrc('global', 'mm')
                break
            }
            case TextStylePropertyType.FrameType:
                block('textStyleFrameType', () => this.setCurrentIndex('textStyleFrameType', this.styleValue(a.sid) as number))
                this.w('resetTextStyleFrameType').enabled = differs(a.sid)
                this.w('frameWidget').enabled = this.styleValue(a.sid) !== 0 // disable if no frame
                break
            case TextStylePropertyType.FramePadding:
                block('textStyleFramePadding', () => this.setValue('textStyleFramePadding', this.styleValue(a.sid) as number))
                this.w('resetTextStyleFramePadding').enabled = differs(a.sid)
                break
            case TextStylePropertyType.FrameWidth:
                block('textStyleFrameBorder', () => this.setValue('textStyleFrameBorder', this.styleValue(a.sid) as number))
                this.w('resetTextStyleFrameBorder').enabled = differs(a.sid)
                break
            case TextStylePropertyType.FrameRound:
                block('textStyleFrameBorderRadius', () => this.setValue('textStyleFrameBorderRadius', this.styleValue(a.sid) as number))
                this.w('resetTextStyleFrameBorderRadius').enabled = differs(a.sid)
                break
            case TextStylePropertyType.FrameBorderColor:
                block('textStyleFrameForeground', () => this.setColor('textStyleFrameForeground', this.styleValue(a.sid) as Color))
                this.w('resetTextStyleFrameForeground').enabled = differs(a.sid)
                break
            case TextStylePropertyType.FrameFillColor:
                block('textStyleFrameBackground', () => this.setColor('textStyleFrameBackground', this.styleValue(a.sid) as Color))
                this.w('resetTextStyleFrameBackground').enabled = differs(a.sid)
                break
            case TextStylePropertyType.Color:
                block('textStyleColor', () => this.setColor('textStyleColor', this.styleValue(a.sid) as Color))
                this.w('resetTextStyleColor').enabled = differs(a.sid)
                break
            default:
                break
            }
        }

        const name = this.m_score.getTextStyleUserName(tid).translated()
        block('styleName', () => this.setText('styleName', name, false))
        this.w('styleName').enabled = tid >= TextStyleType.USER1
        this.w('resetTextStyleName').enabled = name !== TConv.userNameTextStyleType(tid).translated()

        this.w('tupletUseSymbols').visible = tid === TextStyleType.TUPLET
        this.w('resetTupletUseSymbols').visible = tid === TextStyleType.TUPLET

        s_lastSubPageIndex = row
        this.m_currentSubPageCode = ALL_TEXT_STYLE_SUBPAGE_CODES[row] ?? ''
    }

    /** the value of a text style widget (the arguments of the connected lambdas) */
    private textStyleWidgetValue(type: TextStylePropertyType): PropertyValue {
        switch (type) {
        case TextStylePropertyType.FontFace: return String(this.w('textStyleFontFace').currentData() ?? '')
        case TextStylePropertyType.FontSize: return this.w('textStyleFontSize').value
        case TextStylePropertyType.MusicalSymbolsScale: return this.w('textStyleMusicalSymbolsScale').value
        case TextStylePropertyType.MusicalSymbolsSize: return this.w('textStyleMusicalSymbolsSize').value
        case TextStylePropertyType.LineSpacing: return this.w('textStyleLineSpacing').value
        case TextStylePropertyType.FontStyle: return this.w('textStyleFontStyle').fontStyle
        case TextStylePropertyType.TextAlign: return this.w('textStyleAlign').align.clone()
        case TextStylePropertyType.Offset: return this.w('textStyleOffset').offset.clone()
        case TextStylePropertyType.SizeSpatiumDependent: return this.w('textStyleSpatiumDependent').checked
        case TextStylePropertyType.FrameType: return this.w('textStyleFrameType').currentIndex
        case TextStylePropertyType.FramePadding: return this.w('textStyleFramePadding').value
        case TextStylePropertyType.FrameWidth: return this.w('textStyleFrameBorder').value
        case TextStylePropertyType.FrameRound: return this.w('textStyleFrameBorderRadius').value
        case TextStylePropertyType.FrameBorderColor: return this.w('textStyleFrameForeground').color.clone()
        case TextStylePropertyType.FrameFillColor: return this.w('textStyleFrameBackground').color.clone()
        case TextStylePropertyType.Color: return this.w('textStyleColor').color.clone()
        default: return null
        }
    }

    /** EditStyle::textStyleValueChanged */
    private textStyleValueChanged(type: TextStylePropertyType, value: PropertyValue): void {
        const ts = textStyle(this.currentTextStyleType())
        for (const a of ts ?? []) {
            if (a.type === type) {
                if (type === TextStylePropertyType.MusicalSymbolsScale) {
                    this.setStyleValue(a.sid, (value as number) / 100)
                } else {
                    this.setStyleValue(a.sid, value)
                }
                break
            }
        }
        this.textStyleChanged(this.w('textStyles').currentIndex) // update GUI (reset buttons)
    }

    /** EditStyle::resetTextStyle */
    private resetTextStyle(type: TextStylePropertyType): void {
        const ts = textStyle(this.currentTextStyleType())
        for (const a of ts ?? []) {
            if (a.type === type) {
                this.setStyleValue(a.sid, this.defaultStyleValue(a.sid))
                break
            }
        }
        this.textStyleChanged(this.w('textStyles').currentIndex) // update GUI
    }

    /** EditStyle::editUserStyleName (the item of the list shows the edited name) */
    private editUserStyleName(): void {
        const tid = this.currentTextStyleType()
        const text = this.w('styleName').text ?? ''
        const item = this.w('textStyles').items[this.w('textStyles').currentIndex]
        if (item) {
            item.text = TranslatableString.untranslatable(text)
        }
        this.w('resetTextStyleName').enabled = text !== TConv.userNameTextStyleType(tid).translated()
    }

    /** EditStyle::endEditUserStyleName */
    private endEditUserStyleName(): void {
        const row = this.w('textStyles').currentIndex
        const tid = this.currentTextStyleType(row)
        const idx = tid - TextStyleType.USER1
        if (tid < TextStyleType.USER1 || tid > TextStyleType.USER12) {
            return
        }
        const sid = [Sid.user1Name, Sid.user2Name, Sid.user3Name, Sid.user4Name, Sid.user5Name, Sid.user6Name,
            Sid.user7Name, Sid.user8Name, Sid.user9Name, Sid.user10Name, Sid.user11Name, Sid.user12Name]
        const name = this.w('styleName').text ?? ''
        this.setStyleValue(sid[idx], name)
        const item = this.w('textStyles').items[row]
        if (name === '') {
            this.setText('styleName', TConv.userNameTextStyleType(tid).translated(), false)
            this.w('resetTextStyleName').enabled = false
        }
        if (item) {
            item.text = this.m_score.getTextStyleUserName(tid)
        }
    }

    /** EditStyle::resetUserStyleName */
    private resetUserStyleName(): void {
        this.setText('styleName', '', false)
        this.endEditUserStyleName()
    }

    /** EditStyle::updateParenthesisIndicatingTiesGroupState */
    private updateParenthesisIndicatingTiesGroupState(): void {
        this.w('tieParen').enabled = this.w('tabShowTies').checked || this.w('tabShowNone').checked
    }

    private unhandledType(sw: StyleWidget): void {
        console.warn(`EditStyle: unhandled type ${MStyle.valueType(sw.idx)} <${MStyle.valueName(sw.idx)}>: widget: ${this.w(sw.widget).cls}`)
    }

    private fillDirectionComboBox(name: string): void {
        this.w(name).items = [
            { text: new TranslatableString('engraving', 'Auto'), data: DirectionV.AUTO },
            { text: new TranslatableString('engraving', 'Up'), data: DirectionV.UP },
            { text: new TranslatableString('engraving', 'Down'), data: DirectionV.DOWN },
        ]
    }

    private fillDynamicHairpinComboBox(name: string): void {
        this.w(name).items = [
            { text: new TranslatableString('notation/editstyle', 'Based on voice'), data: DirectionV.AUTO },
            { text: new TranslatableString('notation/editstyle', 'Above'), data: DirectionV.UP },
            { text: new TranslatableString('notation/editstyle', 'Below'), data: DirectionV.DOWN },
        ]
    }

    /** the font families of the text style's font combo box (QFontComboBox: the system fonts) */
    private fontFamilies(): string[] {
        return fontsDatabase().families().sort((a, b) => a.localeCompare(b))
    }

    // ---------------------------------------------------------------------------------
    //   signals and slots
    // ---------------------------------------------------------------------------------

    private w(name: string): WidgetState {
        let st = this.m_widgets.get(name)
        if (!st) {
            st = createWidgetState(name)
            this.m_widgets.set(name, st)
        }
        return st
    }

    /** a slot for the value change signal of a widget (valueChanged, toggled, currentIndexChanged, ...) */
    private connect(name: string, slot: Slot): void {
        const list = this.m_slots.get(name) ?? []
        list.push(slot)
        this.m_slots.set(name, list)
    }

    /** a slot for the user's click on a button (clicked, QButtonGroup::buttonClicked, QLineEdit::textEdited) */
    private connectClicked(name: string, slot: Slot): void {
        const list = this.m_clickSlots.get(name) ?? []
        list.push(slot)
        this.m_clickSlots.set(name, list)
    }

    private emit(name: string, force = false): void {
        if (!force && this.m_blocked.has(name.replace(/#.*/, ''))) {
            return
        }
        for (const slot of this.m_slots.get(name) ?? []) {
            slot()
        }
    }

    private notify(): void {
        for (const l of this.m_listeners) {
            l()
        }
    }
}
