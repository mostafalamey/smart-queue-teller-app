# Copilot Instructions for samrt-queue-teller-app

## Scope and ownership
- This repository owns the teller workstation app only.
- Keep the teller UI compact, operational, and focused on execution speed.
- Do not add admin configuration surfaces that belong to the Admin app.

## Teller workflow constraints (must not be violated)
- Teller actions are limited to Call Next, Recall, Skip/No-show, Start Serving, Complete, and Transfer.
- Teller operates the queue for the counter/service bound to the device; no manual service switching in v1.
- Queue behavior must remain priority-first and FIFO within priority.
- Skip maps to no-show finalization; recall re-announces without changing queue order.

## Device and station rules
- Device/counter identity is binding-driven (configured by Admin/IT), not ad-hoc teller input.
- Respect one-service-per-counter assumptions from backend/domain constraints.
- Keep device identity and station context visible enough to prevent teller mistakes.

## API contract alignment
- Treat backend queue engine as source of truth for transitions and validation.
- Handle typed queue errors explicitly (e.g., no waiting tickets, invalid transition, not found, service mismatch).
- Do not implement client-side shortcuts that bypass server-side RBAC/scope checks.

## UX and interaction guidance
- Prioritize low-click flows and keyboard shortcut support.
- Keep state changes explicit (called, serving, completed, no-show, transferred) and immediately visible.
- Avoid speculative features or analytics-heavy panels in teller runtime.

## Reliability expectations
- Favor resilient behavior for transient network issues (clear status/errors, safe retry affordances).
- Never fake queue transitions locally; only reflect confirmed server state.

## Workflow expectations
- Use feature branches (`feature/<area>-<name>`) and PR-based merges to `main`.
- Keep changes surgical and requirement-aligned.
- Update repo docs and related root docs when teller behavior/contracts change.
