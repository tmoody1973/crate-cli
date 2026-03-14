# Crate Website

This directory contains the Next.js marketing and demo site for `crate-cli`.

It is separate from the terminal app in the repository root.

## Run Locally

```bash
cd www
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Available Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Main Routes

- `/` - landing page
- `/how-it-works` - workflow walkthrough
- `/influence-demo` - influence-path demo page

## Notes For Maintainers

- This app is marketing/demo copy, not the CLI runtime.
- Product claims here should stay aligned with the canonical docs in `../docs/`.
- If install steps, server counts, or feature framing change, update both the website copy and the root docs.
