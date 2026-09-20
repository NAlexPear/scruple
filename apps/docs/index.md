---
layout: home
title: Code checks for problems linters miss
---

<section class="landing-splash" aria-labelledby="landing-title">
  <ScrupleMark class="landing-mark" extended />
  <div class="landing-copy">
    <p class="landing-kicker"><span></span>Code checks with judgment</p>
    <h1 id="landing-title">Make good taste<br><em>enforceable.</em></h1>
    <p>
      Scruple catches problems linters miss. Use its built-in rules or write your own to turn your
      team's engineering judgment into checks that run on every change.
    </p>
    <div class="landing-actions">
      <a class="landing-primary" href="/guide/quickstart">
        Get started
        <svg aria-hidden="true" viewBox="0 0 32 20">
          <path d="M1 10h29M22 2l8 8-8 8" />
        </svg>
      </a>
      <a class="landing-secondary" href="/guide/introduction">Read the docs</a>
    </div>
  </div>

  <div class="landing-example" role="img" aria-label="A Scruple diagnostic example">
    <div class="landing-window-bar">
      <div class="landing-window-dots"><i></i><i></i><i></i></div>
      <span>test/users.test.ts</span>
      <span class="landing-window-state">01 finding</span>
    </div>
    <pre class="landing-source"><span class="landing-line">1</span> <span class="landing-function">test</span>(<span class="landing-literal">"creates a persisted user"</span>, <span class="landing-keyword">async</span> () => {
<span class="landing-line">2</span>   <span class="landing-comment"><span class="landing-keyword">await</span> createUser({ name: <span class="landing-literal">"Ada"</span> });</span>
<span class="landing-line">3</span> });
<span class="landing-line">4</span></pre>
    <div class="landing-diagnostic">
      <p class="landing-output-command"><span>$</span> pnpm exec scruple test/users.test.ts</p>
      <p class="landing-output-file">test/users.test.ts</p>
      <p class="landing-output-line">
        <span class="landing-output-location">1:1</span>
        <span class="landing-output-severity">warning</span>
        <span>This test appears to have no effective verification of behavior. (96%)</span>
        <span class="landing-output-rule">tests/no-vacuous-tests</span>
      </p>
    </div>
    <span class="landing-tag landing-tag-one">relevant code only</span>
    <span class="landing-tag landing-tag-two">fixed warning</span>
  </div>
</section>

<section class="landing-principles" aria-label="Scruple principles">
  <article>
    <span>01</span>
    <div><h2>Find the right code</h2><p>The parser selects likely problems before calling a model.</p></div>
  </article>
  <article>
    <span>02</span>
    <div><h2>Apply a written standard</h2><p>Each rule asks one clear question with defined answers.</p></div>
  </article>
  <article>
    <span>03</span>
    <div><h2>Return a normal warning</h2><p>Rules control the message, severity, and source location.</p></div>
  </article>
</section>

<section class="landing-fit" aria-labelledby="landing-fit-title">
  <div class="landing-section-heading">
    <p class="landing-kicker"><span></span>Where Scruple fits</p>
    <h2 id="landing-fit-title">Static tools check facts.<br><em>Scruple checks judgment.</em></h2>
    <p>
      Keep fast checks close to your editor. Run Scruple after them in CI, before review, for
      questions that need more context than a syntax pattern can provide.
    </p>
  </div>
  <div class="landing-fit-grid">
    <article>
      <span>01 / Editor</span>
      <h3>Compiler and linter</h3>
      <p>Types, syntax, formatting, and known code patterns.</p>
    </article>
    <article class="landing-fit-scruple">
      <span>02 / CI</span>
      <h3>Scruple</h3>
      <p>Tests, errors, retries, contracts, comments, and your own standards.</p>
    </article>
    <article>
      <span>03 / Review</span>
      <h3>People</h3>
      <p>Architecture, product intent, and standards that still need discussion.</p>
    </article>
  </div>
  <p class="landing-fit-note">
    Scruple is MIT licensed. Use hosted Jev and pay for model usage, or run Laya on your own
    hardware. It complements linters and security scanners rather than replacing them.
  </p>
</section>

<section class="landing-taste" aria-labelledby="landing-taste-title">
  <div class="landing-taste-copy">
    <p class="landing-kicker"><span></span>Custom rules</p>
    <h2 id="landing-taste-title">Put your team's taste<br>in the repository.</h2>
    <p>
      Every team has standards that live in review comments. Scruple turns those repeated comments
      into named, tested rules that run the same way on every change.
    </p>
    <a href="/guide/writing-a-plugin">
      Write a rule
      <svg aria-hidden="true" viewBox="0 0 32 20">
        <path d="M1 10h29M22 2l8 8-8 8" />
      </svg>
    </a>
  </div>
  <div class="landing-review-notes" aria-label="Examples of review comments suited to Scruple rules">
    <p><span>errors</span>“We preserve the original error here.”</p>
    <p><span>tests</span>“This test does not prove the behavior.”</p>
    <p><span>resources</span>“Retries need a deadline.”</p>
    <p><span>comments</span>“Explain why, not what.”</p>
    <blockquote>
      If a review comment starts with “we usually,” it may belong in a Scruple rule.
    </blockquote>
  </div>
</section>

<section class="landing-closing" aria-labelledby="landing-closing-title">
  <p class="landing-kicker"><span></span>Start with built-in rules</p>
  <h2 id="landing-closing-title">Spend review time on decisions<br>that are still worth discussing.</h2>
  <div class="landing-actions">
    <a class="landing-primary" href="/guide/quickstart">
      Get started
      <svg aria-hidden="true" viewBox="0 0 32 20">
        <path d="M1 10h29M22 2l8 8-8 8" />
      </svg>
    </a>
    <a class="landing-secondary" href="/plugins/">Browse the rules</a>
  </div>
</section>
