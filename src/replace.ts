// prettier-ignore
const prepositionsAndArticles = new Set([
  "as", "at", "by", "for", "from", "in",
  "of", "off", "on", "onto", "per", "to",
  "up", "upon", "via", "with", "the", "a",
  "an"
]);

export function replace(original: string) {
  // no 'south my ex-wife morning post'
  const title = original
    .trim()
    .replaceAll("South China Morning Post", "My Ex-Wife News Service")
    .replaceAll("SCMP", "MENS");

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
      split[0].replaceAll(/china|beijing/gi, "My ex-wife").replaceAll(/chinese/gi, "My ex-wife's")
    );

    for (let i = 1; i < split.length; i++) {
      if (/\?\.!/gi.test(split[i - 1].slice(-1))) {
        parts.push(
          split[i]
            .replaceAll(/china|beijing/gi, "My ex-wife")
            .replaceAll(/chinese/gi, "My ex-wife's")
        );
      } else {
        parts.push(
          split[i]
            .replaceAll(/china|beijing/gi, "my ex-wife")
            .replaceAll(/chinese/gi, "my ex-wife's")
        );
      }
    }

    replaced = parts.join(" ");
  }

  return replaced;
}
