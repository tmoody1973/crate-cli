# Plan: Publish crate-cli to npm

Make `npx crate-cli` work as a zero-config install command.

---

## Current State

- `package.json` has `"main": "src/cli.ts"` — points to TypeScript source
- No `bin` field — npm doesn't know this is a CLI
- No build step — raw `.ts` files can't run via `npx`
- Dev runner is `tsx` (devDependency) — not available to end users
- Name `crate-cli` is **available** on npm (no existing package)

## What Needs to Change

### 1. Add TypeScript build config

Create `tsconfig.build.json` (separate from the existing `tsconfig.json` which is for type-checking only):

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "tests"]
}
```

### 2. Update `package.json`

```jsonc
{
  "name": "crate-cli",
  "version": "0.1.0",
  "bin": {
    "crate": "dist/cli.js"         // <-- the CLI entry point
  },
  "files": [
    "dist",                        // compiled JS
    ".env.example"                 // so users can cp it
  ],
  "main": "dist/cli.js",
  "types": "dist/cli.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "prepublishOnly": "npm run build",
    "dev": "tsx src/cli.ts",
    // ... keep existing dev scripts
  }
}
```

### 3. Add shebang to `src/cli.ts`

Add as the very first line:

```typescript
#!/usr/bin/env node
```

This tells the OS to run the compiled `dist/cli.js` with Node when invoked as `crate`.

### 4. Fix `.js` extension imports

The compiled output uses ES modules (`"type": "module"`). All relative imports in `src/` already use `.js` extensions (e.g. `./agent/index.js`), which is correct — TypeScript resolves `.js` to `.ts` during compilation, and the output keeps `.js`. Verify none are missing.

### 5. Handle `dotenv` for end users

Currently `src/cli.ts` does `import "dotenv/config"` which loads `.env` from `process.cwd()`. This is fine — end users will either:
- Set env vars in their shell, OR
- Create a `.env` file in the directory they run `crate` from

No change needed, but document this in the README.

### 6. Verify native dependencies

`better-sqlite3` is a native module that compiles on install. This should work via npm install, but:
- Confirm it builds on macOS, Linux, Windows
- Consider adding `optionalDependencies` or a fallback if it fails
- The influence cache server uses this — if it fails, other servers still work

### 7. Runtime dependency on `mpv` and `yt-dlp`

The audio player requires `mpv` and `yt-dlp` installed on the user's system. These are NOT npm packages. The CLI should:
- Gracefully fail with a helpful message if they're missing
- Already handled: the youtube/radio servers check for mpv availability

### 8. Add `.npmignore` or use `files` whitelist

The `files` field in package.json (step 2) acts as a whitelist — only `dist/` and `.env.example` get published. This automatically excludes:
- `src/` (TypeScript source)
- `tests/`
- `www/` (landing page)
- `.env` (secrets)
- `docs/`

### 9. Test locally before publishing

```bash
# Build
npm run build

# Test the compiled CLI directly
node dist/cli.js --help

# Test as if installed globally
npm link
crate --help
crate  # should start a session

# Test npx simulation
npm pack  # creates crate-cli-0.1.0.tgz
npx ./crate-cli-0.1.0.tgz --help
```

### 10. Publish

```bash
# Login to npm (one-time)
npm login

# Publish (prepublishOnly runs build automatically)
npm publish
```

After publishing:
```bash
# Anyone can now run:
npx crate-cli
# Or install globally:
npm install -g crate-cli
crate
```

### 11. Update the landing page

Once published, update the Getting Started section:
- Replace git clone instructions with `npx crate-cli`
- Add a note about global install as alternative
- Keep the API keys section as-is

---

## Files to Modify

| File | Change |
|------|--------|
| `tsconfig.build.json` | **New** — build config targeting `dist/` |
| `package.json` | Add `bin`, `files`, `types`, `build` script, `prepublishOnly` |
| `src/cli.ts` | Add `#!/usr/bin/env node` shebang on line 1 |
| `.npmignore` | Optional — `files` whitelist may be sufficient |
| `www/app/page.tsx` | Update install instructions after publishing |
| `README.md` | Add npm install instructions |

## Verification

1. `npm run build` — compiles to `dist/` without errors
2. `node dist/cli.js --help` — prints usage
3. `npm link && crate --help` — works as global command
4. `npm pack` — tarball contains only `dist/`, `.env.example`, `package.json`, `README.md`
5. `npx ./crate-cli-0.1.0.tgz` — starts the agent

## Post-Publish

- Add npm version badge to README and landing page
- Set up GitHub Action to auto-publish on tagged releases
- Consider `postinstall` script that prints setup instructions
