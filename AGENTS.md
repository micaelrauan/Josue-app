# Repository workflow

- The user has authorized committing and pushing completed repository changes without asking again. Do this when a coding task is ready to share, after relevant checks pass.
- Review the diff before committing. Include only task-related source, tests, documentation, and configuration. Keep generated installers, `dist/`, `.desktop-cache/`, Python environments, downloaded models, logs, and secrets out of commits.
- Preserve remote work: check the current branch head before pushing, and do not force-push or rewrite history. If this workspace has no `.git` directory, use the connected GitHub repository `micaelrauan/Josue-app` to create commits against its current `main` head.
- Use clear commit messages and report commit links or hashes. If a check or push fails, report the blocker and leave the changes available locally.
- When completed user-facing changes should reach installed apps, increase the stable version in both `package.json` and `tools/installer.cs` before pushing. The Windows update workflow publishes that version from `main`; check its run and report whether the Release was published. Do not bump versions for documentation-only changes.
