---
name: delegate
description: Coordinate bounded subagents for one or more changes when explicitly invoked, with direct or OpenSpec workflows, named ownership, validation and controlled integration.
---

# Delegate

Use this skill only when invoked explicitly. Accept labelled fields or ordinary
prose. Read the current request and earlier authorisation before delegating;
later explicit amendments apply to work not yet started. Report the resolved
configuration briefly. Ask only when missing scope, correctness, cost or
authorisation information cannot be inferred safely.

## Run configuration

- **Task:** The requested outcome and its acceptance criteria. Ask which project
  or changes are in scope if that cannot be determined.
- **Workflow:** `direct` or `openspec`. Infer `openspec` for an OpenSpec task;
  otherwise use `direct`. Direct means no additional specification workflow;
  repository instructions, checks and CI still apply. For OpenSpec, load
  `change-lifecycle` and the repository's applicable OpenSpec skills. Let those
  skills own their gates and lifecycle details.
- **Maximum parallel changes:** Concurrent independent workstreams, each with
  one coordinator. Default: one. Do not treat dependent tasks or edits to the
  same branch as separate changes merely to fill capacity.
- **Maximum concurrent children per coordinator:** Open direct children,
  including workers, validators and integration agents. Default: two. A child
  must not spawn further agents unless the user explicitly authorises another
  level and its capacity is counted.
- **Models:** Accept model/effort settings for coordinators, workers,
  validation and integration. If omitted, inherit the harness setting;
  validation and integration inherit the coordinator's setting rather than a
  worker setting. Resolve shorthand against the models and efforts actually
  available. Do not silently substitute an unavailable setting. A requested
  parent setting does not change an already-running parent's model.
- **Merge and post-run actions:** Use explicit current-request or earlier
  current-session authorisation. If merge has not been authorised, complete
  the authorised work and stop before merging. Run exceptional cleanup or
  remote actions only when requested within scope.

## Before spawning

Give a concise overview: workflow, selected changes, planned coordinator
names, likely child jobs and names, model/effort settings, concurrency limits,
runtime scheduling and merge outcome. Mark names and jobs as planned until
spawned; update the roster when it materially changes. Name coordinators for
their changes and children for their specific jobs so their threads are easy
to inspect.

Check the harness's open-agent limit and existing agents. Count the parent as
the primary thread only when the harness does; count coordinators and every
open child against the spawned-thread limit. Allocate the available slots
across coordinators before spawning. If the requested topology will not fit,
run agents in waves, close or reuse completed threads where supported, and
preserve the requested work and per-coordinator ceiling. Do not repeatedly
retry a rejected spawn without changing the schedule. A skill cannot raise
the runtime limit.

## Ownership and coordination

- The parent orchestrates coordinators only, including when there is one
  change. Each coordinator owns one change, its scope, collected evidence and
  final acceptance. The parent accepts the combined outcome.
- Coordinators assign bounded work with an expected result and clear file or
  branch ownership. Parallelise independent work; agree on ownership before
  concurrent edits to shared files or branches.
- Workers implement assigned work. Validators independently check conformance,
  relevant tests and failure paths. Integration agents may synchronise specs,
  archive, handle a PR or MR, and merge or clean up when authorised and after
  the coordinator accepts the reviewed result. The coordinator retains final
  acceptance even when a child performs integration.
- Agents may message one another directly to resolve dependencies and share
  findings. Keep the relevant coordinator informed of decisions that affect
  its change. Escalate changes to scope, authorisation or the run plan to the
  parent. Unresolved user decisions go to the parent, which asks through the
  available question interface.
- Use the harness's actual subagent mechanism. On Pi, use the installed
  extension if it supplies these capabilities. Do not claim delegation when
  the current harness cannot spawn or coordinate agents.

## Waiting and reporting

After handing off work, finish independent work and use one long wait, around
three to five minutes when the tool permits. Children report blockers,
material milestones and completion. On an unchanged timeout, wait again
without a progress message or routine status check. Check status once only
when needed to decide what to do next. Do not poll individual children, send
keepalives or repeat unchanged tool output. The client may still display its
own wait events.

Keep command output and diagnostic detail in the child thread. Report only
findings that change a decision, new blockers, completed results or a status
the user requests. Collect every required result; treat failed gates and
review findings as work to resolve, not as completion. Continue until the
authorised outcome is complete or genuinely blocked. State the specific
blocker, evidence and smallest missing input when blocked.
