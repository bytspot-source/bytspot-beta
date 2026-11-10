# Google Maps key in public git history (REA X9): what Daniel needs to do

**Status:** code is clean. The key itself is still live in history, so Daniel has to act.
Checked 2026-11-10 on `fix/abuse-risk-review-2026-11-10`.

## What we know
- A Google Maps browser key (starts with `AIza`, 39 characters) was hard-coded
  as a fallback for `VITE_GOOGLE_MAPS_API_KEY` in `src/components/ValetFlow.tsx`.
  It appears in commits `0637bf6` and `68c7f12`, and was removed in `81111a5`
  ("replace maps embed with static preview").
- At HEAD nothing in bytspot-beta reads `VITE_GOOGLE_MAPS_API_KEY`, and there
  is no `AIza…` string in tracked files. The web app no longer needs a browser
  Maps key.
- The API uses its own server-side `GOOGLE_PLACES_API_KEY` (Render env). It may
  or may not be the same Google key. **Check this first.**
- We are **not** rewriting git history. Rewriting doesn't un-leak a key that
  was already public and cloned, and it would break every clone and PR.
  Rotating or restricting the key is the actual fix.

## Steps (Google Cloud Console, project that owns the key)
1. Find the key. Go to APIs & Services, then Credentials. Match it on the first
   and last few characters of the value in `git show 68c7f12 -- src/components/ValetFlow.tsx`.
   Run that locally; don't paste the key anywhere.
2. If it is the **same key** as Render's `GOOGLE_PLACES_API_KEY`:
   1. Create a new server key, restricted to the APIs the backend uses
      (Places API (New), plus Geocoding if used) and, if possible, to Render's
      outbound IPs.
   2. Set it in Render as `GOOGLE_PLACES_API_KEY` and redeploy.
   3. Then delete the old key.
3. If it is a **separate browser key** that nothing uses any more, delete it.
4. If something still needs a browser key, restrict it:
   - Application restriction: HTTP referrers `https://bytspot.app/*`,
     `https://*.bytspot.app/*`, `https://bytspot.com/*`.
   - Or for iOS, the bundle IDs of the app and the Clip.
   - API restriction: only the Maps APIs it calls.
5. Set a daily quota cap and a billing budget alert on the project.
6. Decide whether `bytspot-beta`, `bytspot` and `bytspot-ai` should be public.
   The REA report found them public.

## How to verify
- Old key in Credentials is deleted (or restricted as above).
- Places-backed screens in the app still load after the Render redeploy.
- `git grep -n 'AIza' HEAD` in each repo returns nothing.
