# GPT Review: Specs (Three Perspectives)

## User Perspective
- Critical: Recovery promises are misleading if `autoCommit` is off because checkpoints all point to the same HEAD, so rollback won’t restore intermediate work as users expect. `SPECS/11-recovery.md:728` `SPECS/11-recovery.md:734`
- High: The preflight “Fix” action auto-stashes changes without a visible restore path, creating a “my work disappeared” moment. `SPECS/10-preflight.md:201`
- High: Preflight remains a required stop with dense information; even “Quick Preflight” still asks for decisions, which can feel like friction before every battle. `SPECS/10-preflight.md:606`
- Medium: Dry Run shows full prompt and heuristic file predictions without confidence or redaction guidance, which can overwhelm users or raise privacy concerns. `SPECS/10-preflight.md:653` `SPECS/10-preflight.md:724`
- Medium: Bun projects with `bun.lock` won’t be detected as Bun, leading to confusing defaults. `SPECS/09-onboarding.md:171`
- Open question: Should preflight fixes surface a “restore stashed changes” action immediately after the auto-stash? `SPECS/10-preflight.md:201`

## Product Manager Perspective
- High: Preflight is positioned as a gate, but the battle flow starts directly at `/api/battle/start`, so users can bypass it and the “preflight pass rate” metric becomes inconsistent. `SPECS/10-preflight.md:1` `SPECS/03-battles.md:168` `SPECS/README.md:116`
- High: Onboarding detection can misclassify bun projects and then override type for python/go/rust without clearing metadata, which will misconfigure defaults and hurt activation. `SPECS/09-onboarding.md:171` `SPECS/09-onboarding.md:202`
- Medium: “Unknown” projects default to no loops and auto-commit off, creating a low-trust path that can increase early failure and churn. `SPECS/09-onboarding.md:340`
- Medium: Dry Run promises a preview but relies on heuristics for files/iterations; inaccurate predictions could erode user trust. `SPECS/10-preflight.md:699`
- Low: Success metrics are defined but there’s no explicit analytics/event schema tied to preflight reports, so funnel measurement is ambiguous. `SPECS/README.md:104` `SPECS/10-preflight.md:453`
- Open question: Should we allow “skip preflight for N battles” for power users to protect time-to-battle? `SPECS/10-preflight.md:606`

## Ultra Technical Developer Perspective
- Critical: `PreflightCheckResult` includes `check: PreflightCheck` (functions), which can’t be serialized in API responses; needs a DTO with metadata only. `SPECS/10-preflight.md:463`
- High: Checkpoints are ineffective when `autoCommit` is false because each checkpoint records the same HEAD, so rollback can’t restore intermediate states. `SPECS/11-recovery.md:728` `SPECS/11-recovery.md:734`
- High: `detectProject` only checks `bun.lockb` and later overrides type for python/go/rust without clearing Node fields, producing inconsistent detection/config data. `SPECS/09-onboarding.md:171` `SPECS/09-onboarding.md:202`
- Medium: Feedback loop validation calls `commandExists` on full commands; without tokenization, commands with args will false-fail. `SPECS/10-preflight.md:277`
- Medium: Manual-fix sessions start a recursive watcher but no teardown lifecycle is defined, risking leaked watchers or duplicate events. `SPECS/11-recovery.md:474`
- Open question: Should checkpoints be stored as patch bundles (or lightweight commits) when auto-commit is disabled to keep rollback viable? `SPECS/11-recovery.md:728`
