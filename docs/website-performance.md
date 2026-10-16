# Public website performance

The anonymous homepage can be served from the existing static HTML produced by
Next, without loading the Next Worker. `cf:build` runs
`scripts/prepare-public-shell.mjs`, which copies the HTML only when the prerender
manifest declares `/` permanently static. If the page later becomes dynamic or
uses ISR, the asset is omitted and the Worker falls back to Next. Missing assets,
other hosts, non-HTML requests, RSC navigation, actions, sessions and other pages
also fall back. Country, currency and language still hydrate from the actual URL.

Only a `cookie_consent` cookie is safe to ignore for the audited public-data
endpoints and static home shell. Any unknown or session cookie, Authorization,
Range or RSC request bypasses these paths. Public data includes market snapshots,
forecasts, forecast series, landing data and gold signals; premium silver and
user/admin endpoints remain excluded. Browser responses retain no-store and the
internal data cache still lasts at most 15 seconds. Query order is normalized
while retaining all parameters and trusted-mode header variants.

Identical public requests in the same isolate share an in-flight calculation.
Errors, Set-Cookie and unsupported Vary responses are not shared or cached.
Joining an in-flight calculation has a five-second deadline and the map is
bounded to 128 keys, so disconnected or stalled requests cannot block all future
visitors or grow it indefinitely. Cache failures fall back to fresh application
responses.

Dashboard, US dashboard, gold signals, silver, forecast charts and landing data
use a shared visible-page poller. It cancels timers and requests when hidden or
unmounted, prevents overlapping polls, and refreshes once when a tab is restored.
Focus plus visibility events do not cause duplicate refreshes. Existing visible
refresh intervals and all scheduled background jobs are preserved. Slow requests
finish before another poll is scheduled. The dashboard no longer repeats its
initial market request when its loading state changes.

Validation includes cache/session separation, concurrent and stalled requests,
static-shell fallbacks, deterministic visibility/timer tests, production builds,
and an isolated Chrome browser using mocked API responses. The browser hydrates
the exact generated HTML, checks initial request counts, advances two hidden
minutes with no extra polls, resumes once, and verifies normal polling plus Arabic
and country/currency URL behavior. Live CPU measurements are recorded outside the
repository in the task's audit directory.

Deploy the website with `npm run cf:deploy` after `npm run cf:build`; keep runtime
variables using --keep-vars. No background Worker deployment is required for
these frontend/entry changes. Roll back the website version to undo this round;
background jobs are unaffected. Standalone TypeScript checking has only the
previously known business-card page/route parameter failures.
