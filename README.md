# FnaSPSE

A small, password-protected download page for FnaSPSE.

- One password screen, one download screen, one footer.
- Server-side password verification with a signed, `HttpOnly` session cookie.
- Download links and checksums are never included in the static HTML or client JS.
- One configuration file.
- No database, frameworks, build step, or runtime dependencies.

## Project structure

```text
.
├── functions/
│   ├── _config.js          # Game version, description, builds, checksums
│   ├── _lib/               # Authentication, config normalization, helpers
│   └── api/
│       ├── config.js       # GET /api/config
│       ├── login.js        # POST /api/login
│       └── [[path]].js     # JSON 404 for unknown API routes
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── _headers            # CSP and security headers
├── tests/api.test.js
├── .dev.vars.example
├── package.json
└── wrangler.toml
```

## 1. Configure the game

Edit [`functions/_config.js`](functions/_config.js). This file is bundled into Cloudflare Pages Functions only; it is never served as a static asset.

```js
export const game = {
  name: "FnaSPSE",
  version: "1.0.0",
  description: "A short description shown on the download screen.",
};

export const platforms = [
  {
    name: "Windows",
    available: true,
    format: "ZIP",
    size: "184 MB",
    url: "https://github.com/OWNER/REPO/releases/download/v1.0.0/FnaSPSE-1.0.0-windows-x64.zip",
    sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
  // Linux and macOS entries follow the same shape.
];
```

- `version` is used in the footer automatically.
- Leave `description` empty to hide it.
- A platform is downloadable only when `available` is `true`, `format` and `size` are non-empty, and `url` is a valid absolute `https://` URL.
- `sha256` must be exactly 64 hexadecimal characters to be displayed. Leave it empty (or omit it) to hide the checksum.
- Set `available: false` to show the platform with "Unavailable". The three included entries are placeholders and start unavailable.

Generate a checksum after building the file:

```sh
sha256sum FnaSPSE-1.0.0-windows-x64.zip   # Linux
shasum -a 256 FnaSPSE-1.0.0-windows-x64.zip   # macOS
```

The file size is free-form display text, for example `"184 MB"`.

## 2. Set the secrets

Two encrypted environment variables are required:

| Variable | Purpose |
| --- | --- |
| `GAME_PASSWORD` | The shared password users enter. |
| `SESSION_SECRET` | Signs session cookies. Must be at least 32 characters. |

Generate a strong session secret:

```sh
openssl rand -base64 48
```

For local development:

```sh
cp .dev.vars.example .dev.vars
```

Then edit `.dev.vars` with your values. This file is git-ignored.

In Cloudflare Pages, open your project → **Settings** → **Variables and Secrets**, and add both values for **Production** (and **Preview** if you use preview deployments). Mark them as secrets/encrypted.

The password is never sent to the browser, included in client-side JavaScript, or exposed by an API response.

## 3. Run locally

Requirements: Node.js 20 or newer.

```sh
npm test
npx wrangler pages dev
```

Open <http://localhost:8788>. Wrangler reads `wrangler.toml` and `.dev.vars`.

## 4. Deploy to Cloudflare Pages

### Git integration (recommended)

1. Push this repository to GitHub.
2. In the Cloudflare dashboard, go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the repository.
4. Use these build settings:
   - **Framework preset:** None
   - **Build command:** leave empty
   - **Build output directory:** `public`
   - **Root directory:** repository root
   - **Deploy command** (if shown): leave empty
5. Add `GAME_PASSWORD` and `SESSION_SECRET` under **Variables and Secrets** for Production and Preview. These are runtime secrets for the Functions.
6. Deploy.

Do not add `npx wrangler pages deploy public` as a build or deploy command. Cloudflare Pages uploads the build output and deploys the Functions itself after the build. Calling Wrangler from inside a Pages build uses the build system's internal token and fails with `Authentication error [code: 10000]`.

Do not put `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` in the Pages project's runtime Variables and Secrets. They are deployment credentials, not application configuration, and they do not replace the internal build token.

Cloudflare detects the `/functions` directory at the repository root and deploys the API automatically. Every push to the production branch creates a new deployment.

### GitHub Actions alternative

The workflow in [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) deploys with Wrangler from GitHub Actions instead of using the Pages build system. It is manual by default.

1. Create a Cloudflare API token with **Account → Cloudflare Pages → Edit**. The `Account API Tokens` permission is not needed for deployment.
2. In GitHub, open **Settings → Secrets and variables → Actions** and add:
   - `CLOUDFLARE_API_TOKEN`: the token value
   - `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID
3. In GitHub, open **Actions → Deploy to Cloudflare Pages → Run workflow**.

To deploy automatically on every push, uncomment the `push` trigger in the workflow and disable automatic deployments in Cloudflare under **Build → Branch control**:
- Turn off **Enable automatic production branch deployments**.
- Set the preview branch to **None**.

Run only one deployment system per branch, otherwise each push deploys twice.

### Wrangler CLI

```sh
npx wrangler login
npx wrangler pages project create fnaspse
npx wrangler pages deploy public
```

Run the deploy command from the repository root — that is how Wrangler finds the `functions/` directory. Set the two secrets in the dashboard, or with:

```sh
npx wrangler pages secret put GAME_PASSWORD --project-name fnaspse
npx wrangler pages secret put SESSION_SECRET --project-name fnaspse
```

If you rename the project, update `name` in `wrangler.toml`.

## 5. Host the builds on GitHub Releases

1. Create a GitHub release with a tag such as `v1.0.0`.
2. Upload the platform archives.
3. Use each asset's public download URL in `functions/_config.js`:

   ```text
   https://github.com/<owner>/<repo>/releases/download/<tag>/<asset-name>
   ```

A public GitHub release means anyone with the asset URL can download the file. The password protects the page that presents the links; it does not make GitHub-hosted files private.

## 6. Add the in-browser build

The exported Godot web build lives in `Web_Game/`. This site does not serve it directly: Cloudflare Pages rejects files larger than 25 MiB, and `FnaSPSE.pck` (120 MB) and `FnaSPSE.wasm` (38 MB) are well above that limit. Host the folder elsewhere and link to it.

1. Upload the contents of `Web_Game/` to a static host with no per-file size limit — for example a Cloudflare R2 bucket with a custom domain, Netlify, or itch.io. Keep the file names and the flat folder structure.
2. Check the response content types: `.wasm` should be `application/wasm`, `.js` `text/javascript`, `.html` `text/html` and `.pck` `application/octet-stream`. R2 infers these from the file extension on upload; set them explicitly if your host does not.
3. Open the hosted `FnaSPSE.html` and confirm the game loads.
4. In [`functions/_config.js`](functions/_config.js), set `webGame.available` to `true` and paste the public URL of `FnaSPSE.html` into `webGame.url`. It must use `https://`.

The "Play in browser" option then appears above the download list after sign-in and opens the hosted build in a new tab. As with GitHub Releases, anyone who knows the hosted URL can open the build; the password protects the page that links to it, not the host itself.

No cross-origin isolation headers are required: this export has Godot threads disabled (`GODOT_THREADS_ENABLED = false`).

Keep `Web_Game/` out of the repository: GitHub rejects files over 100 MB, and `FnaSPSE.pck` is 120 MB. Upload it directly to the host instead.

## How it works

- `POST /api/login` verifies the password on the server with a constant-time comparison, then sets a 12-hour signed session cookie (`HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS).
- `GET /api/config` returns only the game name and version before sign-in. The browser build URL, download URLs, file sizes and checksums are returned only for a valid session.
- Session tokens are HMAC-signed. Changing `GAME_PASSWORD` or `SESSION_SECRET` invalidates every existing session.
- Failed sign-ins are limited to 10 per IP address per 15 minutes. This limiter is in-memory and per Cloudflare isolate, so it is best-effort and deliberately requires no database.
- The page sends a strict CSP and related security headers via `public/_headers`.

## Tests

```sh
npm test
```

The zero-dependency test suite covers password rejection, session creation and tampering, cookie flags, rate limiting, malformed requests, missing configuration, and URL/checksum validation.

## Troubleshooting

**"The site is not configured correctly" / sign-in returns 500**  
`GAME_PASSWORD` or `SESSION_SECRET` is missing. Locally, check `.dev.vars`; in Cloudflare, check both Production and Preview environments. `SESSION_SECRET` must be at least 32 characters.

**A platform still says "Unavailable"**  
Check that `available` is exactly `true`, `format` and `size` are non-empty, and `url` uses `https://`. Invalid config values are ignored rather than exposed.

**Checksum is not shown**  
It must be a 64-character hexadecimal SHA-256 digest. Invalid values are hidden.

**GitHub download returns 404**  
Check the release tag and asset filename. Uploading a replacement asset can change the final URL — copy it from the release page after uploading.

**Changes do not appear**  
Changes to `functions/` and `public/` require a redeploy. If the page is still cached in your browser, hard-refresh once.
