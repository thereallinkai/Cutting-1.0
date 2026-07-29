# GitHub repository setup

The repository includes one guarded administrative helper for the owner-only
GitHub changes that cannot be made by an ordinary Git push.

It performs these actions:

1. Renames `thereallinkai/Cutting-1.0` to
   `thereallinkai/Lets-Go-Green` when the old name still exists.
2. Updates the local `origin` remote to
   `git@github.com:thereallinkai/Lets-Go-Green.git`.
3. Creates or updates one active repository ruleset named **Protect main** that
   targets only the default branch.
4. Requires changes to `main` to arrive through a pull request, with zero
   required approvals for the solo-maintainer workflow and all review
   conversations resolved.
5. Requires the exact CI check **Local mock-backed suite** with the branch
   updated against the latest `main`.
6. Blocks force pushes and deletion of `main`.
7. Reads the resulting repository, branch, ruleset, and remote back and fails
   unless every setting matches.

No account or role bypass is configured. The repository owner therefore follows
the pull-request workflow too, but can merge their own pull request after CI
passes because the required approval count is zero.

## Run once from the Codespace

First pull the completed changes and make sure `main` is clean and current:

```bash
git switch main
git pull --ff-only
./scripts/configure-github-repository
```

The script intentionally refuses to run from another branch, with local
changes, with an unexpected remote, or when local `HEAD` is not already the
commit on `origin/main`. This ensures protection is not enabled while completed
work is still waiting to be pushed.

Renaming a GitHub repository does not rename the directory of an already
running Codespace. That existing workspace remains usable after `origin` is
updated; a newly created Codespace uses the `Lets-Go-Green` repository name.

GitHub CLI is installed by the committed Dev Container. If it is not
authenticated, use GitHub's browser-based login and rerun the script:

```bash
gh auth login --hostname github.com --web --git-protocol ssh --scopes repo
./scripts/configure-github-repository
```

A Codespace-provided `GITHUB_TOKEN` or `GH_TOKEN` may have permission to push
code without having permission to administer repository settings. If the helper
reports that the active credential lacks Administration access, authenticate
the repository-owner account without copying a token into the terminal:

```bash
unset GH_TOKEN GITHUB_TOKEN
gh auth login --hostname github.com --web --git-protocol ssh --scopes repo
./scripts/configure-github-repository
```

Do not paste a personal access token into the repository, an environment file,
a command saved in shell history, or an issue.

## Normal workflow after protection

Direct pushes to `main` are intentionally rejected. Make each future change on
a short-lived branch:

```bash
git switch -c feature/short-description
git push --set-upstream origin feature/short-description
gh pr create --fill
```

Wait for **Local mock-backed suite** to pass, resolve any open review
conversation, and merge the pull request. GitHub prevents force-pushing or
deleting `main`.

The helper is idempotent. Running it again updates the same named ruleset and
re-verifies the result instead of creating a second ruleset.

## GitHub references

- [Renaming a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
- [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
