<template>
  <div class="provider-options">
    <article class="provider-card">
      <header>
        <div>
          <span>Hosted</span>
          <h3>Jev</h3>
        </div>
        <p>Send focused decisions to Jev over HTTPS for quick setup and parallel checks in CI.</p>
      </header>

      <div class="provider-card-code">
        <h4>Setup</h4>
        <pre><code>pnpm add -D @scruple/provider-jev

import { jevProvider } from "@scruple/provider-jev";

const provider = jevProvider({
  apiKey: process.env["TYPESAFE_API_KEY"]!,
});</code></pre>
      </div>

      <a href="/providers/jev">Read the Jev guide</a>
    </article>

    <article class="provider-card">
      <header>
        <div>
          <span>Custom</span>
          <h3>Bring your own</h3>
        </div>
        <p>
          Connect any service or local model that accepts typed questions and returns typed answers.
        </p>
      </header>

      <div class="provider-card-code">
        <h4>Provider interface</h4>
        <pre><code>interface DecisionProvider {
  readonly id: string;
  readonly concurrency?: number;
  evaluate(
    request: DecisionRequest,
    signal?: AbortSignal,
  ): Promise&lt;DecisionResponse&gt;;
  close?(): Promise&lt;void&gt; | void;
}</code></pre>
      </div>

      <a href="/reference/configuration#provider-contract">See the provider contract</a>
    </article>
  </div>
</template>

<style scoped>
.provider-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  min-width: 0;
}

.provider-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  background: var(--vp-c-bg);
  overflow: hidden;
}

.provider-card > header {
  margin-bottom: 24px;
}

.provider-card header span {
  color: var(--vp-c-brand-1);
  font: 500 9px/1 var(--vp-font-family-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.provider-card h3 {
  margin: 7px 0 0;
  color: var(--vp-c-text-1);
  font-size: 22px;
}

.provider-card header p {
  min-height: 64px;
  margin: 14px 0 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.65;
}

.provider-card-code {
  flex: 1;
  border: 1px solid var(--vp-c-divider);
  background: #171a17;
}

.provider-card-code h4 {
  margin: 0;
  padding: 11px 14px;
  border-bottom: 1px solid #353a34;
  color: #90988d;
  font: 500 8px/1 var(--vp-font-family-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.provider-card-code pre {
  min-height: 210px;
  margin: 0;
  padding: 16px 14px;
  overflow: auto;
  background: transparent;
  color: #edf0e9;
  font: 400 8px/1.75 var(--vp-font-family-mono);
}

.provider-card > a {
  display: inline-block;
  margin-top: 20px;
  color: var(--vp-c-text-1);
  font-size: 12px;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 4px;
}

@media (max-width: 1280px) {
  .provider-options {
    grid-template-columns: 1fr;
  }

  .provider-card header p {
    min-height: auto;
  }
}

@media (max-width: 640px) {
  .provider-card {
    padding: 20px;
  }

  .provider-card-code pre {
    min-height: auto;
    font-size: 8px;
  }
}
</style>
