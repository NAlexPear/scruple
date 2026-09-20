export interface PlaygroundFixture {
  id: string;
  label: string;
  outcome: "finding" | "safe" | "ambiguous";
  filename: string;
  source: string;
  expectedChoice: string;
}

export interface PlaygroundState {
  version: 1;
  ruleName: string;
  ruleSource: string;
  fixtures: PlaygroundFixture[];
  selectedFixtureId: string;
}

export const encodePlaygroundState = async (state: PlaygroundState): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  const compressed = await transform(bytes, "gzip", "compress");
  return toBase64Url(compressed);
};

export const decodePlaygroundState = async (encoded: string): Promise<PlaygroundState> => {
  const compressed = fromBase64Url(encoded);
  const bytes = await transform(compressed, "gzip", "decompress");
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isPlaygroundState(value)) {
    throw new Error("The shared playground state is invalid.");
  }
  return value;
};

const transform = async (
  bytes: Uint8Array,
  format: CompressionFormat,
  operation: "compress" | "decompress",
): Promise<Uint8Array> => {
  const stream =
    operation === "compress" ? new CompressionStream(format) : new DecompressionStream(format);
  const copy = new Uint8Array(bytes);
  const body = new Blob([copy.buffer]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
};

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const fromBase64Url = (value: string): Uint8Array => {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.codePointAt(0) ?? 0);
};

const isPlaygroundState = (value: unknown): value is PlaygroundState => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const state = value as Partial<PlaygroundState>;
  return (
    state.version === 1 &&
    typeof state.ruleName === "string" &&
    typeof state.ruleSource === "string" &&
    typeof state.selectedFixtureId === "string" &&
    Array.isArray(state.fixtures) &&
    state.fixtures.every(isFixture)
  );
};

const isFixture = (value: unknown): value is PlaygroundFixture => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const fixture = value as Partial<PlaygroundFixture>;
  return (
    typeof fixture.id === "string" &&
    typeof fixture.label === "string" &&
    (fixture.outcome === "finding" ||
      fixture.outcome === "safe" ||
      fixture.outcome === "ambiguous") &&
    typeof fixture.filename === "string" &&
    typeof fixture.source === "string" &&
    typeof fixture.expectedChoice === "string"
  );
};
