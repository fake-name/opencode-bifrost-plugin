# Publishing

Releases are published to npm automatically by [`workflows/publish.yml`](workflows/publish.yml) whenever a `vX.Y.Z` tag is pushed. It authenticates via npm's [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) instead of a stored `NPM_TOKEN` secret, and verifies the tag matches `package.json`'s `version` before publishing.

## One-time bootstrap

Trusted publishing can only be configured for a package that already exists on the registry:

1. Publish the first version manually: `npm run build && npm publish` (requires `npm login` or an npm token locally).
2. On npmjs.com, go to the package's **Settings → Trusted publishing** and add a GitHub Actions publisher with:
   - Organization/user: `Yeti47`
   - Repository: `opencode-bifrost-plugin`
   - Workflow filename: `publish.yml`
   - Environment name: leave blank (the workflow doesn't gate on a GitHub environment; add one on both sides later if you want a manual-approval step before publishing)

## Releasing

From then on, bump `version` in `package.json`, commit, and push a matching `vX.Y.Z` tag to publish:

```sh
git tag v0.2.0
git push origin v0.2.0
```
