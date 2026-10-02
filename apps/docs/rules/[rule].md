---
layout: doc
description: "{{ $params.summary }}"
outline: false
sidebar: false
editLink: false
prev: false
next: false
---

<RuleDetail :rule-id="$params.rule" />

<llm-only>

# {{ $params.rule }}

Unsupported example, not a maintained public rule. No compatibility or coverage commitment.

{{ $params.summary }}

## What it checks

{{ $params.explanation }}

## Rule metadata

- Example source: `{{ $params.sourcePath }}`
- Category: {{ $params.category }}
- Tags: {{ $params.tags }}
- Default threshold: `{{ $params.defaultThreshold }}`
- Minimum confidence: `{{ $params.minConfidence }}`

## Examples

### Reported

{{ $params.incorrectExample }}

### Accepted

{{ $params.correctExample }}

</llm-only>
