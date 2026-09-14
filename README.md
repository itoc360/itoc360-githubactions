# ITOC360 Alert — GitHub Action

[![Test](https://github.com/itoc360/itoc360-action/actions/workflows/test.yml/badge.svg)](https://github.com/itoc360/itoc360-action/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Raise and resolve [ITOC360](https://www.itoc360.com) alerts from a workflow.

When a deployment or a build breaks, this step routes it through your ITOC360
escalation policies and on-call schedules — SMS, voice call, email and push —
instead of into a channel nobody is watching at 3am.

## Quick start

```yaml
- name: Notify ITOC360 on failure
  if: failure()
  uses: itoc360/itoc360-action@v1
  with:
    token: ${{ secrets.ITOC360_TOKEN }}
    severity: critical
```

That is the whole setup. The title, the description and the deduplication key
are derived from the workflow that raised the alert.

## Setup

1. In the [ITOC360 app](https://itoc360.app), create a source and copy its
   token.
2. In your repository, go to **Settings → Secrets and variables → Actions** and
   add it as `ITOC360_TOKEN`.
3. Add the step above to your workflow.

> The token raises alerts in your organization. Keep it in repository secrets
> and never inline it in a workflow file.

## Resolving

Send the same fingerprint back with `status: resolve` and ITOC360 closes the
alert. Because both steps default to the same fingerprint — repository,
workflow and branch — a plain pair like this is enough:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: npm ci && npm test

      - name: Page on failure
        if: failure()
        uses: itoc360/itoc360-action@v1
        with:
          token: ${{ secrets.ITOC360_TOKEN }}
          severity: critical

      - name: Clear on success
        if: success()
        uses: itoc360/itoc360-action@v1
        with:
          token: ${{ secrets.ITOC360_TOKEN }}
          status: resolve
```

The first failing run raises one alert. Later failing runs update it rather
than paging again. The first green run clears it.

## Inputs

| Input           | Default                                | Description                               |
| --------------- | -------------------------------------- | ----------------------------------------- |
| `token`         | — _(required)_                         | ITOC360 source token                      |
| `status`        | `alert`                                | `alert` raises, `resolve` clears          |
| `severity`      | `high`                                 | `critical`, `high`, `medium` or `low`     |
| `title`         | `<workflow> failed on <branch>`        | One-line alert title                      |
| `message`       | run details and a link                 | Longer description                        |
| `fingerprint`   | `<owner>/<repo>::<workflow>::<branch>` | Deduplication key                         |
| `base-url`      | `https://api.itoc360.app`              | Only for a self-hosted deployment         |
| `timeout`       | `10000`                                | Milliseconds to wait                      |
| `fail-on-error` | `true`                                 | Whether a delivery problem fails the step |

### Severity

| Input      | ITOC360 priority |
| ---------- | ---------------- |
| `critical` | CRITICAL         |
| `high`     | HIGH             |
| `medium`   | MEDIUM           |
| `low`      | LOW              |

### Fingerprints

`fingerprint` is what ITOC360 deduplicates on. Every event carrying the same
value belongs to the same alert, so the resolving step must send exactly what
the raising step sent.

The default — repository, workflow and branch — is deliberately free of the run
id and the commit sha, both of which change between the failing run and the
green one that follows.

Override it when one workflow watches several things:

```yaml
with:
  token: ${{ secrets.ITOC360_TOKEN }}
  fingerprint: "checkout-service::deploy::production"
  title: "Production deploy of checkout-service failed"
```

## Outputs

| Output       | Description                                             |
| ------------ | ------------------------------------------------------- |
| `event-id`   | Identifier of the event ITOC360 recorded                |
| `event-type` | `ALERT` for a raised alert, `RESOLVE` for a cleared one |

```yaml
- id: page
  uses: itoc360/itoc360-action@v1
  with:
    token: ${{ secrets.ITOC360_TOKEN }}

- run: echo "ITOC360 event ${{ steps.page.outputs.event-id }}"
```

## Not failing the build on a delivery problem

By default the step fails when the alert cannot be delivered, so a broken
notification path is visible rather than silent. When a monitoring hiccup
should not turn a green build red, set:

```yaml
with:
  token: ${{ secrets.ITOC360_TOKEN }}
  fail-on-error: false
```

The step then logs a warning and succeeds.

## Development

```bash
npm install
npm run verify   # typecheck, lint, format check, tests, build
```

`dist/` is committed on purpose: GitHub runs an action directly from the
repository without installing anything, so the bundled output has to be in
version control. CI rebuilds it and fails if it differs from what is committed,
so run `npm run build` and commit the result whenever you touch `src/`.

## Links

- [itoc360.com](https://www.itoc360.com) — product
- [itoc360.app](https://itoc360.app) — sign in
- [docs.itoc360.com](https://docs.itoc360.com) — documentation
- [@itoc360/sdk](https://www.npmjs.com/package/@itoc360/sdk) — the TypeScript SDK this action is built on
- [itoc360-go](https://github.com/itoc360/itoc360-go) · [itoc360 on PyPI](https://pypi.org/project/itoc360/) — the other SDKs

## License

Apache License 2.0. Copyright 2026 ITOC360 INC. See [LICENSE](LICENSE).
