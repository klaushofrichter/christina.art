# CLAUDE.md

Operational context for working in this repo.

## What this is

The website of the artist **Christina Schwarz**, served at
`christinaschwarz.art`: an Express/TypeScript app deployed as a Knative
Service on the `kube-setup`-managed k3s cluster. It is modelled on
`klaushofrichter/art` (same layout, workflows and release process); when in
doubt about a pattern, that repo and kube-setup's
`docs/cluster-deployment-requirements.md` / `docs/repository-baseline.md` are
the references.

**For now it is a placeholder**: her name and "Website coming soon". Put
nothing on the page that has not been supplied (no biography, works, prices
or contact details invented for her). What the site will eventually hold is
Klaus's call.

Fully public: no OAuth, no sessions, no secrets, no `.env`. The only
configuration it reads is `PORT` (and `APP_VERSION`, stamped by the deploy).

## Names

- Repo and image: `christina.art`, `ghcr.io/klaushofrichter/christina.art`.
- Kubernetes names cannot contain dots, so inside the cluster everything is
  **`christina-art`**: the namespace, the ksvc, labels. The runner lives in
  **`christina-art-runner`**. The manifest is
  `kube-setup/manifests/christina-art/christina-art-ksvc.yaml`.
- `christinaschwarz.art` is canonical. `www.christinaschwarz.art` must 301 to
  it with path and query kept.

## The www redirect

A Knative `DomainMapping` can rewrite the Host header to the ksvc's internal
name before the request reaches the pod, so an in-app redirect keyed on the
host may never see `www.`. kube-setup already has a proven cluster-side
pattern for exactly this (`manifests/insta/insta-legacy-redirect.yaml`: a
Traefik `redirectRegex` IngressRoute in `kourier-system`, priority 1000, ACME
path exempted, with the www certificate kept on the knative-gateway Ingress).
That is the recommended primary. `src/canonical.ts` redirects too, reading
`req.hostname` (Host, or X-Forwarded-Host through `trust proxy`), and is the
fallback if the original host does reach the app. The deploy's smoke test
checks the behaviour from outside either way, accepting 301 or 308 (Traefik
answers HEAD/POST with 308).

## Branches

- `main`: development, unprotected. A push builds and pushes `:main`, that
  tag and no other (`build-push.yml`). Not deployed.
- `production`: protected, PR-only from `main`. A merge runs
  `deploy-production.yml` on the in-cluster self-hosted runner
  (`[self-hosted, k3s]`, registered to this repo only).

**Only the deploy writes a production tag** (`:<sha>`, `:v<version>`,
`:latest`). The manifest pins `:<sha>`; a main build writing the same tag
would replace the released image under the pin.

Required checks on `production`: `test`, `codeql`, `e2e` (each is its own job
in `production-checks.yml`, so each reports its own context).

**Never merge into `production` on your own.** Releases happen with Klaus's
approval.

## Versioning and releases

`vYYYY.MM.DD.N`, generated in the deploy from the existing release tags,
dated `TZ=America/Chicago`. `package.json` carries no version. The value
reaches the image as `ARG APP_VERSION` and `/health` reports it; the smoke
test polls until the live `/health` reports the version that run stamped.

Notes: `## [Unreleased]` in `CHANGELOG.md`, then the commits since the last
release, then "Verified at release" from the smoke test
(`scripts/release-notes.sh`, renderable locally with stub values; see its
header). **Empty `[Unreleased]` as part of promoting**:
`scripts/check-changelog.sh` fails `test` on a PR into `production` that
would republish the previous notes.

## Node 26, in three places that move together

Both `Dockerfile` stages (`node:26-alpine`), `node-version:` in every
workflow, and `@types/node` in `package.json`. Take a Node major bump from
Dependabot in all three or none.

## Container

`USER 1000:1000` (numeric, so the image is non-root on its own). The `test`
check builds the image and runs it with no `--user` to prove it. The ksvc in
kube-setup carries the matching non-root, drop-ALL `securityContext` with
`runAsUser`/`runAsGroup: 1000`.

## Don't run Playwright on the self-hosted runner

It is capped at 512Mi and a browser install OOM-kills it (GitHub reports it
as "lost communication with the server"). Playwright runs in the `e2e` job on
GitHub's runners; the deploy smoke-tests with `curl` and `sed` (no `jq` there).

Locally, if Playwright's own browser is not installed, point it at one with
`PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

## Cluster side

Lives in `klaushofrichter/kube-setup` and is changed by the kube-setup
session, not from here: `manifests/christina-art/` (ksvc, DomainMapping) and
`manifests/christina-art-runner/` (runner namespace, ServiceAccount, RBAC,
NetworkPolicy). Secrets: `KUBE_SETUP_DEPLOY_TOKEN` (Actions secret in this
repo) and `runner-pat` (Kubernetes Secret in `christina-art-runner`).
