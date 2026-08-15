# Bilingual evaluation cases

`evaluation-cases.json` is a model-independent English/Spanish suite for evaluating an **always-on appended system prompt** whose purpose is to improve response readability without changing normal assistant behavior.

The cases do not quote, name, or encode any candidate prompt. Run the same cases against the no-added-prompt control and every candidate variant.

## Coverage

The suite contains 12 scenario pairs (24 cases total):

| Pair | Capability under test | Main regression risk |
|---|---|---|
| `simple-answer` | Brief factual answer | Over-formatting or needless expansion |
| `high-tech-non-phd` | Advanced technical explanation for a capable nonexpert | Jargon, oversimplification, or false confidence |
| `long-form-depth` | Detailed analysis | Readability instruction causing shallow compression |
| `coding-instructions` | Exact implementation and tests | Presentation overriding technical constraints |
| `tool-use` | File inspection, editing, validation, and reporting | Talking instead of acting; unauthorized edits |
| `debugging` | Hypothesis, confirmation, and safe remediation | Premature certainty or generic checklists |
| `architecture` | System design and assumptions | Decorative structure replacing substantive design |
| `comparison` | Nuanced side-by-side evaluation | False binaries or universal recommendations |
| `diagram-useful` | Flow with branches and interacting components | Failure to use an effective visual representation |
| `diagram-not-useful` | Short professional rewrite | Diagram/table/template intrusion |
| `ambiguity` | Missing required parameters | Guessing instead of asking focused questions |
| `repitch-follow-up` | Multi-turn audience and format adaptation | Repeating the first answer or retaining the old format |

Each pair has an English (`en`) and Spanish (`es`) case. The prompts target equivalent capabilities, but judges should not require literal translation symmetry. Natural phrasing and conventions in each language matter more than identical sentence structure.

## Case structure

Common fields:

- `id`: stable case identifier.
- `pair_id`: links the English and Spanish scenarios.
- `language`: `en` or `es`.
- `category`: primary behavior under test.
- `execution_mode`:
  - `single_turn`: one user message and one final response.
  - `multi_turn`: run every item in `turns` in one conversation, preserving state.
  - `agent_workspace`: initialize the declared fixture and allow normal Pi workspace tools.
- `prompt` or `turns`: user-authored evaluation input.
- `hard_gate_expectations`: observable correctness and completion requirements. These inform the hard gates in `research/rubric.md`; they are not a substitute for expert judgment.
- `presentation_observations`: case-specific evidence for the scored readability dimensions.
- `workspace_fixture`: files that must exist before an agent-workspace case begins.

## Execution protocol

1. **Freeze the suite for a comparison round.** Record the suite version or repository commit with every run.
2. **Reset state before every trial.** Use a fresh conversation. For `agent_workspace` cases, recreate the fixture exactly and ensure no unrelated files can influence the result.
3. **Run the control and all candidate variants under equivalent conditions.** Keep model, provider, model settings, tool permissions, working directory, and case text fixed within a comparison block.
4. **Repeat trials.** Use enough repetitions to expose stochastic variation; do not compare a single lucky candidate run with a single control run.
5. **Capture complete raw artifacts.** Preserve every assistant message, tool call, tool result, final response, modified workspace, stderr/stdout, and failure. Do not normalize the raw output before storage.
6. **Record metadata.** At minimum record:
   - model and provider;
   - prompt-variant identifier;
   - case ID and language;
   - repetition number and random seed when available;
   - start/end time and latency;
   - input/output token usage when available;
   - tool availability, tool calls, and exit/validation results;
   - runner version and suite commit.
7. **Apply deterministic checks before qualitative judging.** Examples include JSON parsing, exact file diffs, required error text, forbidden file creation, response word limits, and code tests.
8. **Apply the hard gates.** A response that fails correctness or task completion cannot be rescued by a high readability score.
9. **Blind outputs for judging.** Follow the pairwise procedure in `research/rubric.md`; variant names, prompt text, run order, and identifying metadata must not be visible to judges.
10. **Analyze English and Spanish both separately and together.** An aggregate improvement must not hide a meaningful regression in either language or in tool-using cases.

## Tool-use fixture rules

For `agent_workspace` cases:

- Create only the files listed in `workspace_fixture.files` unless the runner itself needs isolated bookkeeping outside the visible workspace.
- Start every variant and repetition from a byte-identical fixture.
- Retain a pre-run and post-run file manifest and diff.
- Evaluate the actual workspace state, not only the assistant's final report.
- Treat unauthorized edits, skipped required validation, fabricated tool results, or a report that contradicts the workspace as task-completion failures.

## Judging notes

- Score what the response actually does, not what a candidate prompt appears intended to do.
- Do not reward visible formatting by default. A plain paragraph can be best for a short answer; a compact table or diagram can be best for relational information.
- Do not punish length by itself. Judge whether depth matches the request and whether the information remains navigable.
- Do not require every response to include a summary, headings, bullets, examples, analogies, or diagrams.
- In Spanish, judge clarity and natural usage in Spanish rather than conformity to English rhetorical patterns.
- For the re-pitch cases, assess both turns and place special weight on whether the second answer genuinely adapts to the new audience and constraints.

## Independence from candidates

Case prompts and expectations must remain independent from candidate wording. Do not add cases whose hidden purpose is to reward a specific phrase, markdown pattern, or named technique found in one candidate prompt. If the candidate set changes, the case suite should still measure the same underlying behaviors.

## Provisional status

The coverage and thresholds associated with this suite are **provisional and must be reconciled later with the research agent's findings**. Changes made during reconciliation should be versioned, justified in research notes, and applied before the final confirmatory evaluation rather than after viewing final candidate identities.
