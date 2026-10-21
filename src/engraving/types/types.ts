/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/types/types.h and the constants of src/engraving/dom/mscore.h
 */

export type staff_idx_t = number
export type track_idx_t = number
export type voice_idx_t = number
export type system_idx_t = number
export type part_idx_t = number
export type page_idx_t = number

/** muse::nidx (invalid index) */
export const nidx = -1

export enum ElementType {
    INVALID = 0,
    BRACKET_ITEM,
    PART,
    STAFF,
    SCORE,
    TEXT,
    LAYOUT_BREAK,
    MEASURE_NUMBER,
    MMREST_RANGE,
    INSTRUMENT_NAME,
    BAR_LINE,
    STAFF_LINES,
    SYSTEM_DIVIDER,
    SLUR,
    SLUR_SEGMENT,
    TIE,
    TIE_SEGMENT,
    LAISSEZ_VIB,
    LAISSEZ_VIB_SEGMENT,
    PARTIAL_TIE,
    PARTIAL_TIE_SEGMENT,
    STEM_SLASH,
    ARPEGGIO,
    CHORD_BRACKET,
    ACCIDENTAL,
    LEDGER_LINE,
    STEM,
    HOOK,
    NOTE,
    CLEF,
    KEYSIG,
    AMBITUS,
    TIMESIG,
    REST,
    MMREST,
    DEAD_SLAPPED,
    SYMBOL,
    BREATH,
    MEASURE_REPEAT,
    ARTICULATION,
    ORNAMENT,
    FERMATA,
    CHORDLINE,
    DYNAMIC,
    EXPRESSION,
    BEAM,
    LYRICS,
    FIGURED_BASS,
    FIGURED_BASS_ITEM,
    MARKER,
    JUMP,
    FINGERING,
    TUPLET,
    TEMPO_TEXT,
    STAFF_TEXT,
    SYSTEM_TEXT,
    SOUND_FLAG,
    PLAY_COUNT_TEXT,
    PLAYTECH_ANNOTATION,
    CAPO,
    STRING_TUNINGS,
    TRIPLET_FEEL,
    REHEARSAL_MARK,
    INSTRUMENT_CHANGE,
    STAFFTYPE_CHANGE,
    FRET_DIAGRAM,
    HARMONY,
    HARP_DIAGRAM,
    BEND,
    TREMOLOBAR,
    VOLTA,
    VOLTA_SEGMENT,
    HAIRPIN,
    HAIRPIN_SEGMENT,
    OTTAVA,
    OTTAVA_SEGMENT,
    TRILL,
    TRILL_SEGMENT,
    LET_RING,
    LET_RING_SEGMENT,
    GRADUAL_TEMPO_CHANGE,
    GRADUAL_TEMPO_CHANGE_SEGMENT,
    VIBRATO,
    VIBRATO_SEGMENT,
    PALM_MUTE,
    PALM_MUTE_SEGMENT,
    WHAMMY_BAR,
    WHAMMY_BAR_SEGMENT,
    RASGUEADO,
    RASGUEADO_SEGMENT,
    HARMONIC_MARK,
    HARMONIC_MARK_SEGMENT,
    PICK_SCRAPE,
    PICK_SCRAPE_SEGMENT,
    TEXTLINE,
    TEXTLINE_SEGMENT,
    PEDAL,
    PEDAL_SEGMENT,
    LYRICSLINE,
    LYRICSLINE_SEGMENT,
    PARTIAL_LYRICSLINE,
    PARTIAL_LYRICSLINE_SEGMENT,
    GLISSANDO,
    GLISSANDO_SEGMENT,
    NOTELINE,
    NOTELINE_SEGMENT,
    STAFF_VISIBILITY_INDICATOR,
    SYSTEM_LOCK_INDICATOR,
    SPACER,
    STAFF_STATE,
    NOTEHEAD,
    NOTEDOT,
    IMAGE,
    MEASURE,
    SELECTION,
    LASSO,
    SHADOW_NOTE,
    TAB_DURATION_SYMBOL,
    FSYMBOL,
    PAGE,
    TEXTLINE_BASE,
    BRACKET,
    SEGMENT,
    SYSTEM,
    CHORD,
    HBOX,
    VBOX,
    TBOX,
    FBOX,
    ACTION_ICON,
    BAGPIPE_EMBELLISHMENT,
    STICKING,
    GRACE_NOTES_GROUP,
    GUITAR_BEND,
    GUITAR_BEND_SEGMENT,
    GUITAR_BEND_HOLD,
    GUITAR_BEND_HOLD_SEGMENT,
    GUITAR_BEND_TEXT,
    TREMOLO_TWOCHORD,
    TREMOLO_SINGLECHORD,
    TIME_TICK_ANCHOR,
    PARENTHESIS,
    HAMMER_ON_PULL_OFF,
    HAMMER_ON_PULL_OFF_SEGMENT,
    HAMMER_ON_PULL_OFF_TEXT,
    TAPPING,
    TAPPING_HALF_SLUR,
    TAPPING_HALF_SLUR_SEGMENT,
    TAPPING_TEXT,
    ROOT_ITEM,
    DUMMY,
    MAXTYPE,
}

export enum OrnamentStyle {
    DEFAULT,
    BAROQUE,
}

export enum GlissandoStyle {
    CHROMATIC,
    WHITE_KEYS,
    BLACK_KEYS,
    DIATONIC,
    PORTAMENTO,
}

export enum AlignV {
    TOP,
    VCENTER,
    BOTTOM,
    BASELINE,
}

export enum AlignH {
    LEFT,
    RIGHT,
    HCENTER,
    JUSTIFY,
}

export enum PlacementV {
    ABOVE,
    BELOW,
}

export enum PlacementH {
    LEFT,
    CENTER,
    RIGHT,
}

export enum TextPlace {
    AUTO,
    ABOVE,
    BELOW,
    LEFT,
}

export enum DirectionV {
    AUTO,
    UP,
    DOWN,
}

export enum DirectionH {
    AUTO,
    LEFT,
    RIGHT,
}

export enum Orientation {
    VERTICAL,
    HORIZONTAL,
}

export enum AutoOnOff {
    AUTO,
    ON,
    OFF,
}

export enum AutoCustomHide {
    AUTO,
    CUSTOM,
    HIDE,
}

export enum VoiceAssignment {
    ALL_VOICE_IN_INSTRUMENT,
    ALL_VOICE_IN_STAFF,
    CURRENT_VOICE_ONLY,
}

export enum BeamMode {
    INVALID = -1,
    AUTO,
    NONE,
    BEGIN,
    BEGIN16,
    BEGIN32,
    MID,
    END,
}

export enum DurationType {
    V_LONG,
    V_BREVE,
    V_WHOLE,
    V_HALF,
    V_QUARTER,
    V_EIGHTH,
    V_16TH,
    V_32ND,
    V_64TH,
    V_128TH,
    V_256TH,
    V_512TH,
    V_1024TH,
    V_ZERO,
    V_MEASURE,
    V_INVALID,
}

export enum LayoutBreakType {
    PAGE,
    LINE,
    SECTION,
    NOBREAK,
}

export enum VeloType {
    OFFSET_VAL,
    USER_VAL,
}

export enum BarLineType {
    NORMAL           = 1,
    SINGLE           = NORMAL,
    DOUBLE           = 2,
    START_REPEAT     = 4,
    LEFT_REPEAT      = START_REPEAT,
    END_REPEAT       = 8,
    RIGHT_REPEAT     = END_REPEAT,
    BROKEN           = 0x10,
    DASHED           = BROKEN,
    END              = 0x20,
    FINAL            = END,
    END_START_REPEAT = 0x40,
    LEFT_RIGHT_REPEAT= END_START_REPEAT,
    DOTTED           = 0x80,
    REVERSE_END      = 0x100,
    REVERSE_FINALE   = REVERSE_END,
    HEAVY            = 0x200,
    DOUBLE_HEAVY     = 0x400,
}

export enum MeasureNumberPlacement {
    ABOVE_SYSTEM,
    BELOW_SYSTEM,
    ON_SYSTEM_OBJECT_STAVES,
    ON_ALL_STAVES,
}

export enum NoteHeadType {
    HEAD_AUTO    = -1,
    HEAD_WHOLE   = 0,
    HEAD_HALF    = 1,
    HEAD_QUARTER = 2,
    HEAD_BREVIS  = 3,
    HEAD_TYPES,
}

export enum NoteHeadScheme {
    HEAD_AUTO = -1,
    HEAD_NORMAL,
    HEAD_PITCHNAME,
    HEAD_PITCHNAME_NO_ACCIDENTALS,
    HEAD_PITCHNAME_GERMAN,
    HEAD_PITCHNAME_GERMAN_NO_ACCIDENTALS,
    HEAD_SOLFEGE,
    HEAD_SOLFEGE_FIXED,
    HEAD_SHAPE_NOTE_4,
    HEAD_SHAPE_NOTE_7_AIKIN,
    HEAD_SHAPE_NOTE_7_FUNK,
    HEAD_SHAPE_NOTE_7_WALKER,
    HEAD_SCHEMES,
}

export enum NoteHeadGroup {
    HEAD_NORMAL = 0,
    HEAD_CROSS,
    HEAD_PLUS,
    HEAD_XCIRCLE,
    HEAD_WITHX,
    HEAD_TRIANGLE_UP,
    HEAD_TRIANGLE_DOWN,
    HEAD_SLASHED1,
    HEAD_SLASHED2,
    HEAD_DIAMOND,
    HEAD_DIAMOND_OLD,
    HEAD_CIRCLED,
    HEAD_CIRCLED_LARGE,
    HEAD_LARGE_ARROW,
    HEAD_BREVIS_ALT,
    HEAD_SLASH,
    HEAD_LARGE_DIAMOND,
    HEAD_SOL,
    HEAD_LA,
    HEAD_FA,
    HEAD_MI,
    HEAD_DO,
    HEAD_RE,
    HEAD_TI,
    HEAD_HEAVY_CROSS,
    HEAD_HEAVY_CROSS_HAT,
    HEAD_DO_WALKER,
    HEAD_RE_WALKER,
    HEAD_TI_WALKER,
    HEAD_DO_FUNK,
    HEAD_RE_FUNK,
    HEAD_TI_FUNK,
    HEAD_DO_NAME,
    HEAD_DI_NAME,
    HEAD_RA_NAME,
    HEAD_RE_NAME,
    HEAD_RI_NAME,
    HEAD_ME_NAME,
    HEAD_MI_NAME,
    HEAD_FA_NAME,
    HEAD_FI_NAME,
    HEAD_SE_NAME,
    HEAD_SOL_NAME,
    HEAD_LE_NAME,
    HEAD_LA_NAME,
    HEAD_LI_NAME,
    HEAD_TE_NAME,
    HEAD_TI_NAME,
    HEAD_SI_NAME,
    HEAD_A_SHARP,
    HEAD_A,
    HEAD_A_FLAT,
    HEAD_B_SHARP,
    HEAD_B,
    HEAD_B_FLAT,
    HEAD_C_SHARP,
    HEAD_C,
    HEAD_C_FLAT,
    HEAD_D_SHARP,
    HEAD_D,
    HEAD_D_FLAT,
    HEAD_E_SHARP,
    HEAD_E,
    HEAD_E_FLAT,
    HEAD_F_SHARP,
    HEAD_F,
    HEAD_F_FLAT,
    HEAD_G_SHARP,
    HEAD_G,
    HEAD_G_FLAT,
    HEAD_H,
    HEAD_H_SHARP,
    HEAD_SWISS_RUDIMENTS_FLAM,
    HEAD_SWISS_RUDIMENTS_DOUBLE,
    HEAD_CUSTOM,
    HEAD_GROUPS,
    HEAD_INVALID = -1,
}

export enum ClefType {
    INVALID = -1,
    G = 0,
    G15_MB,
    G8_VB,
    G8_VA,
    G15_MA,
    G8_VB_O,
    G8_VB_P,
    G_1,
    C1,
    C2,
    C3,
    C4,
    C5,
    C_19C,
    C1_F18C,
    C3_F18C,
    C4_F18C,
    C1_F20C,
    C3_F20C,
    C4_F20C,
    F,
    F15_MB,
    F8_VB,
    F_8VA,
    F_15MA,
    F_B,
    F_C,
    F_F18C,
    F_19C,
    PERC,
    PERC2,
    TAB,
    TAB4,
    TAB_SERIF,
    TAB4_SERIF,
    C4_8VB,
    G8_VB_C,
    MAX,
}

export enum ClefToBarlinePosition {
    AUTO,
    BEFORE,
    AFTER,
}

export enum DynamicType {
    OTHER,
    PPPPPP,
    PPPPP,
    PPPP,
    PPP,
    PP,
    P,
    MP,
    MF,
    F,
    FF,
    FFF,
    FFFF,
    FFFFF,
    FFFFFF,
    FP,
    PF,
    SF,
    SFZ,
    SFF,
    SFFZ,
    SFFF,
    SFFFZ,
    SFP,
    SFPP,
    RFZ,
    RF,
    FZ,
    M,
    R,
    S,
    Z,
    N,
    LAST,
}

export enum DynamicSpeed {
    SLOW,
    NORMAL,
    FAST,
}

export enum LineType {
    SOLID,
    DASHED,
    DOTTED,
}

export enum HookType {
    NONE,
    HOOK_90,
    HOOK_45,
    HOOK_90T,
    ARROW,
    ARROW_FILLED,
    ROSETTE,
}

export enum KeyMode {
    UNKNOWN = -1,
    NONE,
    MAJOR,
    MINOR,
    DORIAN,
    PHRYGIAN,
    LYDIAN,
    MIXOLYDIAN,
    AEOLIAN,
    IONIAN,
    LOCRIAN,
}

export enum ArpeggioType {
    NORMAL,
    UP,
    DOWN,
    BRACKET,
    UP_STRAIGHT,
    DOWN_STRAIGHT,
}

export enum IntervalStep {
    UNISON,
    SECOND,
    THIRD,
    FOURTH,
    FIFTH,
    SIXTH,
    SEVENTH,
    OCTAVE,
}

export enum IntervalType {
    AUTO,
    AUGMENTED,
    MAJOR,
    PERFECT,
    MINOR,
    DIMINISHED,
}

export enum InstrumentLabelVisibility {
    LONG,
    SHORT,
    HIDE,
}

export enum OrnamentShowAccidental {
    DEFAULT,
    ANY_ALTERATION,
    ALWAYS,
}

export enum PartialSpannerDirection {
    NONE = -1,
    INCOMING,
    OUTGOING,
    BOTH,
}

export enum ChordStylePreset {
    STANDARD,
    JAZZ,
    LEGACY,
    CUSTOM,
}

export enum DisplayCapoChordType {
    CONCERT,
    BOTH,
    TRANSPOSED,
}

export enum ParenthesesMode {
    NONE = 0x0,
    LEFT = 0x1,
    RIGHT = 0x2,
    BOTH = 0x3,
}

export enum RepeatPlayCountPreset {
    X_N,
    N_X,
    PLAY_N_TIMES,
    N_REPEATS,
}

export enum TextStyleType {
    DEFAULT,
    TITLE,
    SUBTITLE,
    COMPOSER,
    LYRICIST,
    TRANSLATOR,
    FRAME,
    INSTRUMENT_EXCERPT,
    INSTRUMENT_LONG,
    INSTRUMENT_SHORT,
    INSTRUMENT_CHANGE,
    HEADER,
    FOOTER,
    COPYRIGHT,
    PAGE_NUMBER,
    MEASURE_NUMBER,
    MEASURE_NUMBER_ALTERNATE,
    MMREST_RANGE,
    TEMPO,
    TEMPO_CHANGE,
    METRONOME,
    REPEAT_PLAY_COUNT,
    REPEAT_LEFT,
    REPEAT_RIGHT,
    REHEARSAL_MARK,
    SYSTEM,
    STAFF,
    EXPRESSION,
    DYNAMICS,
    HAIRPIN,
    LYRICS_ODD,
    LYRICS_EVEN,
    HARMONY_A,
    HARMONY_B,
    HARMONY_ROMAN,
    HARMONY_NASHVILLE,
    TUPLET,
    ARTICULATION,
    STICKING,
    FINGERING,
    TAB_FRET_NUMBER,
    LH_GUITAR_FINGERING,
    RH_GUITAR_FINGERING,
    HAMMER_ON_PULL_OFF,
    STRING_NUMBER,
    STRING_TUNINGS,
    FRET_DIAGRAM_FINGERING,
    FRET_DIAGRAM_FRET_NUMBER,
    HARP_PEDAL_DIAGRAM,
    HARP_PEDAL_TEXT_DIAGRAM,
    TEXTLINE,
    SYSTEM_TEXTLINE,
    NOTELINE,
    VOLTA,
    OTTAVA,
    GLISSANDO,
    PEDAL,
    BEND,
    LET_RING,
    WHAMMY_BAR,
    PALM_MUTE,
    USER1,
    USER2,
    USER3,
    USER4,
    USER5,
    USER6,
    USER7,
    USER8,
    USER9,
    USER10,
    USER11,
    USER12,
    TEXT_TYPES,
    IGNORED_TYPES,
}

export enum FontStyle {
    Undefined = -1,
    Normal = 0,
    Bold = 1 << 0,
    Italic = 1 << 1,
    Underline = 1 << 2,
    Strike = 1 << 3,
}

export enum PlayingTechniqueType {
    Undefined = -1,
    Natural,
    Pizzicato,
    Open,
    Mute,
    Tremolo,
    Detache,
    Martele,
    ColLegno,
    SulPonticello,
    SulTasto,
    Vibrato,
    Legato,
    Distortion,
    Overdrive,
    Harmonics,
    JazzTone,
    HandbellsSwing,
    HandbellsSwingUp,
    HandbellsSwingDown,
    HandbellsEcho1,
    HandbellsEcho2,
    HandbellsDamp,
    HandbellsLV,
    HandbellsR,
}

export enum GradualTempoChangeType {
    Undefined = -1,
    Accelerando,
    Allargando,
    Calando,
    Lentando,
    Morendo,
    Precipitando,
    Rallentando,
    Ritardando,
    Smorzando,
    Sostenuto,
    Stringendo,
}

export enum ChangeMethod {
    NORMAL,
    EXPONENTIAL,
    EASE_IN,
    EASE_OUT,
    EASE_IN_OUT,
}

export enum ChangeDirection {
    INCREASING,
    DECREASING,
}

export enum AccidentalRole {
    AUTO,
    USER,
}

export enum AccidentalVal {
    SHARP3  = 3,
    SHARP2  = 2,
    SHARP   = 1,
    NATURAL = 0,
    FLAT    = -1,
    FLAT2   = -2,
    FLAT3   = -3,
    MIN     = FLAT3,
    MAX     = SHARP3,
}

export enum KeySigNatural {
    NONE   = 0,
    BEFORE = 1,
    AFTER  = 2,
}

export enum CourtesyBarlineMode {
    ALWAYS_SINGLE = 0,
    ALWAYS_DOUBLE = 1,
    DOUBLE_BEFORE_COURTESY = 2,
}

export enum FermataType {
    Undefined = -1,
    VeryShort,
    Short,
    ShortHenze,
    Normal,
    Long,
    LongHenze,
    VeryLong,
}

export enum ChordLineType {
    NOTYPE,
    FALL,
    DOIT,
    PLOP,
    SCOOP,
}

export enum SlurStyleType {
    Undefined = -1,
    Solid,
    Dotted,
    Dashed,
    WideDashed,
}

export enum TappingHand {
    INVALID = -1,
    LEFT,
    RIGHT,
}

export enum LHTappingSymbol {
    DOT,
    CIRCLED_T,
}

export enum RHTappingSymbol {
    T,
    PLUS,
}

export enum LHTappingShowItems {
    HALF_SLUR,
    SYMBOL,
    BOTH,
}

export enum TremoloType {
    INVALID_TREMOLO = -1,
    R8 = 0,
    R16,
    R32,
    R64,
    BUZZ_ROLL,
    C8,
    C16,
    C32,
    C64,
}

export enum TremoloStyle {
    DEFAULT = 0,
    TRADITIONAL,
    TRADITIONAL_ALTERNATE,
}

export enum TremoloChordType {
    TremoloNone,
    TremoloSingle,
    TremoloFirstChord,
    TremoloSecondChord,
}

export enum BracketType {
    NORMAL,
    BRACE,
    SQUARE,
    LINE,
    NO_BRACKET = -1,
}

/** C++ enum EmbellishmentType : unsigned char {} (an index into TConv's EMBELLISHMENT_TYPES) */
export type EmbellishmentType = number

export enum GlissandoType {
    STRAIGHT,
    WAVY,
}

export enum JumpType {
    DC,
    DC_AL_FINE,
    DC_AL_CODA,
    DS_AL_CODA,
    DS_AL_FINE,
    DS,
    DC_AL_DBLCODA,
    DS_AL_DBLCODA,
    DSS,
    DSS_AL_CODA,
    DSS_AL_DBLCODA,
    DSS_AL_FINE,
    USER,
}

export enum MarkerType {
    SEGNO,
    VARSEGNO,
    CODA,
    VARCODA,
    CODETTA,
    FINE,
    TOCODA,
    TOCODASYM,
    DA_CODA,
    DA_DBLCODA,
    USER,
}

export enum StaffGroup {
    STANDARD,
    PERCUSSION,
    TAB,
}

// C++ dom/guitarbend.h
export enum GuitarBendType {
    BEND,
    PRE_BEND,
    GRACE_NOTE_BEND,
    SLIGHT_BEND,

    DIVE,
    PRE_DIVE,
    DIP,
    SCOOP,
}

// C++ dom/guitarbend.h
export enum GuitarBendShowHoldLine {
    AUTO,
    SHOW,
    HIDE,
}

export enum TrillType {
    TRILL_LINE,
    UPPRALL_LINE,
    DOWNPRALL_LINE,
    PRALLPRALL_LINE,
}

export enum VibratoType {
    NONE = -1,
    GUITAR_VIBRATO,
    GUITAR_VIBRATO_WIDE,
    VIBRATO_SAWTOOTH,
    VIBRATO_SAWTOOTH_WIDE,
}

export enum ArticulationTextType {
    NO_TEXT,
    SLAP,
    POP,
    TD,
    BD,
    RT,
    PL,
    SB,
    VIB,
}

export enum LyricsSyllabic {
    SINGLE,
    BEGIN,
    END,
    MIDDLE,
}

export enum LyricsDashSystemStart {
    STANDARD,
    UNDER_HEADER,
    UNDER_FIRST_NOTE,
}

export enum NoteLineEndPlacement {
    LEFT_EDGE,
    OFFSET_ENDS,
}

export enum SpannerSegmentType {
    SINGLE,
    BEGIN,
    MIDDLE,
    END,
}

export enum TiePlacement {
    AUTO,
    INSIDE,
    OUTSIDE,
}

export enum TieDotsPlacement {
    AUTO,
    BEFORE_DOTS,
    AFTER_DOTS,
}

export enum TimeSigPlacement {
    NORMAL,
    ABOVE_STAVES,
    ACROSS_STAVES,
}

export enum TimeSigStyle {
    NORMAL,
    NARROW,
    LARGE,
}

export enum TimeSigVSMargin {
    HANG_INTO_MARGIN,
    RIGHT_ALIGN_TO_BARLINE,
    CREATE_SPACE,
}

export enum NoteSpellingType {
    STANDARD = 0,
    GERMAN,
    GERMAN_PURE,
    SOLFEGGIO,
    FRENCH,
}

export enum Key {
    C_B = -7,
    G_B,
    D_B,
    A_B,
    E_B,
    B_B,
    F,
    C,
    G,
    D,
    A,
    E,
    B,
    F_S,
    C_S,
    MIN     = C_B,
    MAX     = C_S,
    INVALID = MIN - 1,
    NUM_OF  = MAX - MIN + 1,
    DELTA_ENHARMONIC = 12,
}

export enum PreferSharpFlat {
    NONE,
    SHARPS,
    FLATS,
    AUTO,
}

export enum CapoTransposeMode {
    PLAYBACK_ONLY = 0,
    STANDARD_ONLY = 1,
    TAB_ONLY      = 2,
}

/** C++ CapoParams (a value type: copy with clone()) */
export class CapoParams {
    ignoredStrings = new Set<number>()
    fretPosition = 0
    transposeMode = CapoTransposeMode.PLAYBACK_ONLY
    active = false

    clone(): CapoParams {
        const p = new CapoParams()
        p.ignoredStrings = new Set(this.ignoredStrings)
        p.fretPosition = this.fretPosition
        p.transposeMode = this.transposeMode
        p.active = this.active
        return p
    }
}




// ========================================
// Structs
// ========================================

export class Align {
    constructor(public horizontal: AlignH = AlignH.LEFT, public vertical: AlignV = AlignV.TOP) {}
    clone(): Align { return new Align(this.horizontal, this.vertical) }
    equals(a: Align): boolean { return a.horizontal === this.horizontal && a.vertical === this.vertical }
}

export class DurationTypeWithDots {
    constructor(public type: DurationType = DurationType.V_INVALID, public dots = 0) {}
    equals(o: DurationTypeWithDots): boolean { return o.type === this.type && o.dots === this.dots }
}

export class OrnamentInterval {
    constructor(public step: IntervalStep = IntervalStep.SECOND, public type: IntervalType = IntervalType.AUTO) {}
    equals(o: OrnamentInterval): boolean { return o.step === this.step && o.type === this.type }
    static isPerfectStep(step: IntervalStep): boolean {
        return step === IntervalStep.UNISON || step === IntervalStep.FOURTH || step === IntervalStep.FIFTH || step === IntervalStep.OCTAVE
    }
    isPerfect(): boolean { return OrnamentInterval.isPerfectStep(this.step) }
}

export function isTremoloTwoChord(type: TremoloType): boolean {
    return type >= TremoloType.C8
}

export const STAFF_GROUP_MAX = StaffGroup.TAB + 1

// FontStyle flag helpers
export function fontStyleHas(a: FontStyle, b: FontStyle): boolean { return (a & b) !== 0 }
export function fontStyleAdd(a: FontStyle, b: FontStyle): FontStyle { return (a | b) as FontStyle }
export function fontStyleRemove(a: FontStyle, b: FontStyle): FontStyle { return (a & ~b) as FontStyle }

// ========================================
// mscore.h
// ========================================

export const VOICES = 4

export function staff2track(staffIdx: staff_idx_t, voiceIdx: voice_idx_t = 0): track_idx_t {
    return staffIdx !== nidx ? staffIdx * VOICES + voiceIdx : nidx
}

export function track2staff(track: track_idx_t): staff_idx_t {
    return track !== nidx ? Math.trunc(track / VOICES) : nidx
}

export function track2voice(track: track_idx_t): voice_idx_t {
    return track !== nidx ? track % VOICES : nidx
}

export function trackZeroVoice(track: track_idx_t): track_idx_t {
    return track !== nidx ? Math.trunc(track / VOICES) * VOICES : nidx
}

export function isUpVoice(voiceIdx: voice_idx_t): boolean { return !(voiceIdx & 1) }
export function isDownVoice(voiceIdx: voice_idx_t): boolean { return (voiceIdx & 1) !== 0 }

export const MAX_HEADERS = 3
export const MAX_FOOTERS = 3

export const INCH = 25.4 // millimitres per inch
export const PPI = 72.0 // typographical points per inch
export const DPI = 1200
export const DPMM = DPI / INCH

export const MAX_STAVES = 4

export const INVALID_STRING_INDEX = -1
export const INVALID_FRET_INDEX = -1

export enum OffsetType {
    ABS, ///< offset in point units
    SPATIUM, ///< offset in staff space units
}

export enum TransposeDirection {
    UP, DOWN, CLOSEST, UNKNOWN,
}

export enum UpdateMode {
    DoNothing,
    Update, // do screen refresh of RectF "refresh"
    UpdateAll, // do complete screen refresh
    Layout, // do partial layout for tick range
}

/** LayoutFlag bits */
export enum LayoutFlag {
    NO_FLAGS = 0,
    PLAY_EVENTS = 2,
    REBUILD_MIDI_MAPPING = 4,
}
