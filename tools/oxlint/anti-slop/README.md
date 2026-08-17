# Project anti-slop policy

This directory contains the anti-slop Oxlint plugin vendored by the installation skill. The rule implementations remain unchanged from the copied source; Pi Clarity adapts the plugin by selecting rules in `.oxlintrc.json`.

## Enabled rules

| Rule                                  | Project policy                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `no-chained-type-assertions`          | Prevent type laundering. A deliberately malformed legacy test fixture has one local, documented suppression. |
| `no-module-mocking`                   | Prefer real dependency seams and process-level tests over Jest or Vitest module replacement.                 |
| `no-object-parameters`                | Functions must use concrete input contracts rather than the broad `object` type.                             |
| `no-reflect-apply` / `no-reflect-get` | Use direct calls and property access so control flow remains visible and statically analyzable.              |
| `no-unknown-returns`                  | Parse untrusted values before returning them to callers.                                                     |
| `no-unknown-type-aliases`             | Keep `unknown` visible at a boundary rather than hiding it behind an alias.                                  |
| `no-widen-then-assert`                | Preserve known type evidence instead of widening a value and asserting it back later.                        |

## Rules not enabled

The remaining vendored rules do not match the repository's current conventions closely enough to justify enforcing them:

- `no-runtime-typeof` conflicts with runtime checks at JSON, extension-state, serialization, and process-output boundaries.
- `no-unknown-parameters` rejects the safe input type for untrusted boundary values.
- `no-unsafe-dictionary-type` rejects `Record<string, unknown>`, which the repository uses as an explicit intermediate representation while inspecting external JSON.
- `require-safety-comment-for-type-assertion` imposes a comment convention the repository has not adopted. Improving runtime validation is separate work and should not be smuggled into lint configuration.
- `no-known-value-widening` rejects the repository's established use of small inline return contracts and typed configuration objects.
- `no-conditional-empty-object-spread` conflicts with `exactOptionalPropertyTypes`; conditional spread omits absent optional properties instead of assigning `undefined`.
- `no-shape-in-symbol-names` bans general vocabulary rather than a project-specific domain mistake.

A disabled rule can be reconsidered through a focused change that reviews its findings and defines a migration pattern. Do not enable rules merely to add broad suppressions, and do not redesign application code solely to make lint pass.
