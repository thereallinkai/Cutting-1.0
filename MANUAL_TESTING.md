# Let's Go Green! Manual Test Guide

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

   You can instead use **Terminal → Run Task → Start Let's Go Green!**.

8. Open the privately forwarded **Let's Go Green!** port. Keep ports 3000 and
   54321–54324 private.
9. In the Codespaces **Ports** panel, also note:

   - **Supabase Studio** on port 54323.
   - **Local captured email** on port 54324.

10. For live USDA testing, add a real server-only `USDA_FDC_API_KEY` to the
    ignored `.env.local`, or accept the rate-limited non-production `DEMO_KEY`.
    Optionally set a descriptive `FOOD_LOOKUP_USER_AGENT`; do not use a
    `NEXT_PUBLIC_*` variable:

    ```dotenv
    USDA_FDC_API_KEY=
    FOOD_LOOKUP_USER_AGENT=LetsGoGreen/0.1 (https://github.com/thereallinkai/Cutting-1.0)
    ```

    Restart `npm run dev:all` after changing environment values. Open Food Facts
    name and barcode lookup need outbound network access but no API key. If the
    environment blocks a provider, record that live-provider case as blocked,
    not passed; the local catalog and label-upload cases must still be tested.

Do not commit `.env.local`, `supabase/.env`, API keys, cookies, or test exports.

### Test accounts

Use two different local-only addresses so privacy isolation can be checked:

- Account A: `green-a-<timestamp>@example.test`
- Account B: `green-b-<timestamp>@example.test`

Mailpit captures local messages, so these addresses do not need real inboxes.
Use unique passwords of at least 10 characters. Do not reuse a real password.

## 2. Run the automated baseline first

Leave local Supabase running, but stop any existing Next.js development process
with Ctrl+C so the browser suite does not reuse an authenticated full-stack
server. Then run:

```bash
npm run verify
```

Expected: type checking, lint, every currently discovered unit/component test,
database/RLS tests, generated database-type drift detection, the production
build, every currently discovered Playwright test, responsive checks, and
serious/critical axe checks all pass. Record the counts printed by this checkout
instead of relying on a stale hard-coded total.

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
  `/profile` or `/settings` redirect to `/login?next=...`.
- [ ] An unknown route displays the not-found page.
- [ ] Visible product naming says **Let's Go Green!**; no user-facing page or
  email template calls the product **Cutting Plan**.
- [ ] The green visual system has readable contrast, and page/dialog transitions
  do not hide controls or shift focus unexpectedly.

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

- [ ] Search is case-insensitive and matches generic names, categories, brands,
  exact product names, variants, and an exact GTIN/barcode.
- [ ] Generic foods and branded products are visibly distinguishable. A branded
  result shows its brand, product, variant, and GTIN when those values exist.
- [ ] Catalog foods show category badges, verification/review state, and whether
  the record is eligible for generated plans.
- [ ] Expanding **Nutrition facts** shows the stated basis and every available
  nutrient rather than only calories. Missing values stay absent or pending.
- [ ] Source attribution and a source link appear when provided. The UI never
  labels USDA, Open Food Facts, or a user transcription as independently
  reviewed unless its stored status says so.
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
- [ ] A `pending_review` external/shared record remains searchable but its
  Add-to-preference controls are disabled until review.
- [ ] A confirmed Account A personal-label product is selectable by Account A
  and remains labeled **Confirmed from your label**, not source reviewed.

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

- [ ] On first entry, the IANA time zone defaults to
  `Intl.DateTimeFormat().resolvedOptions().timeZone` for this browser.
- [ ] The browser does not display a location/geolocation permission prompt to
  determine the time zone.
- [ ] Activity level and IANA time zone can still be selected manually.
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
- [ ] After first completion, the optional tutorial opens unless it was already
  completed for this account or skipped for the current browser session.

## 6. Food catalog, exact products, lookup, and nutrition cards

Run these cases while Account A is authenticated and the full local stack is
running. Keep the browser Network panel open. A provider response is
source-reported data, not proof that the nutrition is correct.

### Local catalog and rich nutrition

1. Search for a generic produce item such as `broccoli`.
2. Open its **Nutrition facts** details.
3. Search separately for a known brand, product name, variant, and GTIN after
   creating or importing the product in the cases below.

- [ ] Generic and branded results are visually distinct.
- [ ] An exact product never collapses to a generic category such as
  “protein powder”; brand, product, flavor/variant, and GTIN remain attached.
- [ ] The card states the reference quantity and basis, such as raw/cooked per
  100 g or one label serving.
- [ ] Calories and available kilojoules, protein, carbohydrate, total fat,
  fiber, sodium, saturated/trans fat, sugars, cholesterol, potassium, calcium,
  iron, vitamin D, and provider-specific nutrients are shown when present.
- [ ] The seeded broccoli, spinach, romaine lettuce, carrot, and tomato records
  each show their USDA energy summary and 19 additional reported nutrient rows,
  including water, minerals, vitamins, and unsaturated-fat totals.
- [ ] A missing nutrient is omitted or labeled unavailable; it is not displayed
  as zero and is not filled by AI.
- [ ] Verification state, provider attribution, retrieval/source details, and a
  source link appear when the record supplies them.
- [ ] Catalog paging/search does not expose another account's private product.

### USDA FoodData Central text lookup

1. Put `broccoli raw` in **Search foods**, choose
   **Generic and branded foods — USDA**, and press **Search online by name**.
2. Review several candidates before choosing one; in the Network response, note
   the candidate's FDC `externalId` and visible data type.
3. Choose **Import current record**, then search the local catalog for it.
4. Import the same FDC identifier again.

- [ ] A one-character query is rejected without calling the provider.
- [ ] Candidate search does not silently add every result to the database.
- [ ] Import refetches the selected FDC record on the server and returns one
  normalized catalog record with USDA attribution.
- [ ] Editing the browser request to attach invented calories or nutrients does
  not control the saved values; import trusts the server-refetched provider
  record identified by provider plus external ID.
- [ ] The record exposes all provider-reported nutrients and preserves its
  measurement basis.
- [ ] The imported record is labeled `pending_review` / source reported and is
  disabled for generated-plan preferences.
- [ ] Reimporting the same provider identifier reuses the existing record rather
  than creating a duplicate.
- [ ] A missing key in production, provider timeout, bad response, or rate limit
  produces a useful unavailable/retry message and does not invent a result.

### Open Food Facts product-name lookup

1. Enter a brand, product, and flavor, such as
   `Optimum Nutrition double rich chocolate`, in **Search foods**.
2. Keep **Packaged products and brands — Open Food Facts** selected and press
   **Search online by name**. A barcode is not required.
3. Review the source, brand/product name, barcode when present, and the
   source-reported calorie/macronutrient preview. Choose
   **Import current record** only for the exact product you intend.
4. Repeat the test while a saved local match is visible.

- [ ] The online-name controls stay prominent even when the saved catalog has
  matches.
- [ ] Typing and local catalog filtering do not send a request to Open Food
  Facts; only the explicit search button does.
- [ ] Name search returns candidates without saving all of them.
- [ ] Import sends only provider plus external ID and refetches the exact
  barcode record from Open Food Facts before normalization; browser-supplied
  nutrition cannot control the stored values.
- [ ] Imported nutrition and provenance are labeled source-reported and
  `pending_review`, and the record remains unavailable to generated plans until
  catalog review.
- [ ] Empty, one-character, unavailable, incomplete, and rate-limited searches
  show useful messages and never invent nutrition.

### Open Food Facts barcode lookup

1. Expand **Look up an exact barcode instead** and use the 8–14 digit barcode
   from a non-sensitive packaged test product.
2. If the provider finds it, review the exact brand/product and nutrition, then
   import it and search the local catalog by that barcode.
3. Also try seven digits, letters, an unknown 8–14 digit code, and a product
   whose provider record lacks one of the four core values when available.

- [ ] Invalid barcode format is rejected before a provider request.
- [ ] A found product is normalized as the exact GTIN, shows Open Food Facts
  attribution and source link, and remains `pending_review`.
- [ ] Community-reported ingredients, allergens, and nutrition are not relabeled
  as independently reviewed.
- [ ] Unknown or incomplete products offer the package-label path; they do not
  fall back to Google, ChatGPT, or guessed nutrition.
- [ ] Google Search and ChatGPT are nowhere presented as nutrition truth.

## 7. Label photo, personal product, reuse, and privacy

Use a clearly fake, non-sensitive test label that you can photograph. Give it a
unique 8–14 digit test GTIN, record the exact values you print, and delete/reset
the disposable local environment afterward.

1. In **Settings → Private label foods**, enter brand, product, flavor/variant,
   test GTIN, package and serving details, calories, protein, carbohydrate, fat,
   several optional nutrients, ingredients, and an allergen statement.
2. Choose a clear JPEG or PNG nutrition-label image. On a supported phone or
   tablet, also confirm the file control can offer the rear camera.
3. Select the explicit package-allergen review, dietary-restriction review, and
   exact-transcription confirmation, then choose **Upload and save product**.
4. Refresh Settings and search for the product by brand, variant, and GTIN.

- [ ] Submission is blocked without a nutrition image, confirmation, required
  identity fields, four core nutrition values, ingredients, or allergen text.
- [ ] If the package statement says `Contains milk and soy`, submission is
  blocked until both Milk and Soy are selected. A genuine `milk-free` claim
  does not itself create a Milk mapping.
- [ ] A PDF, corrupt image, mismatched declared type, file over 8 MB, or image
  over 20 megapixels is rejected without confirming a product.
- [ ] The server rotates/re-encodes the accepted JPEG/PNG, strips embedded
  metadata, and records dimensions and a digest rather than trusting the
  browser-provided filename.
- [ ] Uploading a replacement nutrition image leaves one current metadata row
  and one current private object for that evidence kind; the previous object is
  removed after the replacement is safely recorded.
- [ ] More than 20 image attempts for one account in 24 hours returns a neutral
  rate-limit message before another image is processed.
- [ ] In local Supabase Studio, the `food-labels` bucket is private, the stored
  object is under Account A's owner-prefixed path, and only the server-re-encoded
  evidence—not the original upload as-is—is present. Studio is an administrative
  view; do not use its access as evidence of a browser/RLS leak.
- [ ] The success message states that the personal copy is usable by Account A
  and any barcode-keyed shared copy remains pending review.
- [ ] Account A's confirmed product shows the exact brand/product/variant,
  label-serving facts, ingredients/allergens, and **Confirmed from your label**.
- [ ] The owner-private product is plan-eligible only for Account A after
  explicit confirmation; changing the photographed transcription during the
  confirmation request fails closed.
- [ ] Refreshing and signing out/in preserve the confirmed product.

Now sign in as Account B in a separate private browser profile:

- [ ] Account B cannot list Account A's label submission, personal product, raw
  image metadata, storage object, or private export data.
- [ ] Searching the exact GTIN can find one normalized shared catalog record
  without requiring Account B to upload the photo again.
- [ ] That shared record contains normalized facts and source status only. It
  says `pending_review`, is searchable and can be logged in a Today snack, but
  cannot be selected for generated plans.
- [ ] No raw label-photo URL, owner user ID, local storage path, cookie, or token
  appears in the shared card or browser response.
- [ ] Submitting the same GTIN again does not create multiple shared catalog
  identities.

## 8. Profile, automatic time zone, shopping links, and tutorial

1. On desktop, select the initials/avatar at the bottom left. On mobile, select
   the avatar in the top header.
2. Compare `/profile` with Account A's saved registration, onboarding, goal,
   latest weight, routine, and preference values.

- [ ] The avatar opens `/profile`; it is keyboard reachable and has an accessible
  name that includes the account name.
- [ ] Personal details, account email/member date, routine, goal context, latest
  weight, and food preferences belong to Account A.
- [ ] Raw optional safety-context text is not repeated on the overview.
- [ ] **Edit settings** opens the profile controls without silently changing a
  goal or accepted plan.

Time-zone case:

1. Note `Intl.DateTimeFormat().resolvedOptions().timeZone` in DevTools.
2. Start onboarding in a fresh browser profile and compare its initial time
   zone.
3. In Settings, deliberately save another valid IANA zone, refresh, and restore
   the device zone.

- [ ] Initial time-zone detection matches the device/browser setting and causes
  no geolocation permission prompt.
- [ ] A manual valid IANA override persists and controls Today/Calendar local
  dates; an invalid zone is rejected.

Shopping-link case:

- [ ] **Grocery stores**, **Farmers markets**, and **Nutrition stores** open
  `https://www.google.com/maps/search/` in a new tab with `noopener` behavior.
- [ ] The app labels these as external map searches and says it does not receive
  results or verify inventory.
- [ ] No card claims a specific item is in stock, nearby, cheapest, available,
  suitable, or safe. Google may independently request location after the user
  leaves the app.

Tutorial case:

1. Complete onboarding in a fresh account and move through every tutorial step
   with Back/Next.
2. Close it once, refresh in the same session, then replay it from Profile.
3. Finish it, sign out/in, and confirm the completed version does not
   automatically reopen.

- [ ] The tutorial covers Today, plan review, Calendar/Progress, Profile,
  privacy, and shopping boundaries.
- [ ] Close/skip never traps the user or blocks use of the app.
- [ ] Focus stays inside the open dialog and returns to the opener.
- [ ] **Replay tutorial** works after a session skip.
- [ ] **Finish tutorial** / **Don't show again** persists the version to Account
  A; a save failure is announced and still allows a temporary skip.

## 9. Authenticated navigation and session behavior

- [ ] Desktop widths show the sidebar and active-page state.
- [ ] At 375 pixels, the sidebar is hidden and the bottom navigation reaches
  Today, My Plan, Calendar, Progress, and Settings.
- [ ] The account name and email belong to Account A.
- [ ] The desktop account chip and mobile header avatar both reach Profile; the
  Profile route does not need a sixth bottom-navigation item.
- [ ] Refreshing any protected page keeps the authenticated session.
- [ ] **Log out** in Settings returns to `/login`.
- [ ] After logout, the browser Back button cannot reveal protected account
  data; a reload redirects to login.
- [ ] A valid login redirects an incomplete account to onboarding and a
  completed account to Today.
- [ ] A wrong email/password combination returns the same generic error and
  does not reveal whether an account exists.

## 10. My Plan

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
- [ ] A source-reported `pending_review` shared product never appears in a
  generated plan. An Account A confirmed personal-label product may appear only
  when it was selected by Account A and passes the stored safety filters.
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

## 11. Today

- [ ] The heading greets Account A and the date matches the profile time zone.
- [ ] Meal details come from the accepted plan for the local plan day.
- [ ] The six spaces appear in this order: Breakfast, Morning snack, Lunch,
  Afternoon snack, Dinner, Evening snack.
- [ ] Every slot exposes explicit `not marked`, `completed`, and `skipped`
  behavior. Breakfast/lunch/dinner remain the three planned-meal summary; empty
  optional snacks do not count as failures.
- [ ] Choose **Skip** for one meal, save with a reason, and another with the
  optional reason blank. Both persist with neutral wording.
- [ ] **Return to not marked** clears the skipped state and its old reason.
- [ ] Add a catalog food to each snack space. Adding a food marks that slot
  completed, does not invent a portion, and does not duplicate the same food.
- [ ] Remove one recorded food; only that presence record is removed.
- [ ] Search by an exact GTIN and add a reusable pending shared product to a
  snack. Its source/review wording remains honest.
- [ ] Marking or skipping a primary meal immediately updates the three-meal
  daily count, skipped count, and weekly context; recorded snacks are reported
  separately.
- [ ] Reloading preserves statuses, optional reasons, and recorded food items.
- [ ] Calendar displays the same saved states for that local date.
- [ ] Goal and nutrition cards distinguish provided, calculated, and suggested
  information.
- [ ] Missing weight/plan information produces an honest empty or unavailable
  state.

Failure paths: load Today, go offline in DevTools, then separately toggle a
status, save a skip reason, add a food, and remove a food. Each failed action
must restore or retain the preceding state and announce that nothing was saved.
Go online and confirm subsequent actions persist. Attempts to write a future
local date or another user's item must fail closed.

## 12. Calendar

- [ ] Previous/next month buttons load the requested month.
- [ ] **Today** selects the profile's current local date and changes month if
  necessary.
- [ ] The 42-cell grid aligns dates under the correct weekdays.
- [ ] Outside-month cells are visible but disabled.
- [ ] Each in-month day reports `0 of 3` through `3 of 3` for primary meals and
  separately indicates recorded snacks; an empty snack does not reduce the
  primary summary.
- [ ] Selecting a date loads all six ordered meal/snack statuses, optional skip
  reasons, and the daily note state.
- [ ] Future dates are read-only.
- [ ] On today or a past date, completed/skipped/not-marked updates persist
  after refresh, including a blank or supplied skip reason.
- [ ] A note can be saved and survives refresh.
- [ ] **Undo last change** restores the preceding saved meal/note snapshot.
- [ ] A Calendar change for today appears on Today.

At 375 pixels, the selected-day editor remains visible but the month grid and
month navigation are intentionally hidden in this build. Alternate-date
selection therefore requires a wider viewport.

Failure path: load a permitted day, go offline, change a meal or save a note,
and confirm the prior state is restored. Return online afterward.

## 13. Progress

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

## 14. Settings

### Profile and goal

- [ ] Full name, kg/lb preference, and a valid IANA time zone save and persist.
- [ ] An invalid IANA time zone is rejected. Editing the time zone uses no
  location permission and does not overwrite a deliberate saved value on every
  refresh.
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

Complete every upload, confirmation, GTIN-reuse, invalid-image, and cross-user
case in section 7.

- [ ] The saved list shows the confirmed personal product and its serving facts.
- [ ] Returning to onboarding food search shows it to Account A as a
  user-confirmed, plan-eligible personal product.
- [ ] The barcode-keyed shared copy, if created, is a separate pending-review
  record and cannot enter generated plans.

### AI, security, and data

- [ ] AI mode is read-only deployment configuration and says `mock`, `openai`,
  or `unavailable`.
- [ ] **Change password** opens password recovery.
- [ ] **Download JSON** downloads Account A's account export.
- [ ] Open the JSON locally and confirm it contains only expected Account A
  profile, goals, preferences, plans, six-slot check-ins, recorded meal items,
  weights, and normalized private-food records.
- [ ] The export does not embed raw label-photo bytes or a public storage URL.
- [ ] The export contains no password, OTP, session token, service key, or other
  user's data.
- [ ] **Delete account** is disabled and explicitly says the feature is
  currently unavailable.

## 15. Password recovery

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

## 16. Two-user privacy and RLS

Keep Account A signed in in one private browser profile and create Account B in
a separate private/incognito profile.

- [ ] Account B begins with its own onboarding/profile state.
- [ ] Account B cannot see Account A's plan versions.
- [ ] Account B cannot see or change Account A's check-ins or notes.
- [ ] Account B cannot see, edit, or delete Account A's weights.
- [ ] Account B cannot see Account A's private label food, submission, sanitized
  photo/object path, or export.
- [ ] Account B can see a catalog-owned `pending_review` normalized record keyed
  by GTIN, but not its owner-private source image or personal-food identity.
- [ ] Account B cannot make that pending record plan-eligible, alter its review
  state, or insert it into a generated plan.
- [ ] Account B's snack/skip rows and daily food items remain private from
  Account A in the opposite direction.
- [ ] Logging back into Account A shows its original data unchanged.

In a signed-out terminal request, authenticated APIs must fail without a cookie:

```bash
curl --include --request POST http://127.0.0.1:3000/api/foods/lookup \
  --header 'content-type: application/json' \
  --data '{"action":"search_usda","query":"broccoli raw"}'
curl --include http://127.0.0.1:3000/api/food-labels
```

Expected: HTTP 401, no provider result, and no label-submission data.

Then rerun:

```bash
npm run test:db
```

Expected: schema, seed, constraints, atomic RPC behavior, private ownership, and
cross-user RLS denial all pass. Supabase Studio uses an administrative local
view, so seeing all rows there is not evidence of a browser/RLS leak.

## 17. Health, persistence, and recovery

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
`strict-origin-when-cross-origin`, `camera=(self)`, `geolocation=(self)`, and
disabled microphone and payment access. Camera permission is available only for
same-origin label capture; time-zone initialization must not call geolocation.

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

After restart, Account A's profile, tutorial state, label product/photo,
six-slot check-ins, extra-food records, plans, and weights should still exist.
`npm run down` preserves local data.

Idempotency check:

Stop the running Next.js process with Ctrl+C before the first bootstrap:

```bash
npm run bootstrap
npm run bootstrap
npm run doctor
```

Expected: both bootstrap runs succeed, seeded foods and provider/GTIN identities
are not duplicated, user data remains, and existing `.env.local` assignments
including provider configuration are preserved. Restart with `npm run dev:all`.

Only at the very end of testing, and only in a disposable Codespace, you may
test destructive reconstruction:

```bash
npm run db:reset
```

Enter the exact phrase `RESET LOCAL DATABASE`. This intentionally erases local
test accounts and user-created data, reapplies migrations and seed data, and
cannot be treated as an ordinary start command.

## 18. Accessibility and responsive checks

In addition to `npm run test:e2e`, manually check the five protected pages and
the public/auth pages:

- [ ] Complete the critical path using only Tab, Shift+Tab, Enter, Space, and
  arrow keys.
- [ ] A visible focus indicator is always present.
- [ ] The skip link reaches main content.
- [ ] Dialog focus remains inside the dialog and returns to the opener.
- [ ] Nutrition-facts disclosure controls, exact-product actions, file input,
  six meal/snack rows, skip editor, avatar, tutorial, and shopping links all
  expose meaningful accessible names and states.
- [ ] Error summaries, save results, and optimistic rollback messages are
  announced by a screen reader.
- [ ] Form labels and button names are meaningful without surrounding text.
- [ ] At 200% browser zoom, content remains usable without losing controls.
- [ ] At 375, 768, 1280, and 1440 pixels, no page has horizontal overflow.
- [ ] At mobile width, bottom navigation does not cover the final page controls.
- [ ] At desktop width, the sidebar remains usable at ordinary viewport heights.
- [ ] With reduced motion enabled at the operating-system level, no essential
  information depends on animation and decorative transitions are reduced.
- [ ] Without reduced motion, green page/dialog transitions remain subtle,
  preserve reading position, and never delay input or focus.

The automated axe gate checks serious and critical findings; it is not a
substitute for this keyboard, screen-reader, zoom, and visual review.

## 19. Optional real OpenAI smoke test

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

## 20. Expected unavailable boundaries

These are not test failures when the UI states them honestly:

- Hosted Supabase, production SMTP, a public deployment, domain, monitoring,
  billing, and production secrets are not configured.
- Account deletion is visibly disabled pending a reviewed deletion/retention
  procedure.
- A confirmed personal-label product can be used only by its owner and remains
  labeled user-confirmed. A shared GTIN-normalized or external-provider record
  stays `pending_review` and cannot enter generated plans until reviewed.
- USDA's development `DEMO_KEY` is rate-limited; Open Food Facts is a live
  community source. Unavailable, incomplete, or rate-limited provider responses
  are expected error states, not permission to guess.
- Google Maps buttons are external searches only. They do not prove inventory,
  price, distance, availability, or suitability, and Google/ChatGPT are not
  nutrition sources.
- Sanitized label-photo evidence is owner-private and is not included in the
  shared catalog card or JSON account export; the original upload is not stored
  as-is.
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

## 21. Production-container structure

This checks the committed container without claiming a public deployment:

```bash
docker build --tag lets-go-green:local .
docker image inspect \
  --format '{{.Config.User}} {{json .Config.Healthcheck}}' \
  lets-go-green:local
docker run --rm --entrypoint id lets-go-green:local
```

Expected: the image builds, its configured/runtime user is non-root, UID/GID
1001 is used, and the health check targets `/api/health`.

To confirm production fails closed without hosted runtime configuration:

```bash
docker run --detach --rm \
  --name lets-go-green-container-test \
  --publish 3100:3000 \
  lets-go-green:local
curl --include http://127.0.0.1:3100/api/health
docker stop lets-go-green-container-test
```

Expected without hosted Supabase values: HTTP 503 with degraded readiness.
Healthy production-container acceptance requires an authorized staging
Supabase project, migrations, Auth redirects, SMTP, secrets, and backups; those
external services are not included here.

Record each failure with the route, local date/time zone, browser width,
account, exact action, expected result, actual result, console/network error,
and a screenshot. Never include passwords, OTPs, cookies, API keys, or private
export contents in a bug report.
