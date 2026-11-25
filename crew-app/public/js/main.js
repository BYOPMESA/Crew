import { getMe } from './lib/api.js';
import { navigate, route, start } from './lib/router.js';
import { basicsScreen } from './screens/basics.js';
import { loginScreen, signupScreen } from './screens/auth.js';
import { homeScreen } from './screens/home.js';
import { inviteScreen } from './screens/invite.js';
import { joinScreen } from './screens/join.js';
import { waitingScreen } from './screens/waiting.js';
import { welcomeScreen } from './screens/welcome.js';
import { preferencesScreen } from './screens/preferences.js';
import { profileScreen } from './screens/profile.js';
import { tripScreen } from './screens/trip.js';

/** Wrap a screen so it only renders for a signed-in user; otherwise go to /login and come back after. */
const protectedRoute = (screen) => async (ctx) => {
  const me = await getMe();
  if (!me) {
    navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
    return;
  }
  return screen(me, ctx);
};

/** Login/signup are pointless when already signed in. */
const guestRoute = (screen) => async (ctx) => {
  if (await getMe()) {
    navigate('/', { replace: true });
    return;
  }
  return screen(ctx);
};

route('/login', guestRoute(loginScreen));
route('/signup', guestRoute(signupScreen));
route('/', protectedRoute(homeScreen));
route('/profile', protectedRoute(profileScreen));
route('/trips/:id', protectedRoute(tripScreen));
route('/trips/:id/preferences', protectedRoute(preferencesScreen));
route('/trips/:id/basics', protectedRoute(basicsScreen));
route('/trips/:id/invite', protectedRoute(inviteScreen));
route('/trips/:id/welcome', protectedRoute(welcomeScreen));
route('/trips/:id/waiting', protectedRoute(waitingScreen));
// Public: the invite landing works logged out; the screen itself decides what to offer.
route('/join/:token', joinScreen);

start(document.getElementById('app'));
