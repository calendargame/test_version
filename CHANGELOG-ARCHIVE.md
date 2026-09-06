# Changelog archive

Retired entries from the in-app changelog (`src/changelog.ts`) — the plain-words "What's new"
list players read behind **⚙ Settings → Changelog**.

`src/changelog.ts` holds **at most ten day-entries, ever**. The popup renders that array as-is,
so anything left in the code file both ships to every visitor and gets drawn. When a new day
would make it eleven, the **oldest** entry moves out of the code file and into this one —
unchanged, keeping its ISO date and its lines verbatim, newest day first below.

This file is documentation only. **No source file imports it**, it lives outside `public/`, and
the build never touches Markdown, so not one byte of retired history reaches the bundle. The rule
lives with the data, in the charter comment at the top of `src/changelog.ts`.

## Retired entries

### 2026-07-17

- Blitz Per Question gains an Allow Mistakes option, with its own best score and best streak.
- Timer readouts keep one steady width, so sliders no longer shift as values change.
- Dropdown menus in the guide close when the page scrolls.
- Every reset snaps the screen back instantly and cleanly.
- Deduction stays centered and its layout holds steady while you answer.
- A View saved defaults link shows exactly what you saved.
- The app stays portrait: Android installs lock to it, and turning an iPhone sideways brings up a rotate-back screen that pauses any countdown.
- Text in the guide can now be selected and copied.
- Plus a round of smaller fixes and polish throughout.
