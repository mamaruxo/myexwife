import { twoot } from "twoot";

import { MASTODON_SERVER, MASTODON_TOKEN, BSKY_USERNAME, BSKY_PASSWORD } from "./env.ts";

export async function postStatus({ status }: { status: string }) {
  const results = await twoot(
    {
      status,
      visibility: "unlisted",
    },
    [
      {
        type: "mastodon",
        server: MASTODON_SERVER,
        token: MASTODON_TOKEN,
      },
      {
        type: "bsky",
        username: BSKY_USERNAME,
        password: BSKY_PASSWORD,
      },
    ],
  );

  for (const res of results) {
    switch (res.type) {
      case "mastodon":
        console.log(`tooted at ${res.status.url}`);
        break;
      case "bsky":
        console.log(`skeeted at ${res.status.uri}`);
        break;
      case "error":
        console.error(`error while tooting:\n${res.message}`);
        break;
      default:
        console.error(`unexpected value:\n${JSON.stringify(res)}`);
    }
  }
}
