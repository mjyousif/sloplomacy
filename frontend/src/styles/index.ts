/**
 * Every stylesheet, in cascade order. This is the only place that imports them, and the order is
 * load-bearing: the files in app/ are consecutive slices of what was one App.css, and the phone
 * files in compact/ come last, so a phone rule that is not scoped by `[data-layout='compact']` still wins a tie with a wide one.
 */
import './app/01-header.css';
import './app/02-workspace.css';
import './app/03-map-viewport.css';
import './app/04-macro-cards.css';
import './app/05-macro-panels.css';
import './app/06-sanity-screens.css';
import './app/07-navigation.css';
import './app/08-lobby-games.css';
import './app/09-lobby-host-modals.css';
import './app/10-macro-ai-staff.css';
import './app/11-auth-modal.css';
import './app/12-admin-console-shell.css';
import './app/13-admin-console-tabs.css';
import './app/14-surrender-socket.css';
import './app/15-tools-sidebar-frame.css';
import './app/16-tools-sidebar-sections.css';
import './app/17-turn-history.css';
import './app/18-rails.css';
import './app/19-version-timer.css';
import './app/20-display-confirm.css';
import './compact/1-shell.css';
import './compact/2-modals.css';
import './compact/3-top-bar.css';
import './compact/4-lobby.css';
import './compact/5-game-screen.css';
import './compact/6-touch-map.css';
