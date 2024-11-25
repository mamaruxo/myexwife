import { Readable } from "stream";

import Feedparser from "feedparser";

const sortOldestToNewest = (items: NewsItem[]) =>
  items.sort((a, b) => a.date.valueOf() - b.date.valueOf());

export interface NewsItem {
  title: string;
  link: string;
  date: Date;
  guid: string;
}

export async function fetchAndParse({
  filterItem = () => true,
}: {
  filterItem?: (item: NewsItem) => boolean;
} = {}) {
  const res = await fetch("https://news.google.com/rss/search?q=china");

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${res.statusText}`);
  }

  const parser = new Feedparser({ addmeta: false });
  Readable.fromWeb(res.body!).pipe(parser);

  const items: NewsItem[] = [];

  let i = 0;
  for await (const { title, link, date, guid } of parser) {
    i++;
    const item = { title, link, date, guid };
    if (filterItem(item)) {
      items.push(item);
    }
  }
  console.log(`fetched ${i} items. after filtering: ${items.length}.`);

  return sortOldestToNewest(items);
}
