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

{{ $params.summary }}

## What it checks

{{ $params.explanation }}

## Rule metadata

- Package: `{{ $params.packageName }}`
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
