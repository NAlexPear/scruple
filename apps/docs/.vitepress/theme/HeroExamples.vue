<script setup lang="ts">
import { computed, ref } from "vue";

const examples = [
  {
    id: "resources",
    label: "Resources",
    filename: "src/report.ts",
    location: "1:8",
    message: "Ensure this resource is cleaned up when work fails. (96%)",
    rule: "resources/require-cleanup-on-failure",
  },
  {
    id: "security",
    label: "Security",
    filename: "src/admin-report.ts",
    location: "1:8",
    message:
      "This function appears to trust user-controlled data for an authorization decision. (97%)",
    rule: "security/no-user-controlled-authorization",
  },
  {
    id: "database",
    label: "Database",
    filename: "src/users.ts",
    location: "1:8",
    message:
      "This database operation appears to escape the active transaction; use its transaction-scoped client. (95%)",
    rule: "relational-databases/require-transaction-scoped-client",
  },
] as const;

type ExampleId = (typeof examples)[number]["id"];

const selected = ref<ExampleId>("resources");
const example = computed(() => examples.find(({ id }) => id === selected.value) ?? examples[0]);
</script>

<template>
  <div class="landing-example" aria-label="Scruple diagnostic examples">
    <div class="landing-example-select" role="group" aria-label="Choose an example">
      <button
        v-for="option in examples"
        :key="option.id"
        type="button"
        :aria-pressed="selected === option.id"
        @click="selected = option.id"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="landing-window-bar">
      <div class="landing-window-dots"><i></i><i></i><i></i></div>
      <span>{{ example.filename }}</span>
      <span class="landing-window-state">01 finding</span>
    </div>

    <pre
      v-if="selected === 'resources'"
      class="landing-source"
    ><span class="landing-line">1</span> <span class="landing-keyword">export async function</span> <span class="landing-function">parseReport</span>() {
<span class="landing-line">2</span>   <span class="landing-keyword">const</span> file = <span class="landing-keyword">await</span> <span class="landing-function">open</span>(<span class="landing-literal">"report.txt"</span>);
<span class="landing-line">3</span>   <span class="landing-keyword">const</span> report = <span class="landing-risk">parse(<span class="landing-keyword">await</span> file.readFile(<span class="landing-literal">"utf8"</span>))</span>;
<span class="landing-line">4</span>   <span class="landing-keyword">await</span> file.close();
<span class="landing-line">5</span>   <span class="landing-keyword">return</span> report;
<span class="landing-line">6</span> }</pre>

    <pre
      v-else-if="selected === 'security'"
      class="landing-source"
    ><span class="landing-line">1</span> <span class="landing-keyword">export async function</span> <span class="landing-function">adminReport</span>(req: Request) {
<span class="landing-line">2</span>   <span class="landing-keyword">if</span> (<span class="landing-risk">req.body.role</span> !== <span class="landing-literal">"admin"</span>) {
<span class="landing-line">3</span>     <span class="landing-keyword">throw new</span> ForbiddenError();
<span class="landing-line">4</span>   }
<span class="landing-line">5</span>   <span class="landing-keyword">return</span> reports.loadAdminReport();
<span class="landing-line">6</span> }</pre>

    <pre
      v-else
      class="landing-source"
    ><span class="landing-line">1</span> <span class="landing-keyword">export async function</span> <span class="landing-function">save</span>(data) {
<span class="landing-line">2</span>   <span class="landing-keyword">return</span> prisma.$transaction(<span class="landing-keyword">async</span> (tx) =&gt; {
<span class="landing-line">3</span>     <span class="landing-keyword">await</span> tx.user.create({ data });
<span class="landing-line">4</span>     <span class="landing-keyword">await</span> <span class="landing-risk">prisma.audit.create({ data })</span>;
<span class="landing-line">5</span>   });
<span class="landing-line">6</span> }</pre>

    <div class="landing-diagnostic" aria-live="polite">
      <p class="landing-output-command"><span>$</span> pnpm exec scruple {{ example.filename }}</p>
      <p class="landing-output-file">{{ example.filename }}</p>
      <p class="landing-output-line">
        <span class="landing-output-location">{{ example.location }}</span>
        <span class="landing-output-severity">warning</span>
        <span>{{ example.message }}</span>
        <span class="landing-output-rule">{{ example.rule }}</span>
      </p>
    </div>

    <span class="landing-tag landing-tag-one">relevant code only</span>
    <span class="landing-tag landing-tag-two">fixed warning</span>
  </div>
</template>
