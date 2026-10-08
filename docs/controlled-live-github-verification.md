# Controlled Live GitHub Verification V1

This feature provides a narrowly scoped verification boundary. It is disabled unless the server sets the dedicated controlled verification flag and configures an explicitly allowlisted non-production test repository.

## Safety boundary

- General GitHub repair execution remains disabled.
- The client supplies no repository, branch, or command.
- The server resolves the configured repository and active authorized GitHub installation.
- Verification branches are server-generated as github-verification/<execution-id>.
- main, master, production, and prod are rejected as protected targets.
- GitHub credentials use the existing GitHub App architecture; no PAT is supported.
- CI uses mocks and never performs a GitHub write.
- The implementation does not create PRs, merge, deploy, or modify the default branch.

## Manual real-verification boundary

A real verification is intentionally not executed during implementation. An operator must configure the dedicated server-side flag and repository, confirm the repository is an explicit allowlist entry and has the expected GitHub App installation, and execute the authenticated controlled-verification endpoint from a controlled environment. Record the execution ID and result, then disable the flag. A successful build or mocked test is not evidence of real GitHub execution.

If GitHub App configuration or authorization is missing, the endpoint fails safely rather than claiming success.
