# Skill: AI Editorial Pipeline

## Use when

- Extracting facts
- Generating social drafts
- Verifying AI output
- Managing prompts, models, quotas, cost

## Pipeline

1. Normalize source material.
2. Extract structured fact sheet.
3. Compare multiple sources where available.
4. Generate structured draft JSON.
5. Parse with schema validation.
6. Run deterministic factual checks.
7. Run optional AI verification.
8. Block failed drafts.
9. Store prompt/model/version/token usage.
10. Require human review by default.

## Mandatory rules

- Provider abstraction.
- No unsupported facts.
- No invented quote.
- Preserve names, dates, scores, numbers.
- Explicit rumor/uncertainty labeling.
- Similarity detection against source.
- Prompt versioning.
- Timeouts, quotas, budget limits.
- AI work runs in queue workers.
- AI output is untrusted input.
- Cache fact extraction by content hash.

## Required tests

- Invalid JSON is rejected.
- Changed score is caught.
- Fabricated quote is caught.
- Unsupported claim is caught.
- Over-quota request is rejected.
- Provider timeout produces retryable job behavior.
