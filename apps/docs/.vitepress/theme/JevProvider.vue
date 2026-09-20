<template>
  <div class="provider-card">
    <div class="provider-card-details">
      <header>
        <div>
          <span>Hosted</span>
          <h3>Jev</h3>
        </div>
        <p>Send focused decisions to Jev over HTTPS for quick setup and parallel checks in CI.</p>
      </header>

      <div class="provider-card-code">
        <section>
          <h4>Install</h4>
          <pre><code>pnpm add -D @scruple/provider-jev</code></pre>
        </section>
        <section>
          <h4>Configuration</h4>
          <pre><code>import { jevProvider } from "@scruple/provider-jev";

const provider = jevProvider({
  apiKey: process.env["TYPESAFE_API_KEY"]!,
});</code></pre>
        </section>
      </div>

      <a href="/providers/jev">Read the Jev guide</a>
    </div>
  </div>
</template>

<style scoped>
.provider-card {
  min-width: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  background: var(--vp-c-bg);
  overflow: hidden;
}

.provider-card-details {
  padding: 26px;
}

.provider-card-details > header {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 28px;
  align-items: end;
  margin-bottom: 24px;
}

.provider-card-details header span {
  color: var(--vp-c-brand-1);
  font: 500 9px/1 var(--vp-font-family-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.provider-card-details h3 {
  margin: 7px 0 0;
  color: var(--vp-c-text-1);
  font-size: 22px;
}

.provider-card-details header p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.65;
}

.provider-card-code {
  display: grid;
  grid-template-columns: minmax(190px, 0.7fr) minmax(300px, 1.3fr);
  border: 1px solid var(--vp-c-divider);
  background: #171a17;
}

.provider-card-code section + section {
  border-left: 1px solid #353a34;
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
  min-height: 150px;
  margin: 0;
  padding: 16px 14px;
  overflow: auto;
  background: transparent;
  color: #edf0e9;
  font: 400 9px/1.75 var(--vp-font-family-mono);
}

.provider-card-details > a {
  display: inline-block;
  margin-top: 20px;
  color: var(--vp-c-text-1);
  font-size: 12px;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 4px;
}

@media (max-width: 640px) {
  .provider-card-details {
    padding: 20px;
  }

  .provider-card-details > header,
  .provider-card-code {
    grid-template-columns: 1fr;
  }

  .provider-card-code section + section {
    border-top: 1px solid #353a34;
    border-left: 0;
  }

  .provider-card-code pre {
    min-height: auto;
    font-size: 8px;
  }
}
</style>
