<template>
  <div class="provider-options">
    <article class="provider-card">
      <header>
        <div>
          <span>Hosted</span>
          <h3>Jev</h3>
        </div>
        <p>Send rule questions and selected code to Jev over HTTPS.</p>
      </header>

      <div class="provider-card-code">
        <h4>Configuration</h4>
        <pre><code><span class="code-keyword">import</span> {
  <span class="code-function">jevProvider</span>,
} <span class="code-keyword">from</span> <span class="code-string">"@scruple/provider-jev"</span>;

<span class="code-keyword">const</span> provider = <span class="code-function">jevProvider</span>({
  <span class="code-property">apiKey</span>:
    process.env[<span class="code-string">"TYPESAFE_API_KEY"</span>]!,
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
        <pre><code><span class="code-keyword">interface</span> <span class="code-type">DecisionProvider</span> {
  <span class="code-keyword">readonly</span> <span class="code-property">id</span>: <span class="code-type">string</span>;
  <span class="code-keyword">readonly</span> <span class="code-property">concurrency</span>?: <span class="code-type">number</span>;
  <span class="code-function">evaluate</span>(
    <span class="code-property">request</span>: <span class="code-type">DecisionRequest</span>,
    <span class="code-property">signal</span>?: <span class="code-type">AbortSignal</span>,
  ): <span class="code-type">Promise</span>&lt;<span class="code-type">DecisionResponse</span>&gt;;
  <span class="code-function">close</span>?(): <span class="code-type">Promise</span>&lt;<span class="code-type">void</span>&gt; | <span class="code-type">void</span>;
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
  background: var(--scruple-code-bg);
}

.provider-card-code h4 {
  margin: 0;
  padding: 11px 14px;
  border-bottom: 1px solid var(--scruple-code-divider);
  color: var(--scruple-code-muted);
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
  color: var(--scruple-code-text);
  font: 400 10px/1.7 var(--vp-font-family-mono);
}

.code-keyword {
  color: var(--scruple-code-keyword);
}

.code-function {
  color: var(--scruple-code-function);
}

.code-property {
  color: var(--scruple-code-text);
}

.code-string {
  color: var(--scruple-code-literal);
}

.code-type {
  color: var(--scruple-code-function);
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
    font-size: 10px;
  }
}
</style>
