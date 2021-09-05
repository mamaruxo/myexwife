import * as envalid from "envalid";
import * as Sentry from "@sentry/node";
import { CaptureConsole } from "@sentry/integrations";

export const {
  MASTODON_SERVER,
  MASTODON_TOKEN,
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  TWITTER_ACCESS_KEY,
  TWITTER_ACCESS_SECRET,
  DATA_DIR,
  SENTRY_DSN,
  isDev,
} = envalid.cleanEnv(
  process.env,
  {
    MASTODON_SERVER: envalid.url({ default: "https://botsin.space" }),
    MASTODON_TOKEN: envalid.str(),
    TWITTER_CONSUMER_KEY: envalid.str(),
    TWITTER_CONSUMER_SECRET: envalid.str(),
    TWITTER_ACCESS_KEY: envalid.str(),
    TWITTER_ACCESS_SECRET: envalid.str(),
    DATA_DIR: envalid.str({ default: "persist" }),
    SENTRY_DSN: envalid.str({ default: "" }),
  },
  { strict: true }
);

if (SENTRY_DSN.length === 0) {
  console.warn(`Sentry DSN is invalid! Error reporting to sentry will be disabled.`);
} else {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: isDev ? "dev" : "prod",
    integrations: [new CaptureConsole({ levels: ["warn", "error", "debug", "assert"] })],
  });
}
