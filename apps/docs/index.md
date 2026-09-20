---
layout: home
title: Semantic code checks
---

<section class="landing-splash" aria-labelledby="landing-title">
  <div class="landing-mark" aria-hidden="true">
    <img class="landing-mark-light" src="/assets/scruple-mark.png" alt="">
    <img class="landing-mark-dark" src="/assets/scruple-mark-inverse.png" alt="">
  </div>
  <div class="landing-copy">
    <p class="landing-kicker"><span></span>Semantic checks for code that compiles</p>
    <h1 id="landing-title">Ground every<br>judgment in <em>evidence.</em></h1>
    <p>
      Scruple asks narrow, typed questions about your code, then turns high-confidence answers
      into stable diagnostics your team can trust.
    </p>
    <div class="landing-actions">
      <a class="landing-primary" href="/guide/quickstart">Get started <span>→</span></a>
      <a class="landing-secondary" href="/guide/introduction">Read the docs</a>
    </div>
  </div>

  <div class="landing-example" role="img" aria-label="A Scruple diagnostic example">
    <div class="landing-window-bar">
      <div class="landing-window-dots"><i></i><i></i><i></i></div>
      <span>src/cache.ts</span>
      <span class="landing-window-state">01 finding</span>
    </div>
    <pre class="landing-source"><span class="landing-line">1</span> <span class="landing-keyword">export async function</span> <span class="landing-function">warmCache</span>() {
<span class="landing-line">2</span>   <span class="landing-comment">// Set ready to true</span>
<span class="landing-line">3</span>   ready = <span class="landing-literal">true</span>;
<span class="landing-line">4</span> }
<span class="landing-line">5</span></pre>
    <div class="landing-diagnostic">
      <p class="landing-output-command"><span>$</span> pnpm exec scruple check src/cache.ts</p>
      <p class="landing-output-file">src/cache.ts</p>
      <p class="landing-output-line">
        <span class="landing-output-location">2:3</span>
        <span class="landing-output-severity">warning</span>
        <span>This comment appears to add no useful information. (96%)</span>
        <span class="landing-output-rule">comments/no-useless-comments</span>
      </p>
    </div>
    <span class="landing-tag landing-tag-one">focused excerpt</span>
    <span class="landing-tag landing-tag-two">typed answer</span>
  </div>
</section>

<section class="landing-principles" aria-label="Scruple principles">
  <article>
    <span>01</span>
    <div><h2>Focused evidence</h2><p>Rules receive bounded, normalized source context.</p></div>
  </article>
  <article>
    <span>02</span>
    <div><h2>Typed decisions</h2><p>Providers answer explicit schemas, not open-ended prompts.</p></div>
  </article>
  <article>
    <span>03</span>
    <div><h2>Stable diagnostics</h2><p>Plugins own every message and can abstain when evidence is weak.</p></div>
  </article>
</section>
