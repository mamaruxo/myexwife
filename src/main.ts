import { tmpdir } from "os";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { strict as assert } from "assert";
import { parseArgs } from "util";

import { close as flushSentry } from "@sentry/node";
import { distance as levDistance, closest as levClosest } from "fastest-levenshtein";

import { replace } from "./replace";

import { DATA_DIR } from "./env";
import { scrape, type OnPageReady } from "./scrape";
import { fetchAndParse, type NewsItem } from "./fetch-and-parse";
import { postStatus } from "./twoot";

const MAX_NEWS_ITEMS_PER_RUN = 1;

/**
 * percentage of difference required for item to not be filtered as duplicate.
 * (0 = identical, 1+ = completely different)
 */
const DIFFERENCE_THRESHOLD = 0.45;

const TWO_WEEKS = 1000 * 60 * 60 * 24 * 14;

const defaultOldestAllowableDate = Date.now() - TWO_WEEKS;

const localDir = () => {
  const dir = join(tmpdir(), `bot-${Date.now()}`);
  mkdirSync(dir);
  return dir;
};

const { values } = parseArgs({
  options: {
    // run locally, save images instead of posting to accounts
    local: { type: "boolean" },
    // run locally, only list parsed feeds
    list: { type: "boolean" },
    // don't parse feeds, scrape specific urls
    url: { type: "string", multiple: true, short: "u" },
  },
});

if (values.list) {
  console.log("[running local list-only mode]");

  fetchAndParse()
    .then((items) => {
      for (const { title, date, link } of items) {
        console.log(`${title}\n(${replace(title)})\n${date.toISOString()}\n${link}\n`);
      }

      console.log("done.");
      process.exit(0);
    })
    .catch((e: unknown) => {
      throw e;
    });
} else if (values.url?.length) {
  console.log("[running in local screenshot mode (specific urls)]");

  const items: NewsItem[] = values.url.map((u, i) => ({
    title: "unknown",
    link: u,
    date: new Date(),
    guid: String(i),
  }));

  (async () => {
    const res = await scrape(items, async ({ page, title, link, date, guid }) => {
      const path = join(localDir(), `${guid}.png`);
      await page.screenshot({ path });
      console.log(
        `${title}\n(${replace(title)})\n${date.toISOString()}\n${link}\nfile://${path}\n`,
      );
    });
    console.log(`done. timeouts: ${res.timeouts}`);
  })().catch((e: unknown) => {
    throw e;
  });
} else {
  const localPath = values.local ? localDir() : null;
  if (localPath) {
    console.log("[running in local screenshot mode]");
  } else {
    console.log("[running in production mode]");
  }

  const done: [date: number, title: string][] = JSON.parse(
    readFileSync(join(DATA_DIR, "done.json"), "utf8"),
  );
  assert(Array.isArray(done), "expected done.json to be an array");
  const doneTitles: string[] = [];
  for (const [date, title] of done) {
    assert(
      typeof date === "number" && typeof title === "string",
      `expected done.json to contain [date: number, url: string] tuples, received [${date}, ${title}]`,
    );
    doneTitles.push(title);
  }

  const manualDateLimit = JSON.parse(readFileSync("data/no-older-than", "utf8"));
  assert(
    typeof manualDateLimit === "number" && !Number.isNaN(manualDateLimit),
    "expected no-older-than file to be a number",
  );

  const oldestAllowableDate = Math.max(manualDateLimit, defaultOldestAllowableDate);

  let i = 0;

  const onPageReady: OnPageReady = localPath
    ? async ({ page, title, link, date }) => {
        const path = join(localPath, `${i}.png`);
        await page.screenshot({ path });
        console.log(
          `${title}\n(${replace(title)})\n${date.toISOString()}\n${link}\nfile://${path}\n`,
        );

        done.push([date.valueOf(), title]);
        i++;
        if (i >= MAX_NEWS_ITEMS_PER_RUN) return true;
      }
    : async ({ page, title, date }) => {
        const screenshot = (await page.screenshot()) as Buffer;
        const status = replace(title);
        await postStatus({ status, screenshot });
        done.push([date.valueOf(), title]);
        i++;
        if (i >= MAX_NEWS_ITEMS_PER_RUN) return true;
      };

  (async () => {
    const items = await fetchAndParse({
      filterItem: (item) => {
        // is a relevant term actually in the title of the article?
        if (!/china|chinese|xi|beijing/gi.test(item.title)) {
          return false;
        }
        if (item.date.valueOf() <= oldestAllowableDate) {
          return false;
        }

        // HACK: bad defs, returns undefined on empty array
        const closest = levClosest(item.title, doneTitles) as string | undefined;
        if (!closest) return true;

        const dist = levDistance(item.title, closest);

        const isSufficientlyDifferent = dist / item.title.length > DIFFERENCE_THRESHOLD;

        if (!isSufficientlyDifferent) {
          console.log(
            `discarding:\n${item.title}\nclosest existing title is:\n${closest}\n${((dist / item.title.length) * 100).toFixed(0)}% different (distance: ${dist}).\n`,
          );
        }

        return isSufficientlyDifferent;
      },
    });

    if (items.length === 0) {
      console.warn("no feed items remained after filtering. did not launch puppeteer.");
      await flushSentry(2000);
      process.exit(0);
    }

    const res = await scrape(items, onPageReady);

    console.log(`processed ${i} item${i === 1 ? "" : "s"}.`);

    if (res.timeouts > 0) {
      console.warn(`encountered ${res.timeouts} timeouts.`);
    }

    if (i === 0) {
      throw new Error("Wasn't able to process any items!");
    }

    done.sort((a, b) => a[0] - b[0]);
    while (done.length > 0 && done[0][0] < oldestAllowableDate) {
      done.shift();
    }

    writeFileSync(join(DATA_DIR, "done.json"), JSON.stringify(done, undefined, 2));

    await flushSentry(2000);

    console.log("done.");
    process.exit(0);
  })().catch((e: unknown) => {
    throw e;
  });
}
