# BoardScope — AI Instructions

## Build & Release

**To build a new release:**
```bash
npm run release
```
This single command: restores readable source → backs up to src-unobfuscated/ → obfuscates → builds all platforms (Win/Mac/Linux) → restores readable source. Never run electron-builder directly for releases.

**After the build**, upload files from `dist/` to the GitHub release:
- `BoardScope Setup X.X.X.exe` — Windows
- `BoardScope-X.X.X.dmg` — macOS Intel
- `BoardScope-X.X.X-arm64.dmg` — macOS Apple Silicon
- `BoardScope-X.X.X.pkg` / `BoardScope-X.X.X-arm64.pkg` — macOS pkg
- `BoardScope-X.X.X.AppImage` — Linux

## Source Code Rules

- **Root .js files** (`electron-main.js`, `preload.js`, `server.js`) must ALWAYS be readable source. Never leave them obfuscated.
- **`src-unobfuscated/`** is the readable backup — gitignored, stays local only. Never delete it.
- **`dist-obfuscated/`** holds obfuscated output — gitignored, only used during builds.
- **Never run `npm run build:*` directly** — those ship readable source. Always use `npm run release`.

## Git / Distribution

- `origin` = `boardscope.ca` (public repo) — only push obfuscated code here
- GitHub release tag must match `package.json` version exactly (e.g. `6.0.2`) for the in-app update checker to work
- `src-unobfuscated/` is in `.gitignore` — readable source never gets pushed

## Version Bump Checklist

1. Update `"version"` in `package.json`
2. Run `npm run release`
3. Push code to `origin` (will be obfuscated)
4. Create GitHub release with matching tag, upload `dist/` artifacts
