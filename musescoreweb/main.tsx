/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore Web: the score editor (work in progress). The home screen and the dialogs are React components;
 * the score view (scoreview.ts) is plain DOM code taken over from the web viewer.
 */
import { createRoot } from 'react-dom/client'
import { registerAppActions } from './actions/appactions'
import { App } from './App'
import { applyLanguageSetting } from './i18n'
import { startup } from './session'

registerAppActions()
void applyLanguageSetting()
createRoot(document.getElementById('app-root')!).render(<App />)
void startup()
