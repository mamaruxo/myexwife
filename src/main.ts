require("source-map-support").install();
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

  let i = 0;
  /* eslint-disable no-await-in-loop */
  for (const { title, link } of items.slice(2, 4)) {
    const browser = await puppeteer.launch({ defaultViewport: { width: 1000, height: 800 } });
    const page = await browser.newPage();

    page.on("console", (msg) => {
      const text = msg.text();
      if (!text.startsWith("Failed to load resource: net::ERR_BLOCKED_BY_CLIENT")) {
        console.log(msg.text());
      }
    });

    await blocker.enableBlockingInPage(page);
    await page.goto(link);

    await page.evaluate(kickoffReplaceAndWatch);
    await setTimeout(10);

    // const screenshot = (await page.screenshot()) as Buffer;
    // await doTwoot([{ status: replace(title), media: screenshot }]);

    await page.screenshot({ path: `${i}.png` });
    console.log(`${title}\n(${replace(title)})\n${link}\nfile://${process.cwd()}/${i}.png\n`);
    i++;

    await browser.close();
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
