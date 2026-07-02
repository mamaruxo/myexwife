import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { strict as assert } from "assert";
import { parseArgs } from "util";

import { close as flushSentry } from "@sentry/node";
import { distance as levDistance, closest as levClosest } from "fastest-levenshtein";

import { replace } from "./replace.ts";

import { DATA_DIR } from "./env.ts";
import { fetchAndParse } from "./fetch-and-parse.ts";
import { postStatus } from "./twoot.ts";

/**
 * percentage of difference required for item to not be filtered as duplicate.
 * (0 = identical, 1+ = completely different)
 */
const DIFFERENCE_THRESHOLD = 0.45;

const TWO_WEEKS = 1000 * 60 * 60 * 24 * 14;

const defaultOldestAllowableDate = Date.now() - TWO_WEEKS;

const { values } = parseArgs({
  options: {
    // run locally, save images instead of posting to accounts
    local: { type: "boolean" },
    // run locally, only list parsed feeds
    list: { type: "boolean" },
  },
});

if (values.list) {
  console.log("[running local list-only mode]");

  const items = await fetchAndParse({
    filterItem: (item) => /china|chinese|xi|beijing/gi.test(item.title),
  });

  for (const { title, date } of items) {
    console.log(`${title}\n(${replace(title)})\n${date.toISOString()}\n`);
  }

  console.log("done.");
  process.exit(0);
} else {
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
    console.warn("no feed items remained after filtering.");
    await flushSentry(2000);
    process.exit(0);
  }

  const { title, date } = items[0];
  const status = replace(title);
  await postStatus({ status });
  done.push([date.valueOf(), title]);

  // TODO: was only needed when we could twoot multiple statuses in one run
  done.sort((a, b) => a[0] - b[0]);
  while (done.length > 0 && done[0][0] < oldestAllowableDate) {
    done.shift();
  }

  writeFileSync(join(DATA_DIR, "done.json"), JSON.stringify(done, undefined, 2));

  await flushSentry(2000);

  console.log("done.");
  process.exit(0);
}
