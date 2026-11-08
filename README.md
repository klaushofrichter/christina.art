# christinaschwarz.art

[![Release](https://img.shields.io/github/v/release/klaushofrichter/christina.art?label=release&color=blue)](https://github.com/klaushofrichter/christina.art/releases)
[![PR checks](https://github.com/klaushofrichter/christina.art/actions/workflows/production-checks.yml/badge.svg)](https://github.com/klaushofrichter/christina.art/actions/workflows/production-checks.yml)
[![Build and publish image](https://github.com/klaushofrichter/christina.art/actions/workflows/build-push.yml/badge.svg?branch=main)](https://github.com/klaushofrichter/christina.art/actions/workflows/build-push.yml)
[![Deploy production](https://github.com/klaushofrichter/christina.art/actions/workflows/deploy-production.yml/badge.svg?branch=production)](https://github.com/klaushofrichter/christina.art/actions/workflows/deploy-production.yml)
[![Dependabot](https://img.shields.io/badge/dependabot-enabled-025E8C?logo=dependabot&logoColor=white)](https://github.com/klaushofrichter/christina.art/security/dependabot)

<!-- No version numbers in this text: they go stale. The release badge shows
     the last released version; GET /health reports the running one.
     The Dependabot badge is static: GitHub has no status endpoint for it, so
     it asserts that alerts, security updates and .github/dependabot.yml are in
     place rather than checking them. -->

The website of the watercolour painter Christina Schwarz, served at
[christinaschwarz.art](https://christinaschwarz.art): her works, one at a time
and enlarged on a tap, recent and upcoming exhibitions, and a short about
section with contact details. Muted and slow by design, and built for phones
first.

All text is in three files under [`content/`](content/), read and checked at
build time (so in every deploy) and compiled into the image:
[`bio.json`](content/bio.json) (name, tagline, bio, email),
[`works.json`](content/works.json) (which pictures, in what order, with
title, year and medium) and [`exhibitions.json`](content/exhibitions.json).
They can be replaced from elsewhere before a deploy; bad data fails the build.
While any of them says `"placeholder": true`, the page wears a DEMO sash. The
footer shows the release, e.g. `v2026.11.08.4`. The pictures go
through `npm run images` (see `CLAUDE.md`), which strips every bit of photo
metadata before anything reaches this public repository.

An Express/TypeScript app, run as a [Knative](https://knative.dev/) Service on
a self-hosted single-node k3s cluster (see
[`klaushofrichter/kube-setup`](https://github.com/klaushofrichter/kube-setup)).
Public, no login, no secrets; the only configuration it reads is `PORT`.

## Hostnames

- `christinaschwarz.art` is the one canonical name.
- `www.christinaschwarz.art` redirects to it permanently (301), keeping path
  and query. The app does this itself for any request whose host starts with
  `www.` (`src/canonical.ts`); the cluster may also do it in front of Knative,
  see `CLAUDE.md`.

## Running it

```bash
npm ci
npm run dev          # http://localhost:8080
npm test             # unit tests (vitest + supertest), incl. a no-metadata check on every picture
npm run images       # import images-incoming/ and assets/c1.png, rebuild public/img
npm run test:e2e     # Playwright; builds and starts the server itself
```

`GET /health` answers `{"status":"ok","service":"christina-art","version":"…"}`.
The version is `dev` locally and the release version in production.

## Branches and deploys

| Branch | What happens |
| --- | --- |
| feature branch → PR | `production-checks.yml`: `test` (unit, build, audit, image built and checked non-root), `e2e`, `codeql` |
| `main` | `build-push.yml` publishes `ghcr.io/klaushofrichter/christina.art:main`, and nothing else. Never deployed. |
| `production` (protected, PR from `main`) | `deploy-production.yml` on the in-cluster runner: version, build, push, update the kube-setup manifest, apply, smoke-test, release |

Releases are tagged `vYYYY.MM.DD.N` (Central time) and carry a
"Verified at release" section with what the deploy observed live.
