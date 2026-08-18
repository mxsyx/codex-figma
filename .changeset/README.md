# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to manage
versions and changelogs for the publishable package `@codex-figma/bridge`.

> `@codex-figma/figma-plugin` and `@codex-figma/codex-plugin` are `private` and
> excluded from changeset versioning (see `ignore` in `config.json`).

## Adding a changeset

When you make a change that should be released, run:

```bash
pnpm changeset
```

This prompts you to:

1. Select the package(s) affected — only `@codex-figma/bridge` is publishable.
2. Choose bump type: `major` / `minor` / `patch`.
3. Write a summary that becomes the CHANGELOG entry.

The changeset file is written under `.changeset/` and should be committed.

## Versioning

When ready to consume pending changesets and bump versions:

```bash
pnpm version-packages
```

This consumes all pending changesets, bumps `package.json` versions, and updates
`CHANGELOG.md`.

## Publishing

```bash
pnpm release
```

This runs `build` then `changeset publish` to publish `@codex-figma/bridge` to
npm.
