/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The app frame: the tabs "Home" and "Score" (like MuseScore's top bar), the home screen and the New Score dialog.
 */
import { ScoresPage } from './home/ScoresPage'
import { NewScoreDialog } from './newscore/NewScoreDialog'
import { setView, useSession } from './session'

export function App(): React.JSX.Element {
    const session = useSession()
    return (
        <>
            <nav className="app-tabs" aria-label="Views">
                <div role="tablist">
                    <button role="tab" aria-selected={session.view === 'home'} onClick={() => setView('home')}>Home</button>
                    <button role="tab" aria-selected={session.view === 'score'} disabled={!session.current}
                        title={session.current ? session.current.name : 'No score is open'} onClick={() => setView('score')}>
                        Score
                    </button>
                </div>
            </nav>
            {session.view === 'home' && <ScoresPage />}
            {session.newScoreDialog && <NewScoreDialog />}
        </>
    )
}
