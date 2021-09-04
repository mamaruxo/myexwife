require("source-map-support").install();

import fetch from "node-fetch";
import Feedparser from "feedparser";
import { chromium } from "playwright";

import { doTwoot } from "./twoot";
import { replace } from "./replace";

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
  const items = await fetchAndParse();

  const browser = await chromium.launch();
  /* eslint-disable no-await-in-loop */
  for (const { title, link } of items.slice(0, 2)) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(link);
    const screenshot = await page.screenshot();
    await doTwoot([{ status: replace(title), media: screenshot }]);
  }
  /* eslint-enable no-await-in-loop */
}

const argv = process.argv.slice(2);

if (argv.includes("local")) {
  console.log("Running locally!");
  void localMain().then(() => {
    console.log("done.");
  });
} else {
  console.log("Running in production!");
  void prodMain().then(() => {
    console.log("success.");
    process.exit(0);
  });
}
