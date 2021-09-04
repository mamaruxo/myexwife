require("source-map-support").install();
import { tmpdir } from "os";
import { mkdirSync } from "fs";
import { join } from "path";
import { setTimeout } from "timers/promises";

import fetch from "node-fetch";
import Feedparser from "feedparser";
import puppeteer from "puppeteer";
import { PuppeteerBlocker } from "@cliqz/adblocker-puppeteer";

import { doTwoot } from "./twoot";
import { replace } from "./replace";
import { kickoffReplaceAndWatch } from "./userscript";

async function fetchAndParse() {
  const res = await fetch("https://news.google.com/rss/search?q=china");

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${res.statusText}`);
  }

  const parser = new Feedparser({ addmeta: false });
  res.body.pipe(parser);

  const items: { title: string; link: string; date: Date; guid: string }[] = [];

  for await (const { title, link, date, guid } of parser) {
    items.push({ title, link, date, guid });
  }

  items.sort((a, b) => b.date.valueOf() - a.date.valueOf());

  return items;
}

async function localMain() {
  const items = await fetchAndParse();

  for (const { title, link, date } of items) {
    const replaced = replace(title);
    console.log(`${title}\n${replaced}\n${link}\n${date}\n`);
  }
}

async function prodMain() {
  const [items, blocker] = await Promise.all([
    fetchAndParse(),
    PuppeteerBlocker.fromPrebuiltAdsAndTracking(fetch),
  ]);

  const tmp = join(tmpdir(), `bot-${Date.now()}`);
  mkdirSync(tmp);

  let i = 0;
  /* eslint-disable no-await-in-loop */
  for (const { title, link } of items.slice(0, 16)) {
    // haven't tested using incognito contexts instead of restarting the
    // browser, but if they're like actual chrome incognito contexts certain
    // sites might block them with a paywall. might be worth investigating
    // eventually
    const browser = await puppeteer.launch({ defaultViewport: { width: 1000, height: 800 } });
    const page = await browser.newPage();

    try {
      await blocker.enableBlockingInPage(page);
      await page.goto(link);
      await setTimeout(10);

      await page.evaluate(kickoffReplaceAndWatch);
      await setTimeout(10);

      // const screenshot = (await page.screenshot()) as Buffer;
      // await doTwoot([{ status: replace(title), media: screenshot }]);

      const path = join(tmp, `${i}.png`);
      await page.screenshot({ path });

      console.log(`${title}\n(${replace(title)})\n${link}\nfile://${path}\n`);
      i++;
    } catch (e) {
      if (e instanceof puppeteer.errors.TimeoutError) {
        console.error(`Timeout exceeded for page ${link}:\n`, e);
      } else {
        throw e;
      }
    } finally {
      await browser.close();
    }
  }
  /* eslint-enable no-await-in-loop */
}

const argv = process.argv.slice(2);

if (argv.includes("local")) {
  console.log("Running locally!");
  void prodMain().then(() => {
    console.log("done.");
  });
} else {
  console.log("Running in production!");
  void prodMain().then(() => {
    console.log("success.");
    process.exit(0);
  });
}
