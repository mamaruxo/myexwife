import { setTimeout } from "timers/promises";
import { TimeoutError } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { PuppeteerBlocker, fullLists } from "@ghostery/adblocker-puppeteer";

import { kickoffReplaceAndWatch } from "./userscript";

import type { Page } from "puppeteer";
import type { NewsItem } from "./fetch-and-parse";

export type OnPageReady = (params: NewsItem & { page: Page }) => Promise<boolean | void>;

export async function scrape(
  items: NewsItem[],
  onPageReady: OnPageReady,
): Promise<{ timeouts: number }> {
  puppeteer.use(StealthPlugin());

  const [browser, blocker] = await Promise.all([
    puppeteer.launch({ defaultViewport: { width: 1000, height: 800 } }),
    PuppeteerBlocker.fromLists(
      fetch,
      [
        ...fullLists,
        "https://easylist.to/easylist/easylist.txt",
        "https://easylist.to/easylist/easyprivacy.txt",
        "https://secure.fanboy.co.nz/fanboy-annoyance.txt",
      ],
      { enableCompression: true },
    ),
  ]);

  let timeouts = 0;

  for (const { title, link, date, guid } of items) {
    console.log("visiting", link);
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      await blocker.enableBlockingInPage(page);
      try {
        await page.goto(link, { waitUntil: ["domcontentloaded", "load", "networkidle0"] });
      } catch (e) {
        if (!(e instanceof TimeoutError)) throw e;
        await page.goto(link, { waitUntil: ["domcontentloaded", "load", "networkidle2"] });
      }
      await page.evaluate(kickoffReplaceAndWatch);
      await setTimeout(10);
      const shouldStop = await onPageReady({ page, title, link, date, guid });
      if (shouldStop) break;
    } catch (e) {
      if (e instanceof TimeoutError) {
        console.error(`Timeout exceeded for page ${link} :\n`, e, "\n");
        timeouts++;
      } else {
        throw e;
      }
    } finally {
      await context.close();
    }
  }

  await browser.close();

  return { timeouts };
}
