---
layout: home
title: Code checks for problems linters miss
description: A language-agnostic engine for semantic code checks, with blessed language-specific parsers, typed decision providers, and rules your team owns.
---

<section class="landing-splash" aria-labelledby="landing-title">
  <ScrupleMark class="landing-mark" extended />
  <div class="landing-copy">
      <p class="landing-kicker"><span></span>Language-agnostic code checks</p>
      <h1 id="landing-title">Make good taste<br><em>enforceable.</em></h1>
      <p>
        Scruple turns engineering judgment into testable code checks. Combine blessed
        language-specific parsers, typed decision providers, and rules your team owns.
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

  <HeroExamples />
</section>

<section class="landing-principles" aria-label="Scruple principles">
  <article>
    <span>01</span>
    <div><h2>Parse each language</h2><p>Language-specific parsers own file patterns and expose bounded source targets through a shared interface.</p></div>
  </article>
  <article>
    <span>02</span>
    <div><h2>Own your standards</h2><p>Downstream rules declare language applicability, select evidence, and ask narrow questions with defined answers.</p></div>
  </article>
  <article>
    <span>03</span>
    <div><h2>Test the judgment</h2><p>Authoring skills and eval tooling help you test rule-owned diagnostics against representative code.</p></div>
  </article>
</section>

<section class="landing-fit" aria-labelledby="landing-fit-title">
  <div class="landing-section-heading">
    <p class="landing-kicker"><span></span>Where Scruple fits</p>
    <h2 id="landing-fit-title">Different tools catch<br>different problems.</h2>
  </div>
  <div class="landing-fit-grid">
    <article class="landing-fit-static">
      <h3>Compiler and linter</h3>
      <p>Catch errors the code can prove.</p>
      <div class="landing-fit-demo" aria-label="A compiler catches a string assigned to a number">
        <span class="landing-fit-file">settings.ts</span>
        <pre><code><span class="landing-fit-keyword">const</span> seats: number = <mark>"12"</mark>;</code></pre>
        <p class="landing-fit-result">
          <span>Type error</span>
          String is not assignable to number.
        </p>
      </div>
    </article>
    <article class="landing-fit-scruple">
      <h3>Scruple</h3>
      <p>Your rules catch valid code that breaks a written standard.</p>
      <div class="landing-fit-demo" aria-label="Scruple catches a test with no effective verification">
        <span class="landing-fit-file">users.test.ts</span>
        <pre><code><span class="landing-fit-function">test</span>("creates a user", <span class="landing-fit-keyword">async</span> () =&gt; {
  <mark><span class="landing-fit-keyword">await</span> createUser();</mark>
});</code></pre>
        <p class="landing-fit-result">
          <span>Scruple warning</span>
          This test does not verify behavior.
        </p>
      </div>
    </article>
    <article class="landing-fit-reviewers">
      <h3>Reviewers</h3>
      <p>Catch choices that depend on context outside the file.</p>
      <div class="landing-fit-demo" aria-label="A reviewer catches a rollout that conflicts with the launch plan">
        <span class="landing-fit-file">checkout.ts</span>
        <pre><code><span class="landing-fit-keyword">export const</span> checkoutRollout = <mark>100</mark>;</code></pre>
        <p class="landing-fit-result">
          <span>Review comment</span>
          The launch plan starts at 5%, not 100%.
        </p>
      </div>
    </article>
  </div>
</section>

<section class="landing-providers" aria-labelledby="landing-providers-title">
  <div class="landing-providers-copy">
    <p class="landing-kicker"><span></span>AI decision models</p>
    <h2 id="landing-providers-title">Use AI for one narrow<br>decision at a time.</h2>
    <p>
      Scruple does not ask a chatbot to review your repository. A rule can ask whether a bounded
      target is relevant, then sends each selected candidate with one fixed decision question.
    </p>
  </div>
  <ProviderOptions />
</section>

<section class="landing-taste" aria-labelledby="landing-taste-title">
  <div class="landing-taste-copy">
    <p class="landing-kicker"><span></span>Your languages. Your rules.</p>
    <h2 id="landing-taste-title">Put your team's taste<br>in the repository.</h2>
    <p>
      Scruple maintains the core interfaces, blessed parsers, providers, authoring/testing skills,
      and eval tooling. Downstream authors maintain language and framework rules—not Scruple.
    </p>
    <p>
      First-party rule packs are being retired into unsupported examples and test implementations.
      A shared engine does not make a rule correct for every language: declare its scope and test it.
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
  <p class="landing-kicker"><span></span>Start with your own standard</p>
  <h2 id="landing-closing-title">Spend review time on decisions<br>that are still worth discussing.</h2>
  <div class="landing-actions">
    <a class="landing-primary" href="/guide/quickstart">
      Get started
      <svg aria-hidden="true" viewBox="0 0 32 20">
        <path d="M1 10h29M22 2l8 8-8 8" />
      </svg>
    </a>
    <a class="landing-secondary" href="/guide/writing-a-plugin">Write a rule</a>
  </div>
</section>
