# Skill: Next.js Production Frontend

## Use when

- Building dashboard, feed, editor, calendar, onboarding, settings
- Implementing frontend auth/session behavior

## Mandatory rules

- App Router.
- Server Components by default where appropriate.
- Client Components only for real interactivity.
- No secret or Page token in client bundle.
- Accessible forms and keyboard actions.
- Loading, empty, success, and recovery-oriented error states.
- Draft autosave with optimistic concurrency.
- Confirm publish target and final content.
- Do not rely on color alone.
- Responsive review/publish flow.
- Natural Vietnamese UI.
- Central API client/contracts.
- Sanitize or safely render external content.

## Required tests

- Critical forms validate.
- Unauthorized controls are not shown, while backend still enforces access.
- Autosave conflict is handled.
- Publish confirmation shows Page and draft version.
- Keyboard navigation works for critical editor flow.
