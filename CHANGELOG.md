# Changelog

User-visible application releases are recorded here. Version identifiers follow
the policy in [VERSIONING.md](VERSIONING.md).

## 1.0.0-beta.2 — 2026-08-02

**Let's Go Green! 1.0 Beta 2** strengthens account setup and gives the complete
interface one consistent, premium motion language.

- Replaced self-reported numeric age with a validated date of birth and a final
  age confirmation before account creation.
- Made a confirmed date of birth immutable while deriving the current age for
  safety and plan calculations without sending the raw birth date to AI.
- Bound new verified accounts to canonical DOB data, aligned registration and
  later age calculations to the detected device time zone, and stopped carrying
  legal acceptance state across browser sessions or document versions.
- Added coordinated page, section, surface, stack, dialog, and feedback motion
  plus tactile highlight-and-lift states for interactive controls.
- Preserved keyboard focus, pointer-specific hover behavior, disabled states,
  responsive layouts, and the operating system's reduced-motion preference.

## 1.0.0-beta.1 — 2026-07-29

**Let's Go Green! 1.0 Beta 1** is the first named testing release.

- Added the complete account, onboarding, meal-planning, daily check-in,
  progress, profile, and settings experience.
- Added reviewed local nutrition records, direct online food-name search,
  barcode lookup, and private nutrition-label capture.
- Added responsive green styling, accessible interaction states, reduced-motion
  support, reproducible Codespaces setup, and the full automated verification
  gate.
- Added an in-app testing-channel and exact-version label.

This is a beta build, not a stable production release. Features and stored-data
formats may change before `1.0.0`.
