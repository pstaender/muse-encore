/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The properties panel (port of src/inspector/qml/MuseScore/Inspector/InspectorForm.qml).
 */
import type { MenuItem } from '../../menus/appmenu'

/** the items of the tab's context menu before "Close" (none in MuseScore) */
export function inspectorPanelMenu(): MenuItem[] {
    return []
}

export function InspectorForm(): React.JSX.Element {
    return <div className="panel-placeholder" />
}
