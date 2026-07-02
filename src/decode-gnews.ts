import { load } from "cheerio";

// adapted from https://stackoverflow.com/a/79445730
export async function decodeGoogleNewsUrl(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Unexpected error when fetching redirect for "${url}":\n${res.statusText} (${res.status})`,
    );
  }
  const text = await res.text();
  const $ = load(text);
  const data = $("c-wiz[data-p]").attr("data-p");
  if (!data) {
    throw new Error(
      `Expected attribute not found in response!\nSelector: $("c-wiz[data-p]").attr("data-p")\nResponse:\n${text}`,
    );
  }
  const obj = JSON.parse(data.replace("%.@.", '["garturlreq",'));

  const body = new URLSearchParams({
    "f.req": JSON.stringify([
      [["Fbv4je", JSON.stringify([...obj.slice(0, -6), ...obj.slice(-2)]), "null", "generic"]],
    ]),
  });

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  };

  const res2 = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    body,
    headers,
  });
  if (!res2.ok) {
    throw new Error(
      `Unexpected error when fetching redirect":\n${res2.statusText} (${res2.status})`,
    );
  }
  const text2 = await res2.text();
  const arrayString = JSON.parse(text2.replace(")]}'", ""))[0][2];
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const articleUrl = JSON.parse(arrayString)[1];

  if (typeof articleUrl !== "string") {
    throw new Error(
      `Unexpected result: "${String(articleUrl)}"\n(expected string, got ${typeof articleUrl})`,
    );
  }

  return articleUrl;
}
