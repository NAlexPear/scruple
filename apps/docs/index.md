---
layout: home

hero:
  name: Scruple
  text: Ground every judgment in evidence.
  tagline: Semantic checks for code that compiles, but may still be risky, unclear, or inconsistent.
  image:
    src: /assets/scruple-mark.png
    alt: Scruple
  actions:
    - theme: brand
      text: Get started
      link: /guide/quickstart
    - theme: alt
      text: Read the docs
      link: /guide/introduction

features:
  - title: Focused evidence
    details: Rules send bounded, normalized source context instead of entire repositories or syntax trees.
  - title: Typed decisions
    details: Providers answer explicit schemas. They do not invent diagnostics, fixes, or policy.
  - title: Stable diagnostics
    details: Plugins own messages and thresholds, and can abstain when the evidence is not strong enough.
---

<section class="home-example" aria-labelledby="example-title">
  <div class="home-example-copy">
    <p class="example-kicker">A focused question. A stable diagnostic.</p>
    <h2 id="example-title">Find what compilers cannot.</h2>
    <p>
      Scruple gives a provider bounded source evidence and a typed question. The rule, not the
      model, owns the final message and severity.
    </p>
    <a href="/guide/introduction">See how decisions work <span>→</span></a>
  </div>
  <div class="example-window" aria-label="Example Scruple diagnostic">
    <div class="example-toolbar"><span>src/cache.ts</span><b>1 finding</b></div>
    <pre><span class="line-number">1</span> <span class="keyword">export async function</span> warmCache() {
<span class="line-number">2</span>   <span class="comment">// Set ready to true</span>
<span class="line-number">3</span>   ready = <span class="literal">true</span>;
<span class="line-number">4</span> }</pre>
    <div class="example-diagnostic">
      <div><strong>!</strong><b>Comment restates the code</b><span>warning</span></div>
      <p>Remove it, or explain why the cache must be marked ready here.</p>
      <code>comments/no-useless-comments</code>
    </div>
  </div>
</section>
