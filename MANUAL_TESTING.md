# Cutting Plan Manual Test Guide

This guide covers every implemented user-facing area, the main error paths,
privacy boundaries, the automated quality gates, and the features that are
intentionally unavailable. Run the full authenticated checklist in a disposable
GitHub Codespace or VS Code Dev Container. The local Supabase stack and captured
email service are development tools, not production services.

## 1. Prepare a reproducible test environment

GitHub Codespaces is the recommended path because it does not install project
software directly on your computer.

1. Open
   [thereallinkai/Cutting-1.0](https://github.com/thereallinkai/Cutting-1.0).
2. Select **Code → Codespaces → Create codespace on main**, or use the
   **Open in GitHub Codespaces** badge in `README.md`.
3. Use at least 4 CPU cores, 8 GB memory, and 32 GB storage.
4. Wait for `postCreateCommand` to finish. It runs `npm run bootstrap`.
5. In a new terminal, run:

   ```bash
   npm run doctor
   ```

   Expected: every required check passes. If Docker is still starting, wait a
   moment and rerun the command.

6. Run the automated baseline in the next section while no Next.js process is
   using port 3000.
7. After that gate passes, start the application:

   ```bash
   npm run dev:all
   ```

   You can instead use **Terminal → Run Task → Start Cutting Plan**.

8. Open the privately forwarded **Cutting Plan** port. Keep ports 3000 and
   54321–54324 private.
9. In the Codespaces **Ports** panel, also note:

   - **Supabase Studio** on port 54323.
   - **Local captured email** on port 54324.

Do not commit `.env.local`, `supabase/.env`, API keys, cookies, or test exports.

### Test accounts

Use two different local-only addresses so privacy isolation can be checked:

- Account A: `cutting-a-<timestamp>@example.test`
- Account B: `cutting-b-<timestamp>@example.test`

Mailpit captures local messages, so these addresses do not need real inboxes.
Use unique passwords of at least 10 characters. Do not reuse a real password.

## 2. Run the automated baseline first

Leave local Supabase running, but stop any existing Next.js development process
with Ctrl+C so the browser suite does not reuse an authenticated full-stack
server. Then run:

```bash
npm run verify
```

Expected: type checking, lint, 104 unit/component tests, database/RLS tests,
generated database-type drift detection, the production build, six Playwright
tests, responsive checks, and serious/critical axe checks all pass.

Restart the application with `npm run dev:all` after this command finishes.

Also check the repository's **Actions** tab. The **CI / Local mock-backed
suite** run for the pushed `main` branch should be green. A skipped real-OpenAI
job is normal unless it was explicitly enabled.

Useful narrower commands:

```bash
npm run test
npm run test:db
npm run test:e2e
npm run test:e2e:ui
npm run db:types:check
npm run build
```

`npm run verify:app` is an application-only fallback when Docker is
unavailable. It does not replace `npm run verify` because it omits the real
local database and RLS gate.

## 3. Public pages and route protection

Use a signed-out private/incognito window.

- [ ] `/` displays the heading **Plan meals. Notice patterns. Adjust with
  care.**
- [ ] Public navigation reaches **Log in** and **Create account**.
- [ ] Footer links reach `/terms` and `/privacy`.
- [ ] The Terms and Privacy pages use general-wellness language and do not
  promise a weight outcome.
- [ ] `/register`, `/login`, and `/forgot-password` load without a session.
- [ ] `/dashboard` redirects to `/today`, which then redirects a signed-out user
  to `/login`.
- [ ] Direct visits to `/today`, `/plan`, `/calendar`, `/progress`, and
  `/settings` redirect to `/login?next=...`.
- [ ] An unknown route displays the not-found page.

At widths 375, 768, 1280, and 1440 pixels, confirm there is no horizontal page
scrolling.

## 4. Registration and email verification

### Registration validation

Open `/register` and submit the empty form.

- [ ] An error summary appears and receives focus.
- [ ] Full name must contain at least two characters.
- [ ] Gender must be selected.
- [ ] Age must be a whole number from 13 through 120.
- [ ] Invalid email is rejected.
- [ ] Passwords shorter than 10 characters are rejected.
- [ ] Mismatched passwords focus the confirmation field.
- [ ] Both Terms and Privacy consent boxes are required.
- [ ] Password reveal/hide controls work and have accessible names.
- [ ] Terms and Privacy links open the correct documents.

Enter safe non-password fields, refresh the page, and confirm those fields are
restored. Password fields must not be restored.

### Create and verify Account A

1. Complete registration with Account A.
2. Confirm the app goes to onboarding step 2 and displays the submitted email.
3. Before using the real code:

   - [ ] Submit fewer than six digits; the app asks for all six digits.
   - [ ] Submit `000000`; the app reports an invalid or expired code.
   - [ ] Confirm the six separate inputs support ordinary typing and pasting a
     six-digit code.

4. Open the private port named **Local captured email**.
5. Open the newest signup message for Account A and copy its six-digit token.
6. Enter the token and select **Verify and continue**.
7. Confirm step 3, **What works on your plate?**, appears.

Resend behavior:

- [ ] The resend button is disabled during its 60-second countdown.
- [ ] After the countdown, **Resend code** creates a newer captured message.
- [ ] The newest code verifies; a stale or incorrect code shows a useful error.
- [ ] **Back** returns to registration.
- [ ] `/login` includes **Continue email verification** for a returning user.

## 5. Onboarding

Perform the main path with Account A. Use **Save and exit**, browser refresh,
Back, and the section **Edit** links at least once to prove the draft is
resumable.

### Step 3: food preferences

- [ ] Search is case-insensitive and matches names or categories.
- [ ] Catalog foods show category badges.
- [ ] A food can be added independently to breakfast, lunch, and dinner.
- [ ] Adding the same food twice to one meal does not duplicate it.
- [ ] Remove controls delete the correct item.
- [ ] Up/down controls reorder an item and correctly disable at the first/last
  position.
- [ ] Pointer drag-and-drop reorders an item.
- [ ] Keyboard users can reach the drag handle and the explicit up/down
  controls.
- [ ] Missing composition guidance names the expected categories:
  carbohydrate and protein for breakfast; carbohydrate, protein, and vegetable
  for lunch and dinner.
- [ ] Continuing with missing categories opens **Review meal balance?**.
- [ ] **Review meals** closes the dialog without advancing.
- [ ] **Continue anyway** records the warning and advances.
- [ ] Changing a meal after acknowledging a warning requires a new review.

For an ordinary balanced path, choose at least:

- Breakfast: rolled oats and eggs.
- Lunch: brown rice, chicken breast, and broccoli.
- Dinner: potatoes, tofu, and spinach.

### Step 4: goal and timeline

- [ ] Fat loss, muscle gain, maintenance, and recomposition can be selected.
- [ ] Missing, zero, or nonnumeric current/target weight is rejected.
- [ ] A target date is required.
- [ ] Switching kg to lb converts both visible weight values; switching back
  preserves the equivalent values within rounding.
- [ ] A fat-loss goal with a target above current weight shows a direction
  conflict rather than silently changing the goal.

Use a future target date for the main path.

### Step 5: lifestyle and safety

- [ ] Activity level and IANA time zone can be selected.
- [ ] Strength-training days accepts only whole numbers from 0 through 7.
- [ ] Height, allergies, dietary restrictions, safety context, and notes are
  clearly optional.
- [ ] Selecting **Under 18**, pregnancy/nursing, eating-disorder history,
  relevant medical concern, or concerning symptoms displays non-restrictive
  safety guidance.
- [ ] Safety copy recommends appropriate professional help without diagnosing.
- [ ] Deselecting all safety options removes that message.

### Step 6: review and completion

- [ ] Meals, goal/timeline, and lifestyle sections are visibly labeled by
  source: provided, calculated, or sent for generation.
- [ ] The disclosure says passwords and raw OTP codes are never sent for plan
  generation.
- [ ] Each **Edit** link returns to the correct step without losing data.
- [ ] Completion is blocked until the confirmation box is selected.
- [ ] **Go to Today** completes the profile without making generation a hidden
  requirement.
- [ ] On the main path, **Generate my plan** saves the profile, creates a
  separate draft, and opens My Plan for explicit review.
- [ ] Accepting that first draft is a separate, deliberate action.
- [ ] Refreshing or signing out and back in resumes or preserves the completed
  state.

## 6. Authenticated navigation and session behavior

- [ ] Desktop widths show the sidebar and active-page state.
- [ ] At 375 pixels, the sidebar is hidden and the bottom navigation reaches
  Today, My Plan, Calendar, Progress, and Settings.
- [ ] The account name and email belong to Account A.
- [ ] Refreshing any protected page keeps the authenticated session.
- [ ] **Log out** in Settings returns to `/login`.
- [ ] After logout, the browser Back button cannot reveal protected account
  data; a reload redirects to login.
- [ ] A valid login redirects an incomplete account to onboarding and a
  completed account to Today.
- [ ] A wrong email/password combination returns the same generic error and
  does not reveal whether an account exists.

## 7. My Plan

Start with Account A after **Generate my plan**.

- [ ] The page shows a plan version, its status, and provider label. An
  acceptance date appears only after explicit acceptance.
- [ ] Mock mode is labeled **Mock AI plan — development only**.
- [ ] Seven day tabs exist; clicking a day changes the meal panel.
- [ ] With keyboard focus on a day tab, Left/Right wrap between days and
  Home/End move to the first/last day.
- [ ] Each meal lists food, quantity, measurement basis, preparation note when
  present, and verification state.
- [ ] Supported meals show conservative calculated nutrition; unsupported data
  remains **Pending verification** rather than being invented.
- [ ] Estimated daily energy/protein ranges, goal assessment, recommendation
  reasons, safety notes, hydration guidance, weekly review rules, assumptions,
  and missing data are visible.
- [ ] The UI does not claim an authoritative summed daily meal total.

If this is the first generated plan, confirm it is a draft and select **Accept
this version** before continuing with the versioning test.

Versioning:

1. Record the currently accepted version.
2. Select **Generate new draft**.
3. Confirm the accepted version stays current while generation runs.
4. When the new draft appears:

   - [ ] It is explicitly marked **Draft**.
   - [ ] **Keep accepted plan** returns to the existing accepted version.
   - [ ] **Accept this version** makes the reviewed version current.

5. Open **Version history**.

   - [ ] Accepted, draft, and superseded states are distinguishable.
   - [ ] Review a superseded version.
   - [ ] **Keep current accepted plan** changes nothing.
   - [ ] **Restore as accepted plan** makes only that reviewed version current.

Rate limit: after three authenticated generation requests within ten minutes,
a fourth request should return HTTP 429 with the wait message in the Network
panel. The UI may use its generic generation-failure announcement; the accepted
plan must remain unchanged. Wait for the window to clear before continuing
ordinary generation tests.

Failure path: after the page is fully loaded, set browser DevTools
**Network → Offline**, select **Generate new draft**, and confirm the app reports
failure while preserving the accepted plan. Return to **Online** afterward.

## 8. Today

- [ ] The heading greets Account A and the date matches the profile time zone.
- [ ] Meal details come from the accepted plan for the local plan day.
- [ ] Each breakfast/lunch/dinner control exposes a pressed state and uses
  **Completed** or neutral **Not marked** language.
- [ ] Marking a meal immediately updates the daily count and weekly completion
  context.
- [ ] Reloading preserves the saved meal states.
- [ ] Calendar displays the same saved states for that local date.
- [ ] Goal and nutrition cards distinguish provided, calculated, and suggested
  information.
- [ ] Missing weight/plan information produces an honest empty or unavailable
  state.

Failure path: load Today, go offline in DevTools, toggle a meal, and confirm the
previous state is restored with a save-failure announcement. Go online and
confirm a subsequent toggle persists.

## 9. Calendar

- [ ] Previous/next month buttons load the requested month.
- [ ] **Today** selects the profile's current local date and changes month if
  necessary.
- [ ] The 42-cell grid aligns dates under the correct weekdays.
- [ ] Outside-month cells are visible but disabled.
- [ ] Each in-month day reports `0 of 3` through `3 of 3`.
- [ ] Selecting a date loads its breakfast, lunch, dinner, and note state.
- [ ] Future dates are read-only.
- [ ] On today or a past date, meal updates persist after refresh.
- [ ] A note can be saved and survives refresh.
- [ ] **Undo last change** restores the preceding saved meal/note snapshot.
- [ ] A Calendar change for today appears on Today.

At 375 pixels, the selected-day editor remains visible but the month grid and
month navigation are intentionally hidden in this build. Alternate-date
selection therefore requires a wider viewport.

Failure path: load a permitted day, go offline, change a meal or save a note,
and confirm the prior state is restored. Return online afterward.

## 10. Progress

- [ ] Latest, Start, Change, and Target cards use the preferred unit.
- [ ] An empty account explains that no entry exists instead of drawing zero.
- [ ] Zero, negative, nonnumeric, and implausibly large values are rejected.
- [ ] Entering kg displays an equivalent lb value and vice versa.
- [ ] Saving creates or replaces the one entry for the current local date.
- [ ] Refreshing preserves the entry.
- [ ] **Edit** loads the selected value; **Cancel edit** makes no change;
  **Save changes** persists the edit.
- [ ] **Delete** opens a confirmation dialog.
- [ ] **Keep entry** cancels deletion; **Delete entry** removes it and the
  removal persists.
- [ ] 4 weeks, 12 weeks, and All change the visible range.
- [ ] Changing the unit inside Progress affects the current page only; the saved
  default unit is changed in Settings.
- [ ] Missing calendar dates remain gaps and are never plotted as zero.
- [ ] A seven-day average appears only when enough data exists.
- [ ] One reading never automatically changes the accepted plan.

The authenticated UI deliberately records the current local date. To visually
inspect a populated seven-day trend immediately, use the mock Playwright/UI
fixture; to validate real persistence immediately, first make the profile time
zone match the browser time zone, then run this in that signed-in page's browser
console:

```js
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const formatLocalDate = (instant) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

for (let offset = 6; offset >= 0; offset -= 1) {
  const response = await fetch("/api/weights", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      localDate: formatLocalDate(new Date(Date.now() - offset * 86_400_000)),
      weight: 80 + offset * 0.1,
      unit: "kg",
    }),
  });
  if (!response.ok) throw new Error(`Seed request failed: ${response.status}`);
}
location.reload();
```

Expected: seven consecutive dated readings produce the seven-day average.
These are real disposable Account A records, not a mock. Delete them from the
UI when the trend test is complete.

Failure path: load Progress, go offline, attempt save/edit/delete, and confirm
the previous history is restored. Return online afterward.

## 11. Settings

### Profile and goal

- [ ] Full name, kg/lb preference, and a valid IANA time zone save and persist.
- [ ] Navigation reflects the saved name after refresh or the next sign-in.
- [ ] Changing the display unit updates Progress after refresh.
- [ ] Goal type can be changed without silently replacing the accepted plan.

### Preferences and safety context

- [ ] Allergies, dietary restrictions, and disliked foods accept comma-separated
  values, trim whitespace, and remove case-insensitive duplicates.
- [ ] Training days accepts only 0 through 7.
- [ ] Safety context saves and persists.
- [ ] Saved onboarding meal choices are displayed read-only.
- [ ] Saving preferences does not silently replace an accepted plan.

### Private label foods

Add a clearly fake test product with serving grams, calories, protein,
carbohydrate, fat, optional fiber/sodium, and a source note.

- [ ] Required core nutrition fields are enforced and negative values fail.
- [ ] The food is saved as user-entered label data, not independently verified.
- [ ] Refreshing Settings preserves the product and its serving nutrition.
- [ ] Returning to onboarding food search shows the product.
- [ ] Its Add-to-meal buttons are disabled and the page says it is not yet
  eligible for generated plans.
- [ ] Account B cannot see Account A's private product.

### AI, security, and data

- [ ] AI mode is read-only deployment configuration and says `mock`, `openai`,
  or `unavailable`.
- [ ] **Change password** opens password recovery.
- [ ] **Download JSON** downloads Account A's account export.
- [ ] Open the JSON locally and confirm it contains only expected Account A
  profile, goals, preferences, plans, check-ins, weights, and private foods.
- [ ] The export contains no password, OTP, session token, service key, or other
  user's data.
- [ ] **Delete account** is disabled and explicitly says the feature is
  currently unavailable.

## 12. Password recovery

1. Sign out Account A and open `/forgot-password`.
2. Submit an unknown address and then Account A.

- [ ] Both submissions show the same non-enumerating success message.
- [ ] Account A receives a reset message in **Local captured email**.
- [ ] The reset link returns through `/auth/callback` to `/reset-password`.
- [ ] Mismatched new passwords are rejected.
- [ ] Passwords shorter than 10 characters are rejected.
- [ ] A valid new password produces a success message.
- [ ] The old password no longer logs in; the new password does.
- [ ] Reusing an invalid or expired callback link returns to login without
  exposing provider details. The current Login page does not render the
  callback's `message` query parameter.

This tests local Mailpit delivery only, not production SMTP deliverability.

## 13. Two-user privacy and RLS

Keep Account A signed in in one private browser profile and create Account B in
a separate private/incognito profile.

- [ ] Account B begins with its own onboarding/profile state.
- [ ] Account B cannot see Account A's plan versions.
- [ ] Account B cannot see or change Account A's check-ins or notes.
- [ ] Account B cannot see, edit, or delete Account A's weights.
- [ ] Account B cannot see Account A's private label foods or export.
- [ ] Logging back into Account A shows its original data unchanged.

Then rerun:

```bash
npm run test:db
```

Expected: schema, seed, constraints, atomic RPC behavior, private ownership, and
cross-user RLS denial all pass. Supabase Studio uses an administrative local
view, so seeing all rows there is not evidence of a browser/RLS leak.

## 14. Health, persistence, and recovery

With the stack running:

```bash
curl --silent --show-error http://127.0.0.1:3000/api/health
```

Expected authenticated-development environment values include:

- `application: "available"`
- `readiness: "ready"`
- `database: "reachable"`
- `migration.status: "compatible"`
- `aiProvider: "mock"` unless deliberately changed

The response must not contain secrets, connection strings, cookies, or raw
provider output.

Check the repository's security headers:

```bash
curl --silent --show-error --head http://127.0.0.1:3000/ \
  | grep -Ei 'x-content-type-options|x-frame-options|referrer-policy|permissions-policy'
```

Expected values include `nosniff`, `DENY`,
`strict-origin-when-cross-origin`, and disabled camera, microphone, geolocation,
and payment access.

This terminal request carries no browser cookie:

```bash
curl --include http://127.0.0.1:3000/api/weights
```

Expected in the configured full-stack environment: HTTP 401.

Persistence check:

Stop the running Next.js process with Ctrl+C, then run:

```bash
npm run down
npm run services:start
npm run dev:all
```

After restart, Account A's saved data should still exist. `npm run down`
preserves local data.

Idempotency check:

Stop the running Next.js process with Ctrl+C before the first bootstrap:

```bash
npm run bootstrap
npm run bootstrap
npm run doctor
```

Expected: both bootstrap runs succeed, seeded foods are not duplicated, user
data remains, and existing `.env.local` assignments are preserved. Restart with
`npm run dev:all`.

Only at the very end of testing, and only in a disposable Codespace, you may
test destructive reconstruction:

```bash
npm run db:reset
```

Enter the exact phrase `RESET LOCAL DATABASE`. This intentionally erases local
test accounts and user-created data, reapplies migrations and seed data, and
cannot be treated as an ordinary start command.

## 15. Accessibility and responsive checks

In addition to `npm run test:e2e`, manually check the five protected pages and
the public/auth pages:

- [ ] Complete the critical path using only Tab, Shift+Tab, Enter, Space, and
  arrow keys.
- [ ] A visible focus indicator is always present.
- [ ] The skip link reaches main content.
- [ ] Dialog focus remains inside the dialog and returns to the opener.
- [ ] Error summaries, save results, and optimistic rollback messages are
  announced by a screen reader.
- [ ] Form labels and button names are meaningful without surrounding text.
- [ ] At 200% browser zoom, content remains usable without losing controls.
- [ ] At 375, 768, 1280, and 1440 pixels, no page has horizontal overflow.
- [ ] At mobile width, bottom navigation does not cover the final page controls.
- [ ] At desktop width, the sidebar remains usable at ordinary viewport heights.
- [ ] With reduced motion enabled at the operating-system level, no essential
  information depends on animation.

The automated axe gate checks serious and critical findings; it is not a
substitute for this keyboard, screen-reader, zoom, and visual review.

## 16. Optional real OpenAI smoke test

The default mock test is free and deterministic:

```bash
npm run openai:smoke
```

Expected in the normal environment: a clear `SKIPPED` result because real AI was
not explicitly enabled. A skip is not a pass.

Only run a real request if you intentionally accept API cost:

1. Store `OPENAI_API_KEY` as a GitHub Actions repository secret; never commit it.
2. Create/protect the GitHub Environment named `openai-smoke`.
3. In **Actions → CI → Run workflow**, enable
   **Run one protected real-OpenAI smoke request**.
4. Confirm the separate **Protected real OpenAI smoke test** job passes.
5. Inspect logs only for the bounded result; logs must not print the key or raw
   sensitive profile data.

To test real generation through the UI, use a supported model available to the
account, set the server-only configuration through Codespaces secrets, set
`AI_PROVIDER=openai` and `ENABLE_REAL_AI=true`, restart the app, and generate a
new draft. Confirm the provider label changes, structured validation succeeds,
and the accepted plan remains unchanged until explicit acceptance.

## 17. Expected unavailable boundaries

These are not test failures when the UI states them honestly:

- Hosted Supabase, production SMTP, a public deployment, domain, monitoring,
  billing, and production secrets are not configured.
- Account deletion is visibly disabled pending a reviewed deletion/retention
  procedure.
- Private label foods are saved for reference but cannot yet be selected for
  generated plans.
- The plan does not claim an authoritative summed daily total where nutrition
  bases are incomplete; supported per-meal calculations and uncertainty remain
  visible.
- A real OpenAI result is unverified until the opt-in paid smoke test actually
  passes.
- Local Mailpit authentication does not prove production email delivery.
- Calendar's month grid is not available below 768 pixels; the selected-day
  editor remains visible.
- An invalid auth callback safely returns to Login, but Login does not currently
  display the callback message.

## 18. Production-container structure

This checks the committed container without claiming a public deployment:

```bash
docker build --tag cutting-plan:local .
docker image inspect \
  --format '{{.Config.User}} {{json .Config.Healthcheck}}' \
  cutting-plan:local
docker run --rm --entrypoint id cutting-plan:local
```

Expected: the image builds, its configured/runtime user is non-root, UID/GID
1001 is used, and the health check targets `/api/health`.

To confirm production fails closed without hosted runtime configuration:

```bash
docker run --detach --rm \
  --name cutting-plan-container-test \
  --publish 3100:3000 \
  cutting-plan:local
curl --include http://127.0.0.1:3100/api/health
docker stop cutting-plan-container-test
```

Expected without hosted Supabase values: HTTP 503 with degraded readiness.
Healthy production-container acceptance requires an authorized staging
Supabase project, migrations, Auth redirects, SMTP, secrets, and backups; those
external services are not included here.

Record each failure with the route, local date/time zone, browser width,
account, exact action, expected result, actual result, console/network error,
and a screenshot. Never include passwords, OTPs, cookies, API keys, or private
export contents in a bug report.
