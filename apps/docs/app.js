import { filterRules, setupContent } from "./logic.js";

const setupState = { step: "install", provider: "jev" };
const traceData = {
  comment: {
    source: `<span class="muted">1</span> <span class="kw">if</span> (result.ok) {\n<span class="muted">2</span>   <mark>// Set valid to true</mark>\n<span class="muted">3</span>   valid = <span class="bool">true</span>;\n<span class="muted">4</span> }`,
    question: "Does this comment add rationale, constraints, warnings, or context beyond the code?",
    answerLabel: "adds_information",
    answer: "false · 0.98",
    title: "Diagnostic emitted",
    description:
      "The answer clears the configured threshold. The rule emits its own stable message.",
    rule: "comments/no-useless-comments",
    icon: "!",
    abstain: false,
  },
  test: {
    source: `<span class="muted">1</span> test(<span class="str">"saves user"</span>, <span class="kw">async</span> () => {\n<span class="muted">2</span>   <mark>await saveUser(user);</mark>\n<span class="muted">3</span> });`,
    question:
      "Does this test meaningfully verify observable behavior rather than only execute code?",
    answerLabel: "meaningful_assertion",
    answer: "false · 0.96",
    title: "Diagnostic emitted",
    description: "The test has no meaningful assertion, so the rule emits a deterministic finding.",
    rule: "tests/no-vacuous-tests",
    icon: "!",
    abstain: false,
  },
  abstain: {
    source: `<span class="muted">1</span> <span class="kw">const</span> rows = await source.load();\n<span class="muted">2</span> <span class="kw">return</span> <mark>mergeLocal(rows, owners)</mark>;`,
    question:
      "Could this in-memory join reasonably be performed by an available relational database layer?",
    answerLabel: "database_capable",
    answer: "unknown · 0.54",
    title: "No diagnostic",
    description:
      "The evidence does not establish data provenance or database capability. Scruple abstains.",
    rule: "relational-databases/prefer-database-join",
    icon: "—",
    abstain: true,
  },
};

const renderSetup = () => {
  const content = setupContent(setupState.step, setupState.provider);
  document.querySelector("#step-kicker").textContent = content.kicker;
  document.querySelector("#step-title").textContent = content.title;
  document.querySelector("#step-description").textContent = content.description;
  document.querySelector("#code-filename").textContent = content.filename;
  document.querySelector("#setup-code").textContent = content.code;
  document.querySelector("#provider-choices").hidden = setupState.step === "run";
};

document.querySelectorAll(".setup-tab").forEach((button) => {
  button.addEventListener("click", () => {
    setupState.step = button.dataset.step;
    document.querySelectorAll(".setup-tab").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    renderSetup();
  });
});

document.querySelectorAll(".choice").forEach((button) => {
  button.addEventListener("click", () => {
    setupState.provider = button.dataset.provider;
    document
      .querySelectorAll(".choice")
      .forEach((choice) => choice.classList.toggle("active", choice === button));
    renderSetup();
  });
});

const toast = document.querySelector("#toast");
document.querySelectorAll(".copy-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const text = document.querySelector(`#${button.dataset.copyTarget}`).textContent;
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
    toast.classList.add("visible");
    window.setTimeout(() => {
      button.textContent = "Copy";
      toast.classList.remove("visible");
    }, 1600);
  });
});

const renderTrace = (name) => {
  const trace = traceData[name];
  document.querySelector("#trace-source").innerHTML = trace.source;
  document.querySelector("#trace-question").textContent = trace.question;
  document.querySelector("#trace-answer-label").textContent = trace.answerLabel;
  document.querySelector("#trace-answer").textContent = trace.answer;
  document.querySelector("#outcome-title").textContent = trace.title;
  document.querySelector("#outcome-description").textContent = trace.description;
  document.querySelector("#outcome-rule").textContent = trace.rule;
  document.querySelector("#outcome-icon").textContent = trace.icon;
  document.querySelector("#outcome-stage").classList.toggle("abstained", trace.abstain);
};

document.querySelectorAll(".trace-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".trace-option").forEach((option) => {
      const active = option === button;
      option.classList.toggle("active", active);
      option.setAttribute("aria-selected", String(active));
    });
    renderTrace(button.dataset.trace);
  });
});

const ruleList = document.querySelector("#rule-list");
const ruleSearch = document.querySelector("#rule-search");
let activeFilter = "all";

const renderRules = () => {
  const visibleRules = filterRules(ruleSearch.value, activeFilter);
  ruleList.innerHTML = visibleRules
    .map(
      (rule, index) => `
    <article class="rule-row">
      <span class="rule-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="category-dot ${rule.category}"></span>
      <div><code>${rule.id}</code><h3>${rule.title}</h3></div>
      <p>${rule.description}</p>
      <a href="https://github.com/NAlexPear/scruple" aria-label="View ${rule.title} source">↗</a>
    </article>`,
    )
    .join("");
  document.querySelector("#empty-state").hidden = visibleRules.length > 0;
};

ruleSearch.addEventListener("input", renderRules);
document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document
      .querySelectorAll(".filter")
      .forEach((filter) => filter.classList.toggle("active", filter === button));
    renderRules();
  });
});

const searchItems = [
  { title: "Quickstart", detail: "Install, configure, and run Scruple", href: "#guide" },
  { title: "Decision trace", detail: "See evidence become a diagnostic", href: "#trace" },
  { title: "Rule catalog", detail: "Browse the example policy packs", href: "#rules" },
  {
    title: "Architecture",
    detail: "Parser, provider, and plugin contracts",
    href: "#architecture",
  },
  { title: "Jev provider", detail: "Hosted typed decisions", href: "#guide" },
  { title: "Laya provider", detail: "Local persistent decision process", href: "#guide" },
];
const dialog = document.querySelector("#search-dialog");
const docsSearch = document.querySelector("#docs-search");

const renderSearch = () => {
  const query = docsSearch.value.toLowerCase();
  const matches = searchItems.filter((item) =>
    `${item.title} ${item.detail}`.toLowerCase().includes(query),
  );
  document.querySelector("#search-results").innerHTML =
    matches
      .map(
        (item) =>
          `<a href="${item.href}"><span><strong>${item.title}</strong><small>${item.detail}</small></span><b>↵</b></a>`,
      )
      .join("") || `<p class="no-search-results">No documentation found.</p>`;
  document.querySelectorAll("#search-results a").forEach((link) => {
    link.addEventListener("click", () => dialog.close());
  });
};

document.querySelector(".search-trigger").addEventListener("click", () => {
  dialog.showModal();
  docsSearch.focus();
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    dialog.showModal();
    docsSearch.focus();
  }
});
docsSearch.addEventListener("input", renderSearch);
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    dialog.close();
  }
});

renderSetup();
renderTrace("comment");
renderRules();
renderSearch();
