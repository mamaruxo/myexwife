require("source-map-support").install();
import { tmpdir } from "os";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { setTimeout } from "timers/promises";

import fetch from "node-fetch";
import Feedparser from "feedparser";

import puppeteerOrig from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { PuppeteerBlocker, fullLists } from "@cliqz/adblocker-puppeteer";

import { doTwoot } from "./twoot";
import { replace } from "./replace";
import { kickoffReplaceAndWatch } from "./userscript";

import type { Page } from "puppeteer";

interface NewsItem {
  title: string;
  link: string;
  date: Date;
  guid: string;
}

async function fetchAndParse() {
  const res = await fetch("https://news.google.com/rss/search?q=china");

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${res.statusText}`);
  }

  const parser = new Feedparser({ addmeta: false });
  res.body.pipe(parser);

  const items: NewsItem[] = [];

  for await (const { title, link, date, guid } of parser) {
    items.push({ title, link, date, guid });
  }

  items.sort((a, b) => b.date.valueOf() - a.date.valueOf());

  return items;
}

async function main(
  transformItems: (items: NewsItem[]) => NewsItem[],
  onPageReady: (params: { page: Page; title: string; link: string }) => Promise<void>
) {
  puppeteer.use(StealthPlugin());

  const [browser, rawItems, blocker] = await Promise.all([
    // not sure how puppeteer-extra duplicated the typings but messed them up
    puppeteer.launch({ defaultViewport: { width: 1000, height: 800 } } as any),
    fetchAndParse(),
    PuppeteerBlocker.fromLists(fetch, fullLists, { enableCompression: true }),
  ]);

  const items = transformItems(rawItems);

  /* eslint-disable no-await-in-loop */
  for (const { title, link } of items) {
    const context = await browser.createIncognitoBrowserContext();
    try {
      const page = await context.newPage();
      await blocker.enableBlockingInPage(page);
      await page.goto(link);
      await page.evaluate(kickoffReplaceAndWatch);
      await setTimeout(10);
      await onPageReady({ page, title, link });
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

if (argv.includes("local")) {
  console.log("Running locally!");

  const tmp = join(tmpdir(), `bot-${Date.now()}`);
  mkdirSync(tmp);
  let i = 0;

  void main(
    (items) => items.slice(0, 5),
    async ({ page, title, link }) => {
      const path = join(tmp, `${i}.png`);
      await page.screenshot({ path });
      console.log(`${title}\n(${replace(title)})\n${link}\nfile://${path}\n`);
      i++;
    }
  ).then(() => {
    console.log("done.");
    process.exit(0);
  });
} else {
  console.log("Running in production!");
  let i = 0;

  void main(
    (items) => {
      const latest = new Date(JSON.parse(readFileSync("data/latest", "utf8")));
      return items.filter((item) => item.date > latest);
    },
    async ({ page, title }) => {
      const screenshot = (await page.screenshot()) as Buffer;
      const status = replace(title);
      await doTwoot([{ status, media: screenshot, focus: "0,1" }]);
      i++;
    }
  ).then(() => {
    console.log(`processed ${i} item${i === 1 ? "" : "s"}.`);
    const now = new Date();
    writeFileSync("data/latest", JSON.stringify(now));
    console.log(`wrote date: ${now}`);
    console.log("done.");
    process.exit(0);
  });
}
