import type { DecisionProvider } from "@scruple/core";
import { cloudflareProvider, type CloudflareModel } from "@scruple/provider-cloudflare";

export interface CloudflareEvaluationProviderOptions {
  baseURL?: string;
  concurrency?: number;
}

export const createCloudflareProvider = (
  model: string,
  options: CloudflareEvaluationProviderOptions = {},
): DecisionProvider => {
  if (model !== "clef" && model !== "clef-flash") {
    throw new Error('Cloudflare benchmark model must be either "clef" or "clef-flash"');
  }
  const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
  const apiToken = process.env["CLOUDFLARE_API_TOKEN"];
  if (accountId === undefined || accountId.length === 0) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required for Cloudflare benchmarks");
  }
  if (apiToken === undefined || apiToken.length === 0) {
    throw new Error("CLOUDFLARE_API_TOKEN is required for Cloudflare benchmarks");
  }
  return cloudflareProvider({
    accountId,
    apiToken,
    model: model satisfies CloudflareModel,
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });
};
