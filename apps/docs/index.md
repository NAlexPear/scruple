---
layout: home
title: Code checks for problems linters miss
description: Catch valid code that breaks your team's standards with named, tested checks that run on every change.
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

  <HeroExamples />
</section>

<section class="landing-principles" aria-label="Scruple principles">
  <article>
    <span>01</span>
    <div><h2>Find the right code</h2><p>Rules inspect bounded parser targets and can ask the provider to resolve ambiguous candidates.</p></div>
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
      <p>Catch valid code that breaks a written standard.</p>
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
