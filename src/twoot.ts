import { createReadStream } from "fs";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
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

type Status =
  | string
  | {
      status: string;
      pathToMedia: string;
    }
  | {
      status: string;
      media: Buffer;
    };

export async function doTwoot(statuses: Status[]) {
  const [masto, twitter] = await Promise.allSettled([doToot(statuses), doTweet(statuses)]);

  if (masto.status === "rejected") {
    console.error("Error posting to Mastodon:\n", masto.reason);
  }
  if (twitter.status === "rejected") {
    console.error("Error posting to Twitter:\n", twitter.reason);
  }

  return { masto, twitter };
}

export async function doToot(statuses: Status[]): Promise<void> {
  const masto = await retry(() =>
    login({
      url: MASTODON_SERVER,
      accessToken: MASTODON_TOKEN,
    })
  );

  let inReplyToId: string | null | undefined = null;

  let i = 0;
  /* eslint-disable no-await-in-loop */
  for (const s of statuses) {
    const { status } = typeof s === "string" ? { status: s } : s;

    let mediaId: string | null = null;
    if (typeof s === "object") {
      if ("media" in s) {
        // kludge: buffer uploads don't seem to work, so write them to a temp file first.
        const path = join(tmpdir(), `masto-upload-${Date.now()}.png`);
        await writeFile(path, s.media);

        const { id } = await masto.mediaAttachments.create({
          file: createReadStream(path),
          description: status,
        });

        await unlink(path);

        mediaId = id;
      } else {
        const { id } = await masto.mediaAttachments.create({
          file: createReadStream(s.pathToMedia),
          description: status,
        });

        mediaId = id;
      }
    }

    const idempotencyKey = uuid();

    const publishedToot = await retry(
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      () =>
        masto.statuses.create(
          {
            status: status,
            visibility: "public",
            inReplyToId,
            mediaIds: mediaId ? [mediaId] : undefined,
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
      await setTimeout(3000);
    }
  }
  /* eslint-enable no-await-in-loop */
}

export async function doTweet(statuses: Status[]): Promise<void> {
  const twitterClient = new TwitterClient({
    apiKey: TWITTER_CONSUMER_KEY,
    apiSecret: TWITTER_CONSUMER_SECRET,
    accessToken: TWITTER_ACCESS_KEY,
    accessTokenSecret: TWITTER_ACCESS_SECRET,
  });

  let inReplyToId: string | undefined = undefined;

  let i = 0;
  for (const s of statuses) {
    const status = typeof s === "string" ? s : s.status;

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
