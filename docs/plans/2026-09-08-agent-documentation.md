# Agent Documentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make repository guidance discoverable and distinguish current contracts,
proposed work, and historical context without introducing a large workflow system.

**Architecture:** A short root `AGENTS.md` owns working rules. `docs/index.md`
routes tasks to existing guides, a data contract, and a proportionate validation
guide. Existing documents retain their subject matter and gain explicit status.

**Tech Stack:** Markdown, repository-relative links, Python standard-library
link checks, Git diff checks.

**Status:** Complete, 2026-09-08.
**Authority:** User request to implement the recommended agent guidance and
consider the structure and contents of `index.md`.
**Scope:** Documentation only. Automatic map layout remains a separate draft.

## Task 1: Establish entry points and document ownership — complete

- Create `AGENTS.md` and `docs/index.md`.
- Update `README.md` to route readers to the index.
- Keep the index organized by task, current contracts/guides, proposed work,
  and historical context. Keep requirements in their owning documents.

## Task 2: Record current data contracts and validation boundaries — complete

- Create `docs/specs/map-data.md` from the fetchers, processors, `osmdata.py`,
  both builders, and the existing process/pitfall notes.
- Create `docs/VALIDATION.md` with existing commands and task-specific evidence.
- Distinguish implemented checks from manual checks and proposed automation.
- Do not introduce a layout spec that would duplicate or approve the draft.

## Task 3: Clarify existing documentation status — complete

- Mark `HANDOFF.md` as historical and route new sessions to the current index.
- Add role/status pointers to `docs/PROCESS.md`, `docs/DESIGN.md`,
  `docs/PITFALLS.md`, `docs/DATA_SOURCES.md`, `docs/ADAPTING.md`,
  `docs/HIGH_RES.md`, `docs/STRATEGY.md`, and `docs/AUTOMATION.md`.
- Preserve existing draft status on the automatic-layout design and plan.
- Correct closely related guidance only where direct source inspection shows
  it is misleading; do not alter code or generated maps.

## Verification and completion

- Run `git diff --check`; expect no whitespace errors.
- Check local Markdown links in changed/new documents, including fragments;
  expect every routed destination to exist.
- Check documented current paths/commands against source without importing
  scripts, fetching external data, or regenerating outputs.
- Review the diff for duplicated authority, accidental approval of drafts,
  and requirements exceeding the task's scope.
- Record results here. No application tests are needed for this documentation
  change. The user subsequently requested staging and committing the completed
  documentation. Publication is outside this task.

## Completion record

Created the working rules, task index, existing-data contract, and validation
guide; clarified document roles and corrected frame/diagnostic guidance against
the source. The layout design and implementation plan remain unchanged drafts.

Verification: local-link and heading-fragment checks passed across all 15
changed/new Markdown documents; source review covered fetchers, processors,
OSM assembly, both builders, and current build commands. `git diff --check`
passed. Only documentation changed; no live data was fetched and no maps were
regenerated. No application-test result is claimed.
