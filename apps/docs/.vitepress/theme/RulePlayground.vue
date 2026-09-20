<script setup lang="ts">
import type { ChoiceAnswer, Diagnostic, RuleCandidate } from "@scruple/core";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import CodeEditor from "./CodeEditor.vue";
import HighlightedCode from "./HighlightedCode.vue";
import {
  decodePlaygroundState,
  encodePlaygroundState,
  type PlaygroundFixture,
  type PlaygroundState,
} from "./playground-state.js";
import type {
  PlaygroundReady,
  PlaygroundRequestInput,
  PlaygroundResponse,
} from "./rule-playground.worker.js";

interface AnalysisResult {
  description: string;
  candidates: RuleCandidate[];
  document: Record<string, unknown>;
}

interface DiagnosisResult {
  diagnostic: Omit<Diagnostic, "ruleId" | "severity" | "model"> | null;
}

type ResultTab = "candidates" | "evidence" | "question" | "facts";
type ExportTab = "rule" | "tests" | "fixtures";

const defaultRuleSource = String.raw`({
  description: "TODO comments should identify concrete follow-up work.",

  collect(document) {
    return document.comments
      .filter((comment) => /\b(?:TODO|FIXME|HACK)\b/iu.test(comment.value))
      .map((comment) => ({
        target: comment,
        state: {
          language: document.language,
          comment: comment.source.slice(0, 2_000),
          enclosingCode: comment.enclosingSource?.slice(0, 1_000) ?? null,
        },
        question: {
          type: "choice",
          instructions:
            "Does this task comment identify concrete work or a removal condition?",
          criteria: {
            specific: "The work or removal condition is concrete.",
            vague: "The requested follow-up is not meaningfully identified.",
            insufficient_context: "The bounded evidence cannot establish the intent.",
          },
        },
      }));
  },

  diagnose(answer, candidate) {
    if (answer.type !== "choice" || answer.choice !== "vague") return null;
    const probability = answer.probabilities.vague ?? 0;
    if (probability < 0.85 || answer.confidence < 0.7) return null;
    return {
      message: "Make this task comment identify the work or removal condition.",
      filename: candidate.target.filename,
      location: candidate.target.location,
      probability,
      confidence: answer.confidence,
    };
  },
})`;

const defaultFixtures = (): PlaygroundFixture[] => [
  {
    id: "finding",
    label: "Finding",
    outcome: "finding",
    filename: "queue.ts",
    source: "// TODO: fix this later\nexport const ready = false;\n",
    expectedChoice: "vague",
  },
  {
    id: "safe",
    label: "Safe",
    outcome: "safe",
    filename: "queue.ts",
    source:
      "// TODO: remove after all clients migrate to the v2 payload.\nexport const ready = false;\n",
    expectedChoice: "specific",
  },
  {
    id: "ambiguous",
    label: "Ambiguous",
    outcome: "ambiguous",
    filename: "queue.ts",
    source: "// TODO: align this with the upstream lifecycle.\nexport const ready = false;\n",
    expectedChoice: "insufficient_context",
  },
];

const ruleName = ref("require-specific-todo");
const ruleSource = ref(defaultRuleSource);
const fixtures = ref(defaultFixtures());
const selectedFixtureId = ref("finding");
const selectedCandidateIndex = ref(0);
const resultTab = ref<ResultTab>("candidates");
const exportTab = ref<ExportTab>("rule");
const analysis = ref<AnalysisResult>();
const diagnosis = ref<DiagnosisResult>();
const running = ref(false);
const error = ref("");
const notice = ref("");
const probability = ref(0.92);
const confidence = ref(0.86);
const selectedChoice = ref("vague");
const showExport = ref(false);
const workerReady = ref(false);

let worker: Worker | undefined;
let workerInitialization: Promise<void> | undefined;
let requestId = 0;
let decisionTimer: number | undefined;
let pending:
  | {
      id: number;
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: number;
    }
  | undefined;

const selectedFixture = computed(() =>
  fixtures.value.find((fixture) => fixture.id === selectedFixtureId.value),
);
const selectedCandidate = computed(() => analysis.value?.candidates[selectedCandidateIndex.value]);
const choiceQuestion = computed(() => {
  const question = selectedCandidate.value?.question;
  return question?.type === "choice" ? question : undefined;
});
const criteria = computed(() => Object.keys(choiceQuestion.value?.criteria ?? {}));
const runLabel = computed(() => (running.value ? "Running…" : "Run rule"));
const outcomeLabel = computed(() => {
  if (diagnosis.value === undefined) {
    return "Awaiting decision";
  }
  return diagnosis.value.diagnostic === null ? "Accepted" : "Finding";
});
const currentExport = computed(() => {
  if (exportTab.value === "rule") {
    return exportedRule.value;
  }
  if (exportTab.value === "tests") {
    return exportedTests.value;
  }
  return exportedFixtures.value;
});
const exportedRule = computed(
  () => `import type { RuleFactory } from "@scruple/core";
import { definePlugin } from "@scruple/core";

const ${identifier(ruleName.value)}: RuleFactory = () => ${ruleSource.value};

export const customRules = () =>
  definePlugin({
    rules: {
      "${ruleName.value}": ${identifier(ruleName.value)},
    },
  });
`,
);
const exportedTests = computed(
  () => `import assert from "node:assert/strict";
import test from "node:test";

import { oxcParser } from "@scruple/parser-oxc";

import { customRules } from "../src/index.js";

const rule = customRules().rules["${ruleName.value}"]();

${fixtures.value
  .map(
    (fixture) => `test(${JSON.stringify(`${fixture.label} selects one candidate`)}, () => {
  const document = oxcParser().parse(${JSON.stringify(fixture.filename)}, ${JSON.stringify(fixture.source)});
  assert.equal(rule.collect(document).length, 1);
});`,
  )
  .join("\n\n")}
`,
);
const exportedFixtures = computed(() =>
  JSON.stringify(
    fixtures.value.map((fixture) => ({
      id: `${ruleName.value}-${fixture.id}`,
      filename: fixture.filename,
      source: fixture.source,
      rule_id: `custom/${ruleName.value}`,
      expected_finding: fixture.outcome === "finding",
      expected_candidates: 1,
      expected_choices: [fixture.expectedChoice],
      expected_abstention: fixture.outcome === "ambiguous",
      rationale: `${fixture.label} boundary for ${ruleName.value}.`,
      tags: [fixture.outcome, "playground"],
    })),
    null,
    2,
  ),
);

const createWorker = (): void => {
  worker?.terminate();
  worker = new Worker(new URL("./rule-playground.worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", handleWorkerMessage);
  worker.addEventListener("error", (event) => {
    failPending(new Error(event.message || "The playground worker failed to load."));
  });
  workerReady.value = false;
  workerInitialization = new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("The browser parser took too long to initialize.")),
      30_000,
    );
    const failed = (event: ErrorEvent): void => {
      window.clearTimeout(timer);
      reject(new Error(event.message || "The playground worker failed to load."));
    };
    const ready = (event: MessageEvent<PlaygroundResponse | PlaygroundReady>): void => {
      if (!("ready" in event.data)) {
        return;
      }
      window.clearTimeout(timer);
      worker?.removeEventListener("message", ready);
      worker?.removeEventListener("error", failed);
      workerReady.value = true;
      resolve();
    };
    worker?.addEventListener("message", ready);
    worker?.addEventListener("error", failed, { once: true });
  });
};

const handleWorkerMessage = (event: MessageEvent<PlaygroundResponse | PlaygroundReady>): void => {
  if ("ready" in event.data) {
    return;
  }
  if (pending === undefined || event.data.id !== pending.id) {
    return;
  }
  window.clearTimeout(pending.timer);
  const current = pending;
  pending = undefined;
  if (event.data.ok) {
    current.resolve(event.data.result);
  } else {
    current.reject(new Error(event.data.error ?? "The playground worker failed."));
  }
};

const callWorker = async <Result>(request: PlaygroundRequestInput): Promise<Result> => {
  if (worker === undefined) {
    createWorker();
  }
  await workerInitialization;
  if (pending !== undefined) {
    throw new Error("Wait for the current playground operation to finish.");
  }
  const id = ++requestId;
  return new Promise<Result>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      failPending(new Error("Rule execution timed out. The worker was restarted."));
      createWorker();
    }, 3_000);
    pending = {
      id,
      resolve: (value) => resolve(value as Result),
      reject,
      timer,
    };
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage does not accept a target origin.
    worker?.postMessage({ ...request, id });
  });
};

const failPending = (reason: Error): void => {
  if (pending !== undefined) {
    window.clearTimeout(pending.timer);
    pending.reject(reason);
    pending = undefined;
  }
};

const runRule = async (): Promise<void> => {
  const fixture = selectedFixture.value;
  if (fixture === undefined) {
    return;
  }
  running.value = true;
  error.value = "";
  notice.value = "";
  diagnosis.value = undefined;
  try {
    analysis.value = await callWorker<AnalysisResult>({
      action: "analyze",
      filename: fixture.filename,
      source: fixture.source,
      ruleSource: ruleSource.value,
    });
    selectedCandidateIndex.value = 0;
    const availableCriteria = Object.keys(
      analysis.value.candidates[0]?.question.type === "choice"
        ? analysis.value.candidates[0].question.criteria
        : {},
    );
    selectedChoice.value = availableCriteria.includes(fixture.expectedChoice)
      ? fixture.expectedChoice
      : (availableCriteria[0] ?? "");
    if (analysis.value.candidates.length > 0 && availableCriteria.length > 0) {
      await testDecision();
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    running.value = false;
  }
};

const testDecision = async (): Promise<void> => {
  if (selectedCandidate.value === undefined || choiceQuestion.value === undefined) {
    diagnosis.value = undefined;
    return;
  }
  error.value = "";
  const probabilities = Object.fromEntries(
    criteria.value.map((criterion) => [
      criterion,
      criterion === selectedChoice.value ? probability.value : 0,
    ]),
  );
  const answer: ChoiceAnswer = {
    type: "choice",
    choice: selectedChoice.value,
    confidence: confidence.value,
    probabilities,
  };
  try {
    diagnosis.value = await callWorker<DiagnosisResult>({
      action: "diagnose",
      answer,
      candidateIndex: selectedCandidateIndex.value,
    });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
};

const scheduleDecision = (): void => {
  window.clearTimeout(decisionTimer);
  decisionTimer = window.setTimeout(() => void testDecision(), 80);
};

const selectFixture = async (fixture: PlaygroundFixture): Promise<void> => {
  selectedFixtureId.value = fixture.id;
  analysis.value = undefined;
  diagnosis.value = undefined;
  await nextTick();
  await runRule();
};

const share = async (): Promise<void> => {
  const encoded = await encodePlaygroundState(currentState());
  const url = new URL(window.location.href);
  url.hash = `state=${encoded}`;
  window.history.replaceState({}, "", url);
  await navigator.clipboard.writeText(url.href);
  showNotice("Share link copied");
};

const reset = async (): Promise<void> => {
  ruleName.value = "require-specific-todo";
  ruleSource.value = defaultRuleSource;
  fixtures.value = defaultFixtures();
  selectedFixtureId.value = "finding";
  window.history.replaceState({}, "", window.location.pathname);
  await runRule();
};

const copyExport = async (): Promise<void> => {
  await navigator.clipboard.writeText(currentExport.value);
  showNotice("Copied to clipboard");
};

const downloadExport = (): void => {
  const names: Record<ExportTab, string> = {
    rule: "index.ts",
    tests: "rule.test.ts",
    fixtures: "eval-fixtures.json",
  };
  const url = URL.createObjectURL(new Blob([currentExport.value], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = names[exportTab.value];
  link.click();
  URL.revokeObjectURL(url);
};

const showNotice = (message: string): void => {
  notice.value = message;
  window.setTimeout(() => {
    if (notice.value === message) {
      notice.value = "";
    }
  }, 1_600);
};

const currentState = (): PlaygroundState => ({
  version: 1,
  ruleName: ruleName.value,
  ruleSource: ruleSource.value,
  fixtures: fixtures.value,
  selectedFixtureId: selectedFixtureId.value,
});

const hydrateSharedState = async (): Promise<void> => {
  const match = /^#state=(.+)$/u.exec(window.location.hash);
  if (match?.[1] === undefined) {
    return;
  }
  try {
    const state = await decodePlaygroundState(match[1]);
    ruleName.value = state.ruleName;
    ruleSource.value = state.ruleSource;
    fixtures.value = state.fixtures;
    selectedFixtureId.value = state.selectedFixtureId;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
};

const identifier = (value: string): string => {
  const words = value.split(/[^a-zA-Z0-9]+/u).filter(Boolean);
  const [first = "customRule", ...rest] = words;
  const joined = `${first}${rest.map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join("")}`;
  return /^\d/u.test(joined) ? `rule${joined}` : joined;
};

const formatJson = (value: unknown): string => JSON.stringify(value, null, 2) ?? "";

onMounted(async () => {
  createWorker();
  await hydrateSharedState();
  await runRule();
});

onBeforeUnmount(() => {
  window.clearTimeout(decisionTimer);
  failPending(new Error("Playground closed."));
  worker?.terminate();
});
</script>

<template>
  <main class="rule-lab">
    <header class="lab-header">
      <div>
        <p class="lab-kicker"><span /> Rule lab · browser only</p>
        <h1>Build the judgment.<br /><em>Test the boundary.</em></h1>
        <p>
          Write a semantic rule against Scruple’s normalized TypeScript facts. Nothing leaves this
          tab; the parser and your rule run in a disposable worker.
        </p>
      </div>
      <div class="lab-actions">
        <button type="button" class="quiet" @click="reset">Reset</button>
        <button type="button" class="quiet" @click="share">Share</button>
        <button type="button" class="quiet" @click="showExport = !showExport">Export</button>
        <button type="button" class="run" :disabled="running || !workerReady" @click="runRule">
          <span :class="{ active: running }" /> {{ runLabel }}
        </button>
      </div>
    </header>

    <p v-if="notice" class="lab-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="lab-error" role="alert">
      <strong>Couldn’t run rule.</strong> {{ error }}
    </p>

    <section v-if="showExport" class="export-drawer" aria-label="Export generated starter files">
      <div class="export-heading">
        <div>
          <span>Generated starter</span>
          <p>Move these files into a package and refine the adversarial assertions locally.</p>
        </div>
        <button type="button" aria-label="Close export" @click="showExport = false">×</button>
      </div>
      <div class="export-tabs">
        <button
          v-for="tab in ['rule', 'tests', 'fixtures'] as ExportTab[]"
          :key="tab"
          type="button"
          :class="{ active: exportTab === tab }"
          @click="exportTab = tab"
        >
          {{
            tab === "rule"
              ? "src/index.ts"
              : tab === "tests"
                ? "tests/rule.test.ts"
                : "eval-fixtures.json"
          }}
        </button>
        <span />
        <button type="button" @click="copyExport">Copy</button>
        <button type="button" @click="downloadExport">Download</button>
      </div>
      <pre><code>{{ currentExport }}</code></pre>
    </section>

    <section class="fixture-strip" aria-label="Rule fixtures">
      <button
        v-for="fixture in fixtures"
        :key="fixture.id"
        type="button"
        :class="['fixture-tab', fixture.outcome, { active: selectedFixtureId === fixture.id }]"
        @click="selectFixture(fixture)"
      >
        <span />
        <span
          >{{ fixture.label }}<small>{{ fixture.expectedChoice }}</small></span
        >
      </button>
      <div class="fixture-meta">
        <label>
          Rule name
          <input v-model="ruleName" spellcheck="false" />
        </label>
      </div>
    </section>

    <section class="lab-workspace">
      <article class="lab-panel source-panel">
        <header>
          <div><span>01</span> Test file</div>
          <input
            v-if="selectedFixture"
            v-model="selectedFixture.filename"
            aria-label="Fixture filename"
          />
        </header>
        <CodeEditor
          v-if="selectedFixture"
          v-model="selectedFixture.source"
          label="TypeScript fixture source"
        />
      </article>

      <article class="lab-panel rule-panel">
        <header>
          <div><span>02</span> Semantic rule</div>
          <span>TypeScript expression</span>
        </header>
        <CodeEditor v-model="ruleSource" label="Semantic rule source" />
      </article>

      <article class="lab-panel results-panel">
        <header>
          <div><span>03</span> Inspect</div>
          <span v-if="analysis"
            >{{ analysis.candidates.length }} candidate{{
              analysis.candidates.length === 1 ? "" : "s"
            }}</span
          >
        </header>
        <div class="result-tabs" role="tablist" aria-label="Rule output">
          <button
            v-for="tab in ['candidates', 'evidence', 'question', 'facts'] as ResultTab[]"
            :key="tab"
            type="button"
            role="tab"
            :aria-selected="resultTab === tab"
            :class="{ active: resultTab === tab }"
            @click="resultTab = tab"
          >
            {{ tab }}
          </button>
        </div>

        <div v-if="analysis === undefined" class="empty-output">
          <span>◇</span>
          <p>Run the rule to inspect its deterministic boundary.</p>
        </div>
        <div v-else-if="analysis.candidates.length === 0" class="empty-output">
          <span>○</span>
          <p>No candidates selected. Adjust the fixture or <code>collect</code> predicate.</p>
        </div>
        <div v-else-if="resultTab === 'candidates'" class="candidate-list">
          <button
            v-for="(candidate, index) in analysis.candidates"
            :key="`${candidate.target.range.start}-${index}`"
            type="button"
            :class="{ active: selectedCandidateIndex === index }"
            @click="selectedCandidateIndex = index"
          >
            <span>{{ String(index + 1).padStart(2, "0") }}</span>
            <strong>{{ candidate.target.kind }}</strong>
            <small>
              L{{ candidate.target.location.start.line }}:{{
                candidate.target.location.start.column
              }}
            </small>
            <code>{{ candidate.target.source }}</code>
          </button>
        </div>
        <HighlightedCode
          v-else-if="resultTab === 'evidence'"
          :source="formatJson(selectedCandidate?.state)"
          language="json"
        />
        <HighlightedCode
          v-else-if="resultTab === 'question'"
          :source="formatJson(selectedCandidate?.question)"
          language="json"
        />
        <HighlightedCode v-else :source="formatJson(analysis.document)" language="json" />
      </article>
    </section>

    <section class="decision-bench">
      <div class="bench-label"><span>04</span> Decision bench</div>
      <div v-if="choiceQuestion" class="decision-controls">
        <label>
          Provider choice
          <select v-model="selectedChoice" @change="testDecision">
            <option v-for="criterion in criteria" :key="criterion" :value="criterion">
              {{ criterion }}
            </option>
          </select>
        </label>
        <label>
          Probability <output>{{ probability.toFixed(2) }}</output>
          <input
            v-model.number="probability"
            type="range"
            min="0"
            max="1"
            step="0.01"
            @input="scheduleDecision"
          />
        </label>
        <label>
          Confidence <output>{{ confidence.toFixed(2) }}</output>
          <input
            v-model.number="confidence"
            type="range"
            min="0"
            max="1"
            step="0.01"
            @input="scheduleDecision"
          />
        </label>
      </div>
      <div v-else class="decision-empty">Select a choice candidate to test diagnosis.</div>
      <div :class="['decision-result', { finding: diagnosis?.diagnostic }]">
        <span>{{ outcomeLabel }}</span>
        <p v-if="diagnosis?.diagnostic">{{ diagnosis.diagnostic.message }}</p>
        <p v-else-if="diagnosis">The rule abstains for this answer and threshold.</p>
        <p v-else>Run a fixture to apply a provider-shaped answer.</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.rule-lab {
  width: min(1600px, calc(100vw - 40px));
  margin: 0 auto;
  padding: 42px 0 70px;
}

.lab-header {
  display: flex;
  gap: 40px;
  align-items: end;
  justify-content: space-between;
  padding-bottom: 34px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.lab-header > div:first-child {
  max-width: 760px;
}

.lab-kicker {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 0 0 18px;
  color: var(--vp-c-text-2);
  font: 500 10px/1 var(--vp-font-family-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lab-kicker span {
  width: 7px;
  height: 7px;
  background: var(--vp-c-brand-1);
  transform: rotate(45deg);
}

.lab-header h1 {
  margin: 0;
  border: 0;
  font-size: clamp(42px, 5vw, 72px);
  line-height: 0.98;
  letter-spacing: -0.06em;
}

.lab-header h1 em {
  color: var(--vp-c-brand-1);
  font-family: "Newsreader", Georgia, serif;
  font-weight: 400;
}

.lab-header > div > p:last-child {
  max-width: 680px;
  margin: 22px 0 0;
  color: var(--vp-c-text-2);
  line-height: 1.7;
}

.lab-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: end;
}

.lab-actions button,
.export-tabs button {
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  font: 500 11px/1 var(--vp-font-family-mono);
  cursor: pointer;
}

.lab-actions .run {
  display: flex;
  gap: 9px;
  align-items: center;
  min-width: 116px;
  border-color: var(--vp-c-text-1);
  background: var(--vp-c-text-1);
  color: var(--vp-c-bg);
}

.run span {
  width: 6px;
  height: 6px;
  background: var(--vp-c-brand-1);
}

.run span.active {
  animation: pulse 0.8s infinite alternate;
}

.lab-notice,
.lab-error {
  position: fixed;
  z-index: 50;
  top: 76px;
  right: 22px;
  max-width: 520px;
  margin: 0;
  padding: 13px 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background: var(--vp-c-bg-elv);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.14);
  font-size: 12px;
}

.lab-error {
  border-color: #b85e4b;
  color: #9f4937;
}

.fixture-strip {
  display: flex;
  gap: 8px;
  align-items: stretch;
  padding: 18px 0;
}

.fixture-tab {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 150px;
  padding: 11px 13px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background: transparent;
  color: var(--vp-c-text-2);
  text-align: left;
  cursor: pointer;
}

.fixture-tab > span:first-child {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d06c57;
}

.fixture-tab.safe > span:first-child {
  background: #719731;
}

.fixture-tab.ambiguous > span:first-child {
  background: #b19042;
}

.fixture-tab.active {
  border-color: var(--vp-c-text-1);
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
}

.fixture-tab span:last-child {
  display: grid;
  gap: 4px;
  font: 600 11px/1 var(--vp-font-family-base);
}

.fixture-tab small {
  color: var(--vp-c-text-3);
  font: 400 9px/1 var(--vp-font-family-mono);
}

.fixture-meta {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.fixture-meta label,
.decision-controls label {
  display: grid;
  gap: 6px;
  color: var(--vp-c-text-3);
  font: 500 9px/1 var(--vp-font-family-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.fixture-meta input,
.lab-panel header input,
.decision-controls select {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 3px;
  outline: 0;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  font: 400 11px/1 var(--vp-font-family-mono);
}

.lab-workspace {
  display: grid;
  grid-template-columns: minmax(260px, 0.72fr) minmax(380px, 1.08fr) minmax(330px, 0.9fr);
  min-height: 610px;
  overflow: hidden;
  border: 1px solid #353a34;
  border-radius: 5px;
  background: #171a17;
  box-shadow: 12px 12px 0 var(--vp-c-bg-alt);
  color: #edf0e9;
}

.lab-panel {
  display: grid;
  grid-template-rows: 48px minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  border-right: 1px solid #353a34;
}

.lab-panel:last-child {
  border-right: 0;
}

.lab-panel > header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid #353a34;
  color: #899187;
  font: 500 9px/1 var(--vp-font-family-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lab-panel > header div span,
.bench-label span {
  margin-right: 7px;
  color: #c7f36b;
}

.lab-panel header input {
  width: 115px;
  min-height: 28px;
  border-color: #353a34;
  background: #1e221e;
  color: #bcc2b8;
  text-align: right;
}

.result-tabs {
  display: flex;
  grid-column: 1 / -1;
  height: 40px;
  border-bottom: 1px solid #353a34;
}

.results-panel {
  grid-template-rows: 48px 40px minmax(0, 1fr);
}

.result-tabs button {
  padding: 0 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #7f887d;
  font: 400 9px/1 var(--vp-font-family-mono);
  text-transform: capitalize;
  cursor: pointer;
}

.result-tabs button.active {
  border-color: #c7f36b;
  color: #edf0e9;
}

.results-panel pre,
.export-drawer pre {
  margin: 0;
  padding: 20px;
  overflow: auto;
  background: transparent;
  white-space: pre-wrap;
}

.results-panel pre code,
.export-drawer pre code {
  color: #c7cec3;
  font: 400 10px/1.65 var(--vp-font-family-mono);
}

.rule-lab :deep(.shj-syn-cmnt) {
  color: #8b949e;
  font-style: italic;
}

.rule-lab :deep(.shj-syn-err),
.rule-lab :deep(.shj-syn-kwd) {
  color: #ff7b72;
}

.rule-lab :deep(.shj-syn-class) {
  color: #ffa657;
}

.rule-lab :deep(.shj-syn-insert) {
  color: #98c379;
}

.rule-lab :deep(.shj-syn-str) {
  color: #a5d6ff;
}

.rule-lab :deep(.shj-syn-type),
.rule-lab :deep(.shj-syn-oper),
.rule-lab :deep(.shj-syn-num),
.rule-lab :deep(.shj-syn-section),
.rule-lab :deep(.shj-syn-var),
.rule-lab :deep(.shj-syn-bool) {
  color: #79c0ff;
}

.rule-lab :deep(.shj-syn-func) {
  color: #d2a8ff;
}

.candidate-list {
  padding: 12px;
  overflow: auto;
}

.candidate-list button {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 8px;
  width: 100%;
  margin-bottom: 8px;
  padding: 13px;
  border: 1px solid #353a34;
  border-radius: 3px;
  background: #1c201c;
  color: #8e968a;
  text-align: left;
  cursor: pointer;
}

.candidate-list button.active {
  border-color: #788b53;
}

.candidate-list strong {
  color: #e2e5dd;
  font: 500 10px/1 var(--vp-font-family-mono);
}

.candidate-list small {
  font: 400 9px/1 var(--vp-font-family-mono);
}

.candidate-list code {
  grid-column: 2 / -1;
  overflow: hidden;
  color: #aeb5aa;
  font: 400 10px/1.5 var(--vp-font-family-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-output {
  display: grid;
  place-content: center;
  padding: 30px;
  color: #778075;
  text-align: center;
}

.empty-output > span {
  color: #c7f36b;
  font-size: 28px;
}

.empty-output p {
  max-width: 250px;
  font-size: 12px;
  line-height: 1.6;
}

.decision-bench {
  display: grid;
  grid-template-columns: 150px minmax(500px, 1fr) minmax(300px, 0.7fr);
  gap: 26px;
  align-items: center;
  margin-top: 30px;
  padding: 22px 0;
  border-top: 1px solid var(--vp-c-divider);
  border-bottom: 1px solid var(--vp-c-divider);
}

.bench-label {
  color: var(--vp-c-text-3);
  font: 500 10px/1.4 var(--vp-font-family-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.decision-controls {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 20px;
}

.decision-controls label {
  position: relative;
}

.decision-controls output {
  position: absolute;
  top: 0;
  right: 0;
  color: var(--vp-c-text-1);
}

.decision-controls input[type="range"] {
  width: 100%;
  accent-color: var(--vp-c-brand-1);
}

.decision-result {
  min-height: 72px;
  padding: 14px 16px;
  border-left: 3px solid #73912f;
  background: var(--vp-c-bg-soft);
}

.decision-result.finding {
  border-color: #c6624e;
}

.decision-result span {
  color: var(--vp-c-text-3);
  font: 500 9px/1 var(--vp-font-family-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.decision-result p {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.export-drawer {
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid #353a34;
  border-radius: 5px;
  background: #171a17;
  color: #edf0e9;
}

.export-heading,
.export-tabs {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid #353a34;
}

.export-heading {
  justify-content: space-between;
}

.export-heading span {
  font: 500 11px/1 var(--vp-font-family-mono);
}

.export-heading p {
  margin: 6px 0 0;
  color: #8e968a;
  font-size: 11px;
}

.export-heading > button {
  border: 0;
  background: transparent;
  color: #8e968a;
  font-size: 24px;
  cursor: pointer;
}

.export-tabs {
  padding-top: 8px;
  padding-bottom: 8px;
}

.export-tabs span {
  flex: 1;
}

.export-tabs button {
  min-height: 32px;
  border-color: #353a34;
  background: transparent;
  color: #9ba297;
  font-size: 9px;
}

.export-tabs button.active {
  border-color: #c7f36b;
  color: #edf0e9;
}

.export-drawer pre {
  max-height: 350px;
}

@keyframes pulse {
  from {
    opacity: 0.35;
  }
  to {
    opacity: 1;
  }
}

@media (max-width: 1100px) {
  .lab-workspace {
    grid-template-columns: 1fr 1fr;
  }

  .results-panel {
    grid-column: 1 / -1;
    min-height: 420px;
    border-top: 1px solid #353a34;
  }

  .decision-bench {
    grid-template-columns: 120px 1fr;
  }

  .decision-result {
    grid-column: 2;
  }
}

@media (max-width: 700px) {
  .rule-lab {
    width: min(100% - 24px, 1600px);
    padding-top: 24px;
  }

  .lab-header {
    align-items: stretch;
    flex-direction: column;
  }

  .lab-actions {
    justify-content: start;
  }

  .fixture-strip {
    overflow-x: auto;
  }

  .fixture-tab {
    min-width: 108px;
    padding-right: 9px;
    padding-left: 9px;
  }

  .fixture-tab small {
    display: none;
  }

  .fixture-meta {
    display: none;
  }

  .lab-workspace {
    display: block;
    min-height: 0;
  }

  .lab-panel {
    min-height: 480px;
    border-right: 0;
    border-bottom: 1px solid #353a34;
  }

  .decision-bench,
  .decision-controls {
    grid-template-columns: 1fr;
  }

  .decision-result {
    grid-column: auto;
  }

  .export-tabs {
    flex-wrap: wrap;
  }

  .export-tabs span {
    display: none;
  }
}
</style>
