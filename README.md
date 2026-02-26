# HyperNote

HyperNote is a local-first note app MVP with:

- Svelte frontend shell
- contract-locked protocol/storage definitions
- planned Tauri v2 backend command surface

## Commands

```bash
npm install
npm run lint
npm run format:check
npm run test
npm run dev
```

## Contract Files

- `plan.md`
- `docs/contracts.md`
- `src/lib/contracts/*`

## Branch Workflow

- integration: `int/mvp-core`
- builder A: `feat/a-core-persistence`
- builder B: `feat/b-sync-ui`
