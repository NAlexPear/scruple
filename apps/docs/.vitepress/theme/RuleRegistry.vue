<script setup lang="ts">
import { computed, ref } from "vue";

import { rules } from "../rule-catalog.js";

const query = ref("");
const plugin = ref("all");

const plugins = computed(() => [
  { slug: "all", name: "All rules", count: rules.length },
  ...[...new Set(rules.map((rule) => rule.plugin))].map((slug) => ({
    slug,
    name: rules.find((rule) => rule.plugin === slug)?.pluginName ?? slug,
    count: rules.filter((rule) => rule.plugin === slug).length,
  })),
]);

const filteredRules = computed(() => {
  const search = query.value.trim().toLowerCase();
  return rules.filter((rule) => {
    if (plugin.value !== "all" && rule.plugin !== plugin.value) {
      return false;
    }
    if (search.length === 0) {
      return true;
    }
    return [
      rule.id,
      rule.summary,
      rule.explanation,
      rule.category,
      ...rule.tags,
      ...rule.searchTerms,
    ].some((value) => value.toLowerCase().includes(search));
  });
});
</script>

<template>
  <section class="rule-registry" aria-labelledby="rule-registry-heading">
    <div class="registry-heading">
      <div>
        <p class="registry-kicker">Rule registry</p>
        <h2 id="rule-registry-heading">Find the check you need.</h2>
      </div>
      <p>{{ rules.length }} semantic rules across {{ plugins.length - 1 }} plugins.</p>
    </div>

    <div class="registry-controls">
      <label class="rule-search">
        <span class="sr-only">Search rules</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input v-model="query" type="search" placeholder="Search by rule, behavior, or concern…" />
      </label>

      <div class="plugin-filters" aria-label="Filter rules by plugin">
        <button
          v-for="item in plugins"
          :key="item.slug"
          type="button"
          :class="{ active: plugin === item.slug }"
          :aria-pressed="plugin === item.slug"
          @click="plugin = item.slug"
        >
          {{ item.name }} <span>{{ item.count }}</span>
        </button>
      </div>
    </div>

    <div class="registry-results" aria-live="polite">
      <p class="result-count">
        {{ filteredRules.length }} {{ filteredRules.length === 1 ? "rule" : "rules" }}
      </p>
      <div v-if="filteredRules.length > 0" class="rule-grid">
        <a
          v-for="rule in filteredRules"
          :key="rule.id"
          class="rule-card"
          :href="`/rules/${rule.id}`"
        >
          <div class="rule-card-topline">
            <span>{{ rule.pluginName }}</span>
            <span v-if="rule.category.toLowerCase() !== rule.pluginName.toLowerCase()">
              {{ rule.category }}
            </span>
          </div>
          <code>{{ rule.id }}</code>
          <p>{{ rule.summary }}</p>
          <div class="rule-card-footer">
            <span v-for="tag in rule.tags.slice(0, 2)" :key="tag">{{ tag }}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </div>
        </a>
      </div>
      <div v-else class="empty-rules">
        <p>No rules match “{{ query }}”.</p>
        <button type="button" @click="((query = ''), (plugin = 'all'))">Clear filters</button>
        <a href="/guide/writing-a-plugin">Write a custom rule</a>
      </div>
    </div>

    <div class="custom-rule-path">
      <div>
        <p>Need a check that is specific to your codebase?</p>
        <span
          >Define the evidence, decision criteria, thresholds, and diagnostic in your own
          plugin.</span
        >
      </div>
      <a href="/guide/writing-a-plugin">Write a custom rule</a>
    </div>
  </section>
</template>

<style scoped>
.rule-registry {
  margin: 56px 0 20px;
}

.registry-heading {
  display: flex;
  gap: 32px;
  align-items: end;
  justify-content: space-between;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.registry-kicker {
  margin: 0 0 10px;
  color: var(--vp-c-brand-1);
  font: 500 11px/1 var(--vp-font-family-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.registry-heading h2 {
  margin: 0;
  border: 0;
  font-size: clamp(30px, 4vw, 44px);
  letter-spacing: -0.045em;
}

.registry-heading > p {
  max-width: 260px;
  margin: 0 0 5px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  text-align: right;
}

.registry-controls {
  padding: 24px 0 28px;
}

.rule-search {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 12px;
  align-items: center;
  min-height: 54px;
  padding: 0 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 5px;
  background: var(--vp-c-bg-elv);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.rule-search:focus-within {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

.rule-search svg,
.rule-card-footer svg {
  fill: none;
  stroke: currentcolor;
  stroke-linecap: square;
  stroke-width: 1.7;
}

.rule-search input {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--vp-c-text-1);
  font: 500 14px/1.4 var(--vp-font-family-base);
}

.plugin-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
  padding-bottom: 4px;
  overflow-x: auto;
}

.plugin-filters button {
  flex: none;
  padding: 7px 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background: transparent;
  color: var(--vp-c-text-2);
  font: 500 11px/1.2 var(--vp-font-family-mono);
  cursor: pointer;
}

.plugin-filters button span {
  margin-left: 5px;
  color: var(--vp-c-text-3);
}

.plugin-filters button.active {
  border-color: var(--vp-c-text-1);
  background: var(--vp-c-text-1);
  color: var(--vp-c-bg);
}

.plugin-filters button.active span {
  color: inherit;
  opacity: 0.65;
}

.result-count {
  margin: 0 0 12px;
  color: var(--vp-c-text-3);
  font: 500 10px/1 var(--vp-font-family-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.rule-card {
  display: flex;
  min-width: 0;
  min-height: 186px;
  flex-direction: column;
  padding: 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition:
    border-color 0.18s,
    transform 0.18s,
    box-shadow 0.18s;
}

.rule-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 5px 5px 0 var(--vp-c-brand-soft);
  transform: translate(-2px, -2px);
}

.rule-card-topline {
  display: flex;
  justify-content: space-between;
  color: var(--vp-c-text-3);
  font: 500 9px/1 var(--vp-font-family-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.rule-card code {
  margin-top: 24px;
  color: var(--vp-c-brand-1);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.rule-card p {
  margin: 8px 0 20px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.55;
}

.rule-card-footer {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: auto;
}

.rule-card-footer span {
  padding: 3px 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-3);
  font: 400 9px/1.2 var(--vp-font-family-mono);
}

.rule-card-footer svg {
  width: 18px;
  margin-left: auto;
}

.empty-rules {
  padding: 56px 20px;
  border: 1px dashed var(--vp-c-border);
  text-align: center;
}

.empty-rules p {
  color: var(--vp-c-text-2);
}

.empty-rules button {
  border: 0;
  background: none;
  color: var(--vp-c-brand-1);
  font-weight: 700;
  cursor: pointer;
}

.empty-rules a {
  display: block;
  width: fit-content;
  margin: 14px auto 0;
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 700;
  text-underline-offset: 4px;
}

.custom-rule-path {
  display: flex;
  gap: 28px;
  align-items: center;
  justify-content: space-between;
  margin-top: 28px;
  padding: 22px 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
}

.custom-rule-path p {
  margin: 0 0 5px;
  color: var(--vp-c-text-1);
  font-weight: 700;
}

.custom-rule-path span {
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.custom-rule-path a {
  flex: none;
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 700;
  text-underline-offset: 4px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 700px) {
  .registry-heading {
    display: block;
  }

  .registry-heading > p {
    margin: 14px 0 0;
    text-align: left;
  }

  .rule-grid {
    grid-template-columns: 1fr;
  }

  .custom-rule-path {
    display: block;
  }

  .custom-rule-path a {
    display: inline-block;
    margin-top: 16px;
  }
}
</style>
