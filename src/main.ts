require("source-map-support").install();

import fetch from "node-fetch";
import Feedparser from "feedparser";

// import { join } from "path";
// import { strict as assert } from "assert";

import { doTwoot } from "./twoot";

// prettier-ignore
const prepositionsAndArticles = new Set([
  "as", "at", "by", "for", "from", "in",
  "of", "off", "on", "onto", "per", "to",
  "up", "upon", "via", "with", "the", "a",
  "an"
]);

async function main() {
  const res = await fetch("https://news.google.com/rss/search?q=china");

  if (res.ok) {
    const parser = new Feedparser({ addmeta: false });
    res.body.pipe(parser);

    const items: { title: string; link: string; date: Date; guid: string }[] = [];

    for await (const { title, link, date, guid } of parser) {
      items.push({ title, link, date, guid });
    }

    items.sort((a, b) => b.date.valueOf() - a.date.valueOf());

    for (const item of items) {
      // no 'south my ex-wife morning post'
      const title = item.title.replaceAll("South China Morning Post", "SCMP");

      // TODO: distinguish between start case and sentence case
      const isTitleCase = title
        .split(/\s+/)
        .every((w) => prepositionsAndArticles.has(w) || w[0] === w[0].toUpperCase());

      let replaced: string;

      if (isTitleCase) {
        replaced = title
          .replaceAll("South China Sea", "Sea of my Ex-Wife")
          .replaceAll(/(?:President\s+)?Xi Jinping/gi, "President of my Ex-Wife")
          .replaceAll(/China|Beijing/gi, "My Ex-Wife")
          .replaceAll(/chinese/gi, "My Ex-Wife's");
      } else {
        replaced = title
          .replaceAll("South China Sea", "Sea of my Ex-Wife")
          .replaceAll(/(?:President\s+)?Xi Jinping/gi, "President of my ex-wife");

        const split = replaced.split(/\s+/);
        const parts: string[] = [];

        // first one is always capitalized
        parts.push(
          split[0].replace(/china|beijing/gi, "My ex-wife").replace(/chinese/gi, "My ex-wife's")
        );

        for (let i = 1; i < split.length; i++) {
          if (/\?\.!/gi.test(split[i - 1].slice(-1))) {
            parts.push(
              split[i].replace(/china|beijing/gi, "My ex-wife").replace(/chinese/gi, "My ex-wife's")
            );
          } else {
            parts.push(
              split[i].replace(/china|beijing/gi, "my ex-wife").replace(/chinese/gi, "my ex-wife's")
            );
          }
        }

        replaced = parts.join(" ");
      }

      console.log(`${title}\n${replaced}\n${item.link}\n${item.date}\n`);
    }
  }
}

const argv = process.argv.slice(2);

if (argv.includes("local")) {
  console.log("Running locally!");
  void main().then(() => {
    console.log("done.");
  });
} else {
  console.log("Running in production!");
  void doTwoot([`test ${Math.floor(Math.random() * 100)}`]).then(() => {
    console.log("success.");
    process.exit(0);
  });
}
