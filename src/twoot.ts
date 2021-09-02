import { setTimeout } from "timers/promises";

import { login } from "masto";
import { TwitterClient } from "twitter-api-client";
import retry from "async-retry";
import { v4 as uuid } from "uuid";

import {
  MASTODON_SERVER,
  MASTODON_TOKEN,
  TWITTER_ACCESS_KEY,
  TWITTER_ACCESS_SECRET,
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
} from "./env";

export async function doTwoot(statuses: string[]): Promise<{ twitter: boolean; masto: boolean }> {
  const results = await Promise.allSettled([doToot(statuses), doTweet(statuses)]);

  const [masto, twitter] = results.map((res) => res.status === "fulfilled");

  return { masto, twitter };
}

export async function doToot(statuses: string[]): Promise<void> {
  const masto = await retry(() =>
    login({
      url: MASTODON_SERVER,
      accessToken: MASTODON_TOKEN,
    })
  );

  let inReplyToId: string | null | undefined = null;

  let i = 0;
  for (const status of statuses) {
    const idempotencyKey = uuid();

    // eslint-disable-next-line no-await-in-loop
    const publishedToot = await retry(
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      () =>
        masto.statuses.create(
          {
            status,
            visibility: "public",
            inReplyToId,
          },
          idempotencyKey
        ),
      { retries: 5 }
    );

    inReplyToId = publishedToot.id;

    console.log("======\n", status);
    console.log(`${publishedToot.createdAt} -> ${publishedToot.uri}\n======`);

    i++;
    if (i < statuses.length) {
      // eslint-disable-next-line no-await-in-loop
      await setTimeout(3000);
    }
  }
}

export async function doTweet(statuses: string[]): Promise<void> {
  const twitterClient = new TwitterClient({
    apiKey: TWITTER_CONSUMER_KEY,
    apiSecret: TWITTER_CONSUMER_SECRET,
    accessToken: TWITTER_ACCESS_KEY,
    accessTokenSecret: TWITTER_ACCESS_SECRET,
  });

  let inReplyToId: string | undefined = undefined;

  let i = 0;
  for (const status of statuses) {
    // eslint-disable-next-line no-await-in-loop
    const publishedTweet = await retry(
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      () =>
        twitterClient.tweets.statusesUpdate({
          status,
          in_reply_to_status_id: inReplyToId,
          auto_populate_reply_metadata: true,
        }),
      { retries: 5 }
    );

    inReplyToId = publishedTweet.id_str;

    console.log("======\n", status);
    console.log(
      [
        `${publishedTweet.created_at} -> `,
        `https://twitter.com/${publishedTweet.user.screen_name}/status/${publishedTweet.id_str}\n======`,
      ].join("")
    );

    i++;
    if (i < statuses.length) {
      // eslint-disable-next-line no-await-in-loop
      await setTimeout(3000);
    }
  }
}
