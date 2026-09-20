# Evidence and decisions

Scruple does not ask a model to review an entire repository or produce free-form findings. Plugins define the evidence and answer shape before a request is made.

## Evidence state

Candidate state must be JSON. A plugin should include only the excerpts and facts required to answer its question. This keeps requests inspectable, repeatable, and within provider context limits.

## Question types

The core supports three typed question forms:

- **Noul:** a probability-like scalar for a binary proposition.
- **Choice:** one label from explicit criteria, with confidence and per-label probabilities.
- **Score:** an ordered score against a supplied legend.

Plugins choose the form that makes competing interpretations explicit.

## Thresholds and abstention

Provider output alone is not a finding. Rules validate answer shape, compare probabilities and confidence with configured thresholds, and may abstain when evidence is incomplete or ambiguous.

Thresholds are provider and model dependent. Calibrate them against representative positive and negative examples before enabling a rule broadly.

## Stable output

Rules own messages, locations, and severity mapping. Providers cannot generate text that appears as a diagnostic. This keeps CI output stable when provider implementations change.
