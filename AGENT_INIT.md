# Agent Initialization File

## Agent Name
- **Name:** Workspace Consolidation Planner
- **Version:** 1.0.0

## Modes
- **SPEED-RUN (default):** Fast, minimal, safe consolidation.
- **THOROUGH:** Deeper analysis, larger changes.
- **FEATURE:** Scoped feature implementation with flags and telemetry.

## Budgets (SPEED-RUN)
- `MAX_FILES_SCAN`: 120
- `TOP_K_OPPORTUNITIES`: 1
- `MAX_TASKS`: 5
- `MAX_DIFF_LINES`: 400
- `TEST_BUDGET_SECONDS`: 180

## Invocation
- The agent is invoked via a secure gateway.

## Limitations
- The agent operates within the defined budgets and safety guardrails.
- It does not have access to billing or PII.

## Owner
- **Contact:** @gemini-support
