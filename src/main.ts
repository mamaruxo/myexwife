require("source-map-support").install();
import { tmpdir } from "os";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { strict as assert } from "assert";
import { setTimeout } from "timers/promises";

import fetch from "node-fetch";
import Feedparser from "feedparser";
import { close as flushSentry } from "@sentry/node";

import puppeteerOrig from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { PuppeteerBlocker, fullLists } from "@cliqz/adblocker-puppeteer";

import { doTwoot } from "./twoot";
import { replace } from "./replace";
import { kickoffReplaceAndWatch } from "./userscript";

import { DATA_DIR } from "./env";

import type { Page } from "puppeteer";

const TWO_WEEKS = 1000 * 60 * 60 * 24 * 14;
const defaultOldestAllowableDate = Date.now() - TWO_WEEKS;

const sortOldestToNewest = (items: NewsItem[]) =>
  items.sort((a, b) => a.date.valueOf() - b.date.valueOf());

interface NewsItem {
  title: string;
  link: string;
  date: Date;
  guid: string;
}

async function fetchAndParse({
  filterItem = () => true,
  transformItems = sortOldestToNewest,
}: {
  filterItem?: (item: NewsItem) => boolean;
  transformItems?: (items: NewsItem[]) => NewsItem[];
} = {}) {
  const res = await fetch("https://news.google.com/rss/search?q=china");

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${res.statusText}`);
  }

  const parser = new Feedparser({ addmeta: false });
  res.body.pipe(parser);

  const items: NewsItem[] = [];

  let i = 0;
  for await (const { title, link, date, guid } of parser) {
    i++;
    const item = { title, link, date, guid };
    if (filterItem(item)) {
      items.push(item);
    }
  }

  console.log(`fetched ${i} items. after filtering: ${items.length}`);

  return transformItems(items);
}

async function main(
  filterItem: (item: NewsItem) => boolean,
  onPageReady: (params: { page: Page; title: string; link: string; date: Date }) => Promise<void>
) {
  puppeteer.use(StealthPlugin());

  const items = await fetchAndParse({ filterItem });

  if (items.length === 0) return;

  const [browser, blocker] = await Promise.all([
    // not sure how puppeteer-extra duplicated the typings but messed them up
    puppeteer.launch({ defaultViewport: { width: 1000, height: 800 } } as any),
    PuppeteerBlocker.fromLists(fetch, fullLists, { enableCompression: true }),
  ]);

  /* eslint-disable no-await-in-loop */
  for (const { title, link, date } of items) {
    console.log("visiting", link);

    const context = await browser.createIncognitoBrowserContext();
    try {
      const page = await context.newPage();
      await blocker.enableBlockingInPage(page);
      await page.goto(link);
      await page.evaluate(kickoffReplaceAndWatch);
      await setTimeout(10);
      await onPageReady({ page, title, link, date });
    } catch (e) {
      if (e instanceof puppeteerOrig.errors.TimeoutError) {
        console.error(`Timeout exceeded for page ${link} :\n`, e, "\n");
      } else {
        throw e;
      }
    } finally {
      await context.close();
    }
  }
  /* eslint-enable no-await-in-loop */

  await browser.close();
}

const argv = process.argv.slice(2);

if (argv.includes("list")) {
  console.log("[running local list-only mode]");

  void fetchAndParse().then((items) => {
    for (const { title, date, link } of items) {
      console.log(`${title}\n(${replace(title)})\n${date}\n${link}\n`);
    }

    console.log("done.");
    process.exit(0);
  });
} else {
  const localPath = argv.includes("local") ? join(tmpdir(), `bot-${Date.now()}`) : null;
  if (localPath) {
    mkdirSync(localPath);
    console.log("[running in local screenshot mode]");
  } else {
    console.log("[running in production mode]");
  }

  const done: [date: number, url: string][] = JSON.parse(
    readFileSync(join(DATA_DIR, "done.json"), "utf8")
  );
  assert(Array.isArray(done), "expected done.json to be an array");
  const doneSet = new Set<string>();
  for (const [date, url] of done) {
    assert(
      typeof date === "number" && typeof url === "string",
      `expected done.json to contain [date: number, url: string] tuples, received [${date}, ${url}]`
    );
    doneSet.add(url);
  }

  const manualDateLimit = JSON.parse(readFileSync("data/no-older-than", "utf8"));
  assert(
    typeof manualDateLimit === "number" && !Number.isNaN(manualDateLimit),
    "expected no-older-than file to be a number"
  );

  const oldestAllowableDate = Math.max(manualDateLimit, defaultOldestAllowableDate);

  let i = 0;

  const onPageReady: Parameters<typeof main>[1] = localPath
    ? async ({ page, title, link, date }) => {
        const path = join(localPath, `${i}.png`);
        await page.screenshot({ path });
        console.log(`${title}\n(${replace(title)})\n${date}\n${link}\nfile://${path}\n`);

        done.push([date.valueOf(), link]);
        i++;
      }
    : async ({ page, title, date, link }) => {
        const screenshot = (await page.screenshot()) as Buffer;
        const status = replace(title);

        await doTwoot([
          {
            status,
            media: screenshot,
            focus: "0,1",
            caption: "screenshot of a news item about my ex-wife",
          },
        ]);

        done.push([date.valueOf(), link]);
        i++;
      };

  const itemFilter = (item: NewsItem): boolean =>
    // is a relevant term actually in the title of the article?
    /china|chinese|xi|beijing/gi.test(item.title) &&
    item.date.valueOf() > oldestAllowableDate &&
    !doneSet.has(item.link);

  void main(itemFilter, onPageReady)
    .then(() => {
      console.log(`processed ${i} item${i === 1 ? "" : "s"}.`);

      done.sort((a, b) => a[0] - b[0]);
      while (done.length > 0 && done[0][0] < oldestAllowableDate) {
        done.shift();
      }

      writeFileSync(join(DATA_DIR, "done.json"), JSON.stringify(done, undefined, 2));
    })
    .then(() => flushSentry(2000))
    .then(() => {
      console.log("done.");
      process.exit(0);
    });
}
