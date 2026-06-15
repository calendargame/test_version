// defineConfig is imported from 'vitest/config' (a superset re-export of vite's own) so
// the single config serves BOTH `vite build`/`vite dev` (which ignore the `test` key) and
// Vitest (which reads it). The react plugin is shared, giving test files the same JSX
// transform as the app. Build behavior is unchanged by this import swap.
import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { copyFileSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// GitHub Pages serves the org ROOT page `calendargame.github.io` (and its custom domain
// calendargame.app) from '/', but every PROJECT repo's Pages site from '/<repo>/'. CI sets
// GITHUB_REPOSITORY="owner/repo", so deriving the base from it lets ONE codebase deploy correctly to
// BOTH the live repo and the staging repo (currently `test_version`) — and it stays correct even if
// the staging repo is renamed later, with no code change. Local builds have no GITHUB_REPOSITORY → '/'.
const pagesBase = (repository) => {
  const repo = (repository || '').split('/')[1] || ''
  return repo && repo !== 'calendargame.github.io' ? `/${repo}/` : '/'
}

// True only for the live production repo's CI build. Used to inject the Cloudflare Web Analytics
// beacon on PRODUCTION ONLY (calendargame.app) — not the staging repo, not local/dev builds — so our
// own testing never pollutes the real visitor numbers.
const isLiveRepo = (repository) => (repository || '').endsWith('/calendargame.github.io')

// Cloudflare Web Analytics: privacy-first, cookieless page analytics (no consent banner needed).
// The site is DNS-only (not proxied through Cloudflare), so Cloudflare can't auto-collect — we inject
// the manual beacon into the built index.html. The token is PUBLIC (it ships in the page HTML for
// every visitor), so it's fine in source. Remove this plugin + its conditional below to drop analytics.
// ⚠ The token below must be the value from Cloudflare's "Enable with JS Snippet installation" snippet —
// NOT the dashboard site ID (the /web-analytics/edit/<id> value). Using the site ID was the original B1
// bug: beacons sent fine but Cloudflare silently dropped them all (zero data). Fixed 2026-06-06.
const cfWebAnalytics = () => ({
  name: 'cf-web-analytics-beacon',
  transformIndexHtml: (html) =>
    html.replace(
      '</head>',
      `  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "f9c4758b29d04e02ad0e757ae824a4b5"}'></script>\n</head>`,
    ),
})

// Test/staging gets a GRAY-background icon set (the live site stays purple) so the two installed apps +
// browser tabs are distinguishable at a glance. The gray icons are pre-generated + committed in
// design/icons/test-build/ (by build-icons.mjs) — NOT in public/, so they never ship to live. For
// non-live builds this plugin, AFTER VitePWA (enforce 'post'), does two things:
//   (1) copies the gray icons over the build OUTPUT so the site SERVES gray everywhere — browser tab
//       (favicon), home screen (apple-touch), and the PWA manifest icons (same filenames, so
//       index.html + the manifest references are unchanged);
//   (2) CORRECTS the service-worker precache revision for each icon. vite-plugin-pwa hashes the SOURCE
//       public/ (purple) file for includeAssets/manifest-icon revisions — computed OUTSIDE workbox
//       manifestTransforms' reach — so a gray icon would otherwise inherit the PURPLE file's md5 as its
//       revision. Workbox then sees the SAME revision as the previous/live purple SW and treats the
//       icon as unchanged → it keeps serving the cached PURPLE icon (the gray never shows). Rewriting
//       the revision in sw.js to the GRAY file's md5 makes Workbox re-fetch the gray icon.
// Build-only; non-live only (staging + local). Live is entirely untouched (normal purple precache).
// (Owner: distinguish test from live, 2026-06-13.)
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), 'public')
const TEST_ICON_DIR = join(dirname(fileURLToPath(import.meta.url)), 'design', 'icons', 'test-build')
const TEST_ICON_FILES = [
  'favicon.svg',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'pwa-64x64.png',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'maskable-icon-512x512.png',
]
const md5 = (buf) => createHash('md5').update(buf).digest('hex')
const testIconVariant = () => {
  let outDir = 'dist'
  return {
    name: 'test-icon-variant',
    apply: 'build',
    enforce: 'post', // run after VitePWA writes sw.js so we can correct its icon precache revisions
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      // {purpleMd5 -> grayMd5} for each icon: the revision vite-plugin-pwa wrote (md5 of the purple
      // source) -> the actual gray file's md5. Also serve the gray icons.
      const revMap = {}
      for (const f of TEST_ICON_FILES) {
        const grayPath = join(TEST_ICON_DIR, f)
        if (!existsSync(grayPath)) continue
        copyFileSync(grayPath, join(outDir, f)) // (1) serve gray
        const pubPath = join(PUBLIC_DIR, f)
        if (existsSync(pubPath)) revMap[md5(readFileSync(pubPath))] = md5(readFileSync(grayPath))
      }
      // (2) rewrite the precache revisions in the generated SW so Workbox re-fetches the gray icons.
      for (const sf of readdirSync(outDir)) {
        if (sf !== 'sw.js' && !/^workbox-.*\.js$/.test(sf)) continue
        const p = join(outDir, sf)
        let s = readFileSync(p, 'utf8')
        let changed = false
        for (const [purple, gray] of Object.entries(revMap)) {
          if (purple !== gray && s.includes(purple)) {
            s = s.split(purple).join(gray)
            changed = true
          }
        }
        if (changed) writeFileSync(p, s)
      }
    },
  }
}

export default defineConfig(({ command, mode }) => ({
  // Dev/preview serve from '/'. A production `vite build` derives its base from the repo it builds
  // in (see pagesBase above): '/' for the live org page, '/<repo>/' for the staging project repo.
  base: command === 'build' ? pagesBase(process.env.GITHUB_REPOSITORY) : '/',
  // Sentry tree-shaking flags (Current Work C1): compile OUT debug logging and all performance-
  // tracing code paths from the lazy error-reporting chunk (we use Sentry for errors only — see
  // src/observability/). This + the static named imports in src/observability/sentryClient.ts keep
  // Session Replay (rrweb), Tracing, and Profiling out of the bundle. The string 'false' is inserted
  // as the raw token `false` (Vite define = raw expression substitution).
  define: {
    __SENTRY_DEBUG__: 'false',
    __SENTRY_TRACING__: 'false',
  },
  // React Compiler — automatic memoization (Stage D2). @vitejs/plugin-react v6 is Rolldown/oxc-based
  // and dropped its old `babel` option, so the compiler runs through @rolldown/plugin-babel fed the
  // plugin's `reactCompilerPreset()`. Defaults are exactly what we want: compilationMode 'infer'
  // (compiles components/hooks), target React 19 (imports react/compiler-runtime), and client-only
  // (the preset's applyToEnvironmentHook). All 40 react-hooks violations were fixed first so every
  // component is compiler-safe to optimize.
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    // PWA (Stage D3): installable + fully offline. vite-plugin-pwa generates the web app
    // manifest + a Workbox service worker that precaches the whole build (so the app runs
    // with no network). registerType 'autoUpdate' + injectRegister 'auto' silently swap in a
    // new service worker on the next visit after a deploy — no update prompt for a solo tool.
    // start_url/scope are derived from Vite `base`, so this is correct for both the live root (/)
    // and the staging project base (/<repo>/). Icons live in public/ (generated
    // from the W5 master by design/icons/build-icons.mjs); apple-touch + favicon are precached
    // via includeAssets and linked (incl. the dark variant) in index.html.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg', 'favicon-32x32.png'],
      manifest: {
        name: 'Calendar Game',
        short_name: 'Calendar Game',
        description: 'A mobile-first trainer for fast mental day-of-the-week calculation.',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // The SW never runs in dev (keeps HMR clean) — offline is verified against a production
      // build via `vite preview`.
      devOptions: { enabled: false },
    }),
    // Gray test/staging icon swap + SW precache-revision fix — non-live builds only (staging + local);
    // the live build keeps the purple public/ icons. enforce:'post' + this position (after VitePWA)
    // ensures it runs once sw.js exists. See testIconVariant above.
    ...(command === 'build' && !isLiveRepo(process.env.GITHUB_REPOSITORY)
      ? [testIconVariant()]
      : []),
    // Cloudflare Web Analytics beacon — PRODUCTION build only (see cfWebAnalytics + isLiveRepo above),
    // so the staging repo and local/dev builds never report and the real numbers stay clean.
    ...(command === 'build' && isLiveRepo(process.env.GITHUB_REPOSITORY) ? [cfWebAnalytics()] : []),
    // Bundle analysis (Stage E2): `npm run analyze` (= `vite build --mode analyze`) emits an
    // interactive treemap to dist/stats.html so we can see what's in the JS bundle and catch
    // surprise bloat as the app grows. Gated on the 'analyze' mode so it NEVER runs in a normal
    // or CI build — zero effect on the shipped output.
    ...(mode === 'analyze'
      ? [
          visualizer({
            filename: 'dist/stats.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
            title: 'Calendar Game — bundle',
          }),
        ]
      : []),
    // Sentry source-map upload (Current Work C1b): makes crash stack traces READABLE (real file/line,
    // not minified gibberish). Runs ONLY in a production build that has a SENTRY_AUTH_TOKEN — a GitHub
    // Actions SECRET set in both repos; local builds (no token) skip it cleanly. It uploads the source
    // maps to Sentry (matched to events by injected debug IDs, so the lazy SDK chunk resolves too),
    // then DELETES them from dist so they're never publicly served. Must be last (processes the final
    // output). org/project slugs are public, not secret. telemetry off.
    ...(command === 'build' && process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: 'ts-6a',
            project: 'javascript-react',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
            telemetry: false,
          }),
        ]
      : []),
  ],
  // Generate hidden source maps ONLY when we're uploading them to Sentry (CI deploys with the auth
  // token). 'hidden' emits the .map files but omits the //# sourceMappingURL comment from the shipped
  // JS, so browsers never fetch them and they aren't referenced; the Sentry plugin above uploads then
  // deletes them. Local builds (no token) generate none — no clutter, no cost — and .map files never
  // count toward the JS size budget anyway (the size script globs *.js only).
  build: {
    sourcemap: process.env.SENTRY_AUTH_TOKEN ? 'hidden' : false,
  },
  test: {
    // Pure-logic tests run in Node (Vitest's default environment). DOM characterization
    // tests (Stage C, Step 6) opt into jsdom per-file via `// @vitest-environment jsdom`.
    // setupFiles run before every test file is imported, in that file's environment, so
    // the jsdom API stubs in tests/setup/dom.js are guaranteed in place before the app
    // module loads. The stubs are window-guarded, so this file is inert under Node and the
    // existing pure-logic tests are unaffected (they only gain jest-dom matchers on expect).
    setupFiles: ['./tests/setup/dom.js'],
    // Don't run the CSS pipeline (Tailwind/PostCSS) for tests — characterization tests
    // import the app (which imports index.css) but assert on behavior/markup, never styles.
    // Skipping CSS keeps the harness fast and removes a moving part. (This is Vitest's
    // default, set explicitly to document intent.)
    css: false,
    // Generous per-test budget (default is 5s). GitHub Actions runners spike under load, and a
    // load-induced slowdown of a compute-heavy test (e.g. the 100k-generation date-gen fuzz) once
    // transiently failed the "Run tests" deploy gate on the production runner while the SAME commit
    // passed on staging + locally. 20s gives ample headroom without masking a genuinely-hung test;
    // the heavy fuzz profiles (tests/engine/fuzz) set their own larger budget on top of this.
    testTimeout: 20000,
  },
}))
