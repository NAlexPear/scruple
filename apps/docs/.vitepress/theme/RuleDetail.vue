<script setup lang="ts">
import { computed, ref } from "vue";

import { getRule } from "../rule-catalog.js";
import MarkdownActions from "./MarkdownActions.vue";

const props = defineProps<{ ruleId: string }>();
const selectedExample = ref<"incorrect" | "correct">("incorrect");
const copied = ref(false);
const rule = computed(() => getRule(props.ruleId));
const pluginFactories: Record<string, string> = {
  "api-contracts": "apiContracts",
  async: "asyncRules",
  comments: "comments",
  errors: "errors",
  observability: "observability",
  "relational-databases": "relationalDatabases",
  resources: "resources",
  security: "security",
  tests: "tests",
};
const pluginFactory = computed(() =>
  rule.value === undefined ? undefined : pluginFactories[rule.value.plugin],
);

const copyConfiguration = async () => {
  if (rule.value === undefined) {
    return;
  }
  await navigator.clipboard.writeText(`"${rule.value.id}": "warn"`);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1400);
};
</script>

<template>
  <article v-if="rule" class="rule-detail">
    <a class="back-link" href="/plugins/">← All rules</a>
    <header class="rule-hero">
      <div class="rule-eyebrow">
        <a :href="`/plugins/${rule.plugin}`">{{ rule.pluginName }}</a>
        <span>{{ rule.category }}</span>
      </div>
      <h1>{{ rule.id }}</h1>
      <MarkdownActions />
      <p>{{ rule.explanation }}</p>
      <div class="rule-tags">
        <span v-for="tag in rule.tags" :key="tag">{{ tag }}</span>
      </div>
    </header>

    <section class="rule-section">
      <div class="section-label"><span>01</span> Examples</div>
      <div class="example-shell">
        <div class="example-tabs" role="group" aria-label="Code example outcome">
          <button
            type="button"
            :aria-pressed="selectedExample === 'incorrect'"
            :class="{ active: selectedExample === 'incorrect' }"
            @click="selectedExample = 'incorrect'"
          >
            <span class="status-dot incorrect" /> Reported
          </button>
          <button
            type="button"
            :aria-pressed="selectedExample === 'correct'"
            :class="{ active: selectedExample === 'correct' }"
            @click="selectedExample = 'correct'"
          >
            <span class="status-dot correct" /> Accepted
          </button>
          <span class="example-language">TypeScript</span>
        </div>
        <pre><code>{{ rule[selectedExample] }}</code></pre>
        <div v-if="selectedExample === 'incorrect'" class="finding-preview">
          <span>Finding</span>
          <p>{{ rule.summary }}</p>
        </div>
        <div v-else class="finding-preview accepted">
          <span>Accepted</span>
          <p>The visible evidence does not violate this rule.</p>
        </div>
      </div>
    </section>

    <section class="rule-section rule-setup">
      <div class="section-label"><span>02</span> Enable it</div>
      <div>
        <h2>Setup</h2>
        <p>Install the package, register its plugin factory, then enable the rule.</p>
        <h3>Install the package</h3>
        <pre class="setup-code"><code>pnpm add -D {{ rule.packageName }}</code></pre>
        <template v-if="pluginFactory">
          <h3>Register the plugin</h3>
          <p>
            In <code>scruple.config.ts</code>, register the factory under the
            <code>{{ rule.plugin }}</code> namespace used by the rule ID.
          </p>
          <pre
            class="setup-code"
          ><code>import { {{ pluginFactory }} } from "{{ rule.packageName }}";

plugins: {
  "{{ rule.plugin }}": {{ pluginFactory }}(),
},</code></pre>
        </template>
        <h3>Enable the rule</h3>
        <div class="config-code">
          <code>"{{ rule.id }}": "warn"</code>
          <button type="button" @click="copyConfiguration">{{ copied ? "Copied" : "Copy" }}</button>
        </div>
        <dl>
          <div>
            <dt>Package</dt>
            <dd>
              <code>{{ rule.packageName }}</code>
            </dd>
          </div>
          <div>
            <dt>Default threshold</dt>
            <dd>{{ rule.defaultThreshold ?? "Plugin default" }}</dd>
          </div>
          <div>
            <dt>Minimum confidence</dt>
            <dd>{{ rule.minConfidence ?? "Plugin default" }}</dd>
          </div>
        </dl>
      </div>
    </section>
  </article>
  <div v-else class="missing-rule">
    <h1>Rule not found</h1>
    <a href="/plugins/">Browse the rule registry</a>
  </div>
</template>

<style scoped>
.rule-detail {
  max-width: 920px;
  margin: 0 auto;
}

.back-link {
  display: inline-block;
  margin-bottom: 34px;
  color: var(--vp-c-text-2);
  font: 500 12px/1 var(--vp-font-family-mono);
  text-decoration: none;
}

.rule-hero {
  padding-bottom: 42px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.rule-eyebrow {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--vp-c-text-3);
  font: 500 10px/1 var(--vp-font-family-mono);
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.rule-eyebrow a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.rule-eyebrow span::before {
  margin-right: 12px;
  content: "/";
}

.rule-hero h1 {
  margin: 22px 0 18px;
  border: 0;
  font: 500 clamp(34px, 5vw, 58px)/1.04 var(--vp-font-family-mono);
  letter-spacing: -0.06em;
  overflow-wrap: anywhere;
}

.rule-hero > p {
  max-width: 730px;
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 17px;
  line-height: 1.75;
}

.rule-tags {
  display: flex;
  gap: 7px;
  margin-top: 24px;
}

.rule-tags span {
  padding: 5px 8px;
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-3);
  font: 400 10px/1 var(--vp-font-family-mono);
}

.rule-section {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 30px;
  padding: 44px 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.section-label {
  color: var(--vp-c-text-3);
  font: 500 10px/1.3 var(--vp-font-family-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.section-label span {
  margin-right: 9px;
  color: var(--vp-c-brand-1);
}

.example-shell {
  overflow: hidden;
  border: 1px solid #343a32;
  border-radius: 5px;
  background: #171a17;
  color: #eef0e9;
}

.example-tabs {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 8px;
  border-bottom: 1px solid #343a32;
}

.example-tabs button {
  display: flex;
  gap: 7px;
  align-items: center;
  align-self: stretch;
  padding: 0 11px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: #92998f;
  font: 500 11px/1 var(--vp-font-family-mono);
  cursor: pointer;
}

.example-tabs button.active {
  border-color: #c7f36b;
  color: #f2f0e8;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-dot.incorrect {
  background: #ed826d;
}

.status-dot.correct {
  background: #b6dc68;
}

.example-language {
  margin-left: auto;
  padding-right: 10px;
  color: #717970;
  font: 400 9px/1 var(--vp-font-family-mono);
  text-transform: uppercase;
}

.example-shell pre {
  min-height: 150px;
  margin: 0;
  padding: 26px;
  overflow-x: auto;
  background: transparent;
  white-space: pre-wrap;
}

.example-shell pre code {
  color: #e2e5dd;
  font: 400 13px/1.8 var(--vp-font-family-mono);
}

.finding-preview {
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 14px;
  padding: 15px 20px;
  border-top: 1px solid #343a32;
  background: rgba(237, 130, 109, 0.08);
}

.finding-preview span {
  color: #ed826d;
  font: 500 9px/1.5 var(--vp-font-family-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.finding-preview p {
  margin: 0;
  color: #bfc5bb;
  font-size: 12px;
  line-height: 1.5;
}

.finding-preview.accepted {
  background: rgba(182, 220, 104, 0.08);
}

.finding-preview.accepted span {
  color: #b6dc68;
}

.rule-setup h2 {
  margin: 0 0 10px;
  border: 0;
  font-size: 24px;
}

.rule-setup p {
  color: var(--vp-c-text-2);
}

.rule-setup h3 {
  margin: 24px 0 8px;
  font-size: 14px;
}

.setup-code {
  margin: 10px 0 0;
  padding: 14px 16px;
  overflow-x: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-elv);
}

.setup-code code {
  color: var(--vp-c-text-1);
  font-size: 12px;
  line-height: 1.7;
}

.config-code {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-top: 22px;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-elv);
}

.config-code code {
  min-width: 0;
  color: var(--vp-c-brand-1);
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: normal;
}

.config-code button {
  flex: none;
  border: 0;
  background: none;
  color: var(--vp-c-text-2);
  font: 500 10px/1 var(--vp-font-family-mono);
  cursor: pointer;
}

.rule-setup dl {
  margin: 24px 0 0;
  border-top: 1px solid var(--vp-c-divider);
}

.rule-setup dl div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 11px 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.rule-setup dt,
.rule-setup dd {
  margin: 0;
  font-size: 12px;
}

.rule-setup dt {
  color: var(--vp-c-text-3);
}

.missing-rule {
  padding: 80px 0;
  text-align: center;
}

@media (max-width: 700px) {
  .rule-section {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .example-shell pre {
    padding: 20px;
  }
}
</style>
