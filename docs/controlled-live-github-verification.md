# Real Controlled GitHub Verification Preparation V1

This document is the operator runbook for the first real controlled GitHub verification. Preparation and CI never perform a real GitHub write.

## Safety contract

- `GITHUB_CONTROLLED_VERIFICATION_ENABLED=false` by default.
- `GITHUB_REPAIR_EXECUTION_ENABLED=false` must remain false.
- The only supported verification target is `mokhtarrayen345-max/ai-opportunity-github-verification-test`; configuration must match this exact value.
- The verification repository is server-configured and explicitly allowlisted.
- The client supplies no repository, branch, command, or write target.
- The server generates `github-verification/<execution-id>`.
- The default branch is used only as a read-only base when it exists; the runner never updates it. An empty repository uses an orphan verification commit.
- GitHub App credentials remain server-side and are never returned or logged.
- CI uses mocks/fakes only.
- No PAT is supported.
- This runbook does not authorize general live repair execution.

## 1. Preflight

Before enabling the controlled verification flag in a dedicated verification environment:

1. Verify the GitHub App exists and is the App used by the existing authorization architecture.
2. Configure `GITHUB_APP_ID`.
3. Provide `GITHUB_APP_PRIVATE_KEY` through the approved server secret mechanism. Never put the key in source control, browser configuration, tests, fixtures, or logs.
4. Configure the existing App/client settings required by the authorization architecture: `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, and `GITHUB_APP_SLUG`.
5. Install the GitHub App on the dedicated repository `mokhtarrayen345-max/ai-opportunity-github-verification-test`.
6. Set `GITHUB_CONTROLLED_VERIFICATION_REPOSITORY=mokhtarrayen345-max/ai-opportunity-github-verification-test`.
7. Add that exact repository to `GITHUB_ALLOWED_REPOSITORIES`.
8. Confirm the repository is non-production and contains no valuable data. The runner may create and delete a temporary branch and write a harmless verification artifact on that branch.
9. Confirm `GITHUB_REPAIR_EXECUTION_ENABLED=false`.
10. Confirm the preflight endpoint reports `READY_FOR_MANUAL_VERIFICATION`. This status proves only local configuration prerequisites; it does not prove GitHub execution.
11. Confirm the readiness audit still reports `REAL_VERIFICATION_STATUS=NOT_PERFORMED` and overall readiness is not `READY`.

## 2. Execution

Use an authenticated platform session and call the existing controlled verification endpoint:

- `POST /api/github/controlled-verification`
- Send an empty request body.
- Do not provide repository, branch, command, owner, or write target.
- The server derives the authorized verification repository and generates the verification branch.

The operator should first complete the preflight checks and then enable the controlled verification flag only for the dedicated verification environment. Keep unrestricted repair execution disabled.

## 3. Expected behavior

The controlled run must:

1. Authenticate the platform user.
2. Validate the existing GitHub App authorization and active authorized repository.
3. Validate the exact server-configured verification repository and allowlist.
4. Generate `github-verification/<execution-id>` server-side.
5. Use the existing default branch only as a read-only base when a ref exists.
6. If the dedicated repository is empty and has no ref, create an orphan commit containing only the verification artifact, then create the temporary verification ref. Do not initialize or modify the default branch.
7. Read the artifact back through the GitHub API and compare its exact contents before reporting remote verification success.
8. Keep execution-state changes behind the centralized state machine.
9. Produce safe audit metadata only.
10. Delete the temporary verification branch. A branch cleanup failure prevents a successful final result. Installation-token revocation is attempted on a best-effort basis; the token also expires according to GitHub's token lifetime.

A mocked result, passing CI, or preflight response is not evidence of real GitHub execution.

## 4. Post-verification record

Record only:

- execution ID
- verification timestamp
- result
- generated verification branch
- safe execution state
- branch cleanup result
- whether installation-token revocation was confirmed; if not, rely only on the documented token expiry and never report revocation as successful

Never record:

- private keys
- installation access tokens
- PATs
- client secrets
- authorization headers
- secret values

After the run, disable `GITHUB_CONTROLLED_VERIFICATION_ENABLED` again unless another explicitly approved verification run is being performed.

## 5. Readiness interpretation

The platform distinguishes:

- **Configuration readiness:** required runtime values are present and valid.
- **Manual verification readiness:** an authorized operator can safely start the controlled run.
- **Real verification status:** an actual controlled GitHub verification has completed.
- **General live execution readiness:** unrestricted production execution has been independently proven safe.

Before the first real run:

`REAL_VERIFICATION_STATUS=NOT_PERFORMED`

and the overall readiness must remain:

`NOT_READY`.

Even after a successful controlled verification, general live repair execution must not be treated as automatically enabled or production-ready.
