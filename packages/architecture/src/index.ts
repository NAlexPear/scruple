import { extname, posix } from "node:path";

import type {
  ModuleReference,
  ParsedDocument,
  RepositoryFinding,
  RepositoryRule,
  RuleFactory,
  ScruplePlugin,
} from "@scruple/core";
import { definePlugin } from "@scruple/core";
import picomatch from "picomatch";

export interface ArchitectureLayer {
  name: string;
  files: string[];
  allow?: string[];
}

export interface NoLayerViolationsOptions {
  layers: ArchitectureLayer[];
}

export type ArchitecturePlugin = ScruplePlugin<{
  "no-layer-violations": RuleFactory<NoLayerViolationsOptions, RepositoryRule>;
}>;

const moduleExtensions = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"];
const sourceExtensionForRuntimeExtension: Readonly<Record<string, string>> = {
  ".js": ".ts",
  ".jsx": ".tsx",
  ".mjs": ".mts",
  ".cjs": ".cts",
};

export const architecture = (): ArchitecturePlugin => {
  return definePlugin({ rules: { "no-layer-violations": noLayerViolations } });
};

const noLayerViolations = (options?: NoLayerViolationsOptions): RepositoryRule => {
  if (options === undefined || options.layers.length === 0) {
    throw new TypeError("layers must contain at least one layer");
  }
  const names = new Set<string>();
  for (const layer of options.layers) {
    if (layer.name.length === 0 || layer.files.length === 0) {
      throw new TypeError("each layer must have a name and at least one file pattern");
    }
    if (names.has(layer.name)) {
      throw new TypeError(`layer names must be unique: ${layer.name}`);
    }
    names.add(layer.name);
  }
  for (const layer of options.layers) {
    for (const allowed of layer.allow ?? []) {
      if (!names.has(allowed)) {
        throw new TypeError(`layer ${layer.name} allows unknown layer ${allowed}`);
      }
    }
  }

  const configuredLayers = options.layers.map((layer) => ({
    ...layer,
    matches: picomatch(layer.files),
    allowed: new Set(layer.allow ?? []),
  }));

  return {
    description: "Repository dependencies should follow configured layer boundaries.",
    check(documents) {
      const documentsByName = new Map(
        documents.map((document) => [normalizeFilename(document.filename), document]),
      );
      const layersByFilename = new Map<string, (typeof configuredLayers)[number]>();
      for (const filename of documentsByName.keys()) {
        const matching = configuredLayers.filter((layer) => layer.matches(filename));
        if (matching.length > 1) {
          throw new TypeError(
            `${filename} matches multiple architecture layers: ${matching.map((layer) => layer.name).join(", ")}`,
          );
        }
        const layer = matching[0];
        if (layer !== undefined) {
          layersByFilename.set(filename, layer);
        }
      }

      return documents.flatMap((document) =>
        checkDocument(document, documentsByName, layersByFilename),
      );
    },
  };
};

const checkDocument = (
  document: ParsedDocument,
  documentsByName: ReadonlyMap<string, ParsedDocument>,
  layersByFilename: ReadonlyMap<string, ConfiguredLayer>,
): RepositoryFinding[] => {
  const filename = normalizeFilename(document.filename);
  const sourceLayer = layersByFilename.get(filename);
  if (sourceLayer === undefined) {
    return [];
  }

  return document.moduleReferences.flatMap((reference) => {
    const targetFilename = resolveReference(filename, reference, documentsByName);
    if (targetFilename === undefined) {
      return [];
    }
    const targetLayer = layersByFilename.get(targetFilename);
    if (
      targetLayer === undefined ||
      targetLayer.name === sourceLayer.name ||
      sourceLayer.allowed.has(targetLayer.name)
    ) {
      return [];
    }
    return [
      {
        message: `Layer ${sourceLayer.name} must not depend on layer ${targetLayer.name}.`,
        filename: document.filename,
        location: reference.location,
      },
    ];
  });
};

type ConfiguredLayer = {
  name: string;
  allowed: ReadonlySet<string>;
};

const resolveReference = (
  importer: string,
  reference: ModuleReference,
  documentsByName: ReadonlyMap<string, ParsedDocument>,
): string | undefined => {
  if (!reference.specifier.startsWith(".")) {
    return undefined;
  }
  const unresolved = posix.normalize(posix.join(posix.dirname(importer), reference.specifier));
  return resolutionCandidates(unresolved).find((candidate) => documentsByName.has(candidate));
};

const resolutionCandidates = (unresolved: string): string[] => {
  const extension = extname(unresolved);
  if (extension.length > 0) {
    const sourceExtension = sourceExtensionForRuntimeExtension[extension];
    return sourceExtension === undefined
      ? [unresolved]
      : [unresolved, `${unresolved.slice(0, -extension.length)}${sourceExtension}`];
  }
  return [
    unresolved,
    ...moduleExtensions.map((candidate) => `${unresolved}${candidate}`),
    ...moduleExtensions.map((candidate) => `${unresolved}/index${candidate}`),
  ];
};

const normalizeFilename = (filename: string): string => {
  return posix.normalize(filename.replaceAll("\\", "/")).replace(/^\.\//u, "");
};
