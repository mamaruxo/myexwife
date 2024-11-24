/* eslint-disable node/no-process-env */
import * as Sentry from "@sentry/node";
import { parseEnv, z } from "znv";

const isDev = process.env["NODE_ENV"] !== "production";

if (isDev) {
  require("dotenv").config();
}

export const { DATA_DIR, MASTODON_TOKEN, BSKY_USERNAME, BSKY_PASSWORD, SENTRY_DSN } = parseEnv(
  process.env,
  {
    DATA_DIR: {
      schema: z.string().min(1),
      defaults: { development: "persist" },
    },
    MASTODON_TOKEN: {
      schema: z.string().min(1),
      defaults: { development: "_" },
    },
    BSKY_USERNAME: {
      schema: z.string().min(1),
      defaults: { development: "_" },
    },
    BSKY_PASSWORD: {
      schema: z.string().min(1),
      defaults: { development: "_" },
    },
    SENTRY_DSN: {
      schema: z.string().min(1).optional(),
    },
  },
);

/** account to which to toot images with a random caption from a different article. */
export const MASTODON_SERVER = "https://mastodon.social";

if (!SENTRY_DSN && !isDev) {
  console.warn(`Sentry DSN is invalid! Error reporting to Sentry will be disabled.`);
} else {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: isDev ? "dev" : "prod",
    integrations: [
      Sentry.captureConsoleIntegration({
        levels: ["warn", "error", "debug", "assert"],
      }),
    ],
  });
}
