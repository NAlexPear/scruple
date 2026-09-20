<script setup lang="ts">
import { computed, ref } from "vue";

const providers = {
  jev: {
    name: "Jev",
    mode: "Hosted",
    description:
      "Send focused decisions to Jev over HTTPS. Choose it for quick setup and parallel checks in CI.",
    install: "pnpm add -D @scruple/provider-jev",
    configuration: `import { jevProvider } from "@scruple/provider-jev";

const provider = jevProvider({
  apiKey: process.env["TYPESAFE_API_KEY"]!,
});`,
    href: "/providers/jev",
  },
  laya: {
    name: "Laya",
    mode: "Local",
    description: "Run decision models on your own hardware through one persistent Python process.",
    install: `pnpm add -D @scruple/provider-laya
uv init --bare
uv add laya`,
    configuration: `import { layaProvider } from "@scruple/provider-laya";

const provider = layaProvider({
  model: "typed-decisions",
  python: ".venv/bin/python",
  preload: true,
});`,
    href: "/providers/laya",
  },
} as const;

type ProviderId = keyof typeof providers;

const selected = ref<ProviderId>("jev");
const provider = computed(() => providers[selected.value]);
</script>

<template>
  <div class="provider-picker">
    <div class="provider-picker-control">
      <label for="landing-provider">Provider</label>
      <select id="landing-provider" v-model="selected">
        <option value="jev">Jev · hosted</option>
        <option value="laya">Laya · local</option>
      </select>
    </div>

    <div class="provider-picker-details" aria-live="polite">
      <header>
        <div>
          <span>{{ provider.mode }}</span>
          <h3>{{ provider.name }}</h3>
        </div>
        <p>{{ provider.description }}</p>
      </header>

      <div class="provider-picker-code">
        <section>
          <h4>Install</h4>
          <pre><code>{{ provider.install }}</code></pre>
        </section>
        <section>
          <h4>Configuration</h4>
          <pre><code>{{ provider.configuration }}</code></pre>
        </section>
      </div>

      <a :href="provider.href">Read the {{ provider.name }} guide</a>
    </div>
  </div>
</template>

<style scoped>
.provider-picker {
  min-width: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  background: var(--vp-c-bg);
  overflow: hidden;
}

.provider-picker-control {
  display: flex;
  position: relative;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.provider-picker-control::after {
  position: absolute;
  top: 50%;
  right: 29px;
  width: 6px;
  height: 6px;
  border-right: 1px solid var(--vp-c-text-2);
  border-bottom: 1px solid var(--vp-c-text-2);
  content: "";
  pointer-events: none;
  transform: translateY(-65%) rotate(45deg);
}

.provider-picker-control label {
  color: var(--vp-c-text-3);
  font: 500 9px/1 var(--vp-font-family-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.provider-picker-control select {
  appearance: none;
  min-width: 150px;
  padding: 8px 34px 8px 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 3px;
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-1);
  font: 500 11px/1 var(--vp-font-family-mono);
}

.provider-picker-details {
  padding: 26px;
}

.provider-picker-details > header {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 28px;
  align-items: end;
  margin-bottom: 24px;
}

.provider-picker-details header span {
  color: var(--vp-c-brand-1);
  font: 500 9px/1 var(--vp-font-family-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.provider-picker-details h3 {
  margin: 7px 0 0;
  color: var(--vp-c-text-1);
  font-size: 22px;
}

.provider-picker-details header p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.65;
}

.provider-picker-code {
  display: grid;
  grid-template-columns: minmax(190px, 0.7fr) minmax(300px, 1.3fr);
  border: 1px solid var(--vp-c-divider);
  background: #171a17;
}

.provider-picker-code section + section {
  border-left: 1px solid #353a34;
}

.provider-picker-code h4 {
  margin: 0;
  padding: 11px 14px;
  border-bottom: 1px solid #353a34;
  color: #90988d;
  font: 500 8px/1 var(--vp-font-family-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.provider-picker-code pre {
  min-height: 150px;
  margin: 0;
  padding: 16px 14px;
  overflow: auto;
  background: transparent;
  color: #edf0e9;
  font: 400 9px/1.75 var(--vp-font-family-mono);
}

.provider-picker-details > a {
  display: inline-block;
  margin-top: 20px;
  color: var(--vp-c-text-1);
  font-size: 12px;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 4px;
}

@media (max-width: 640px) {
  .provider-picker-details {
    padding: 20px;
  }

  .provider-picker-details > header,
  .provider-picker-code {
    grid-template-columns: 1fr;
  }

  .provider-picker-code section + section {
    border-top: 1px solid #353a34;
    border-left: 0;
  }

  .provider-picker-code pre {
    min-height: auto;
    font-size: 8px;
  }
}
</style>
