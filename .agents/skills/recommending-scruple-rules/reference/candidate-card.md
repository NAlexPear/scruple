# Candidate card

Use this compact structure for each of at most three recommendations. Do not fill gaps with guesses.

- **Rank / working name / readiness:** ready to author, needs evidence, or needs parser support.
- **Policy:** one finding-versus-safe distinction. Mark explicit policy or inference (or split claims
  when the intent is explicit but its implementation pattern is inferred).
- **Evidence:** short authoritative quote with `path:line` range; independent production examples;
  test that corroborates or contradicts the principle. Note scoped exceptions and counterexamples.
- **Scope and owner:** languages, frameworks, paths, exclusions, consumer owner. Avoid wildcard
  languages unless the meaning really is portable, such as normalized prose-only comments.
- **Normalized evidence:** exact target/fields required, installed adapter support, bounded excerpts,
  completeness signals, and capabilities missing. Distinguish syntactic call names from resolved
  behavior. Merely naming a `ParsedDocument` is not a complete evidence contract.
- **Decision:** candidate selection, fixed finding/safe/insufficient-context categories, and abstention
  conditions. If an exact syntax/type check suffices, reject the Scruple candidate instead.
- **Tests and evals:** realistic finding, near-miss safe case, unknown case, and likely false-positive
  trap. Require focused collector/diagnosis tests, language/framework `runScruple` integration, and
  separate deterministic fixture replay from later authorized provider evaluation.
- **Value / risk:** repeated review burden or important documented invariant, selection frequency,
  expected evidence size, false-positive risk, missing context, and confidence in the recommendation.
- **Handoff:** what `authoring-scruple-rules` may implement once requested and what remains undecided.

Do not equate a supported policy with a supported detector. “All writes require tenant isolation”
may be explicit and critical while the parser still lacks the route/middleware/data-flow evidence to
detect violations. Recommend the missing prerequisite rather than an unsound universal rule.
