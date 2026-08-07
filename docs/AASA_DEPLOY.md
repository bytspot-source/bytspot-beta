Deployment steps for Apple App Site Association (AASA)

1) bytspot.app (native + App Clip)
- File path to host: https://bytspot.app/.well-known/apple-app-site-association
- Copy the repository file `public/.well-known/apple-app-site-association` to that location on your bytspot.app hosting (served with Content-Type: application/json and no .json extension).
- Ensure the file includes `applinks` details with `appIDs` for your App and Clip (e.g., `MK4J6M36S8.com.bytspot.app`, `MK4J6M36S8.com.bytspot.app.Clip`) and `appclips` listing the Clip app ID.

2) bytspot.com (PWA-only)
- File path to host: https://bytspot.com/.well-known/apple-app-site-association
- Use the repository file `public/.well-known/apple-app-site-association.bytspot.com.json` as a placeholder deployment file.
- Important: Do NOT include any `appclips` entries or `appIDs` in this file if you want `bytspot.com` to be PWA-only and not open native app/App Clip.

3) Hosting requirements
- Serve the AASA file at `/.well-known/apple-app-site-association` with `Content-Type: application/json` (no redirects, no .json suffix).
- Ensure TLS certificates are valid (HTTPS required).

Render content-type fix (bytspot.app is a Render static site — `rndr-id` response header):
- Render ignores the Netlify-style `public/_headers` file in this repo and serves the extensionless AASA file as `binary/octet-stream`. Apple's CDN generally tolerates this, but the correct type must be set outside the repo.
- Render dashboard: Static Site → Settings → Headers → add path `/.well-known/apple-app-site-association`, header `Content-Type`, value `application/json`. Repeat for `/apple-app-site-association`.
- Alternative (Cloudflare fronts the domain): Rules → Transform Rules → Modify Response Header — when URI Path equals `/.well-known/apple-app-site-association`, set `Content-Type` to `application/json`.
- Verify: `curl -sI https://bytspot.app/.well-known/apple-app-site-association | grep -i content-type` → `application/json`.

4) After deployment
- Rebuild the native app and sync Capacitor:

```bash
npm run build
npx cap sync ios
```

- Open Xcode (`npx cap open ios`) and confirm the Associated Domains capability for both App and Clip targets lists only `bytspot.app` entries.
- Test:
  - Visiting `https://beta.bytspot.com` should behave as your PWA.
  - Invoking an App Clip URL (`https://bytspot.app/p/<id>`) should open the App Clip only.

If you want, I can deploy the AASA files to a hosting target you specify (FTP/S3/Netlify) or open the iOS project and confirm Associated Domains in Xcode. Provide credentials or allow me to run verification commands where appropriate.