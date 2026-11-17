# Local replay viewer fixes

`fix/hidden-transformations` tracks HearthSim/Joust main. This is a local viewer
fork, not a fork of HSReplay.net's private website/backend.

Announce Darkness may report only DISPLAYED_CREATOR for a hidden hand/deck
transformation. A previously known neutral Barrel of Sludge must then become
unknown. The fix invalidates its old identity and suppresses replay-wide oracle
fallbacks until ShowEntity reveals its replacement. Immutable earlier states
retain their original identity; later knowledge cannot leak backward. A known
Warlock result already revealed by the client is preserved. Other creator
effects and ordinary known cards retain existing behavior.

Eight regression cases exercise the XML decoder, immutable state, hand rendering
and oracle fallback. A separate Windows path normalization patch makes the
upstream Vitest enum loader work on Windows.

```powershell
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
$env:NODE_OPTIONS = '--openssl-legacy-provider'
pnpm build
```

The legacy OpenSSL option is required by upstream Webpack 3 on modern Node.
The build goes into ignored `dist/`. No account credentials, user replays or
personal logs belong in this repository. Existing upstream copyright notices
are retained.

Run `./Update-LocalFork.ps1` to fetch upstream, preserve a backup branch, rebase
the patches and run tests/typechecking/build. Conflicts are aborted for review;
failed validation is reported. It never installs a browser extension, changes
HSReplay.net, pushes to GitHub, or replaces a working deployment.

The patch fixes this verified Announce Darkness case, not every possible hidden
transformation. HSReplay.net's live player remains unchanged unless its operator
adopts the fix. A [local launcher](local-viewer/README.md) now serves this build
and opens HDT recordings directly from the recorded-games list.
