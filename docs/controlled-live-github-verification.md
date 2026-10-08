# Real Controlled GitHub Verification Preparation V1

This document is the operator runbook for the first real controlled GitHub verification. Preparation and CI never perform a real GitHub write.

## Safety contract

- `GITHUB_CONTROLLED_VERIFICATION_ENABLED=false` by default.
- `GITHUB_REPAIR_EXECUTION_ENABLED=false` must remain false.
- The verification repository is server-configured and explicitly allowlisted.
- The client supplies no repository, branch, command, or write target.
- The server generates `github-verification/<execution-id>`.
- `main`, `master`, `production`, and `prod` are protected targets.
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
5. Install the GitHub App on a dedicated non-production verification repository.
6. Set `GITHUB_CONTROLLED_VERIFICATION_REPOSITORY=owner/repository`.
7. Add the exact same `owner/repository` to `GITHUB_ALLOWED_REPOSITORIES`.
8. Confirm the repository is not a production repository and that its default/protected branch cannot be modified by the verification.
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
3. Validate the server-configured verification repository and allowlist.
4. Generate `github-verification/<execution-id>` server-side.
5. Reject protected/default production targets.
6. Perform only the minimum verification write supported by the controlled runner.
7. Keep execution-state changes behind the centralized state machine.
8. Produce safe audit metadata only.
9. Clean up the verification branch/workspace when supported by the runner.

A mocked result, passing CI, or preflight response is not evidence of real GitHub execution.

## 4. Post-verification record

Record only:

- execution ID
- verification timestamp
- result
- generated verification branch
- safe execution state
- cleanup result

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
