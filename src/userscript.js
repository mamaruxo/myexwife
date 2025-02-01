// this file needs `lib: ["dom"]` to be set in the tsconfig to typecheck correctly
// -- but that conflicts with node's built-in `fetch`, which we use in
// `main.ts`. there's no real way around this other than setting up something
// cumbersome like multiple typescript project references or standing up a
// monorepo. but to avoid that, we can just use js for this file and enable
// typechecking as needed. uncommenting the triple-slash reference in this file
// will cause type errors in `main.ts`, so just re-comment it when you're done.

// uncomment the below lines to enable typechecking!

/*
// @ts-check
/// <reference lib="dom" />
*/

/* eslint-disable unicorn/consistent-function-scoping -- the entire function is evaluated by puppeteer */
export function kickoffReplaceAndWatch() {
  //////////////////////////////////////////////////////////
  // kludgily included from replace.ts, update if changed //
  //////////////////////////////////////////////////////////

  // prettier-ignore
  const prepositionsAndArticles = new Set([
    "as", "at", "by", "for", "from", "in",
    "of", "off", "on", "onto", "per", "to",
    "up", "upon", "via", "with", "the", "a",
    "an",
    // some outlets allow longer prepositions to be lowercase in their
    // title-cased headlines
    "among", "about"
  ]);

  /**
   * @param {string} w
   * @returns {boolean}
   */
  function isTitleCaseWord(w) {
    return w[0] === w[0].toUpperCase();
  }

  /**
   * @param {string} original
   * @returns {string}
   */
  function replace(original) {
    const title = original
      .trim()
      // no 'south my ex-wife morning post'
      .replaceAll("South China Morning Post", "My Ex-Wife News Service")
      .replaceAll("SCMP", "MENS")
      .replaceAll("South China Sea", "Sea of my Ex-Wife")
      .replaceAll("Xi Jinping Thought", "Ex-Wife Thought");

    // TODO: distinguish between start case and sentence case?
    const isTitleCase = title
      .split(/\s+/)
      .every((w) => prepositionsAndArticles.has(w) || isTitleCaseWord(w));

    let replaced;

    if (isTitleCase) {
      replaced = title
        .replaceAll(
          /in\s+(?:(?:(?:Chinese\s+)?President\s+|China['’]s\s+)?\bXi(?!'an)\b(?:\s+Jinping)?(?:['’]s\s+))?(?:China|Beijing)/g,
          "at my Ex-Wife's Place",
        )
        .replaceAll(
          /In\s+(?:(?:(?:Chinese\s+)?President\s+|China['’]s\s+)?\bXi(?!'an)\b(?:\s+Jinping)?(?:['’]s\s+))?(?:China|Beijing)/g,
          "At my Ex-Wife's Place",
        )
        .replaceAll(
          /(?:(?:Chinese\s+)?President\s+|China['’]s\s+)?\bXi(?!'an)\b(?:\s+Jinping)?(?:['’]s China)?/gi,
          "My Ex-Wife",
        )
        .replaceAll("the Chinese", "my Ex-Wife's")
        .replaceAll("The Chinese", "My Ex-Wife's")
        .replaceAll(/chinese/gi, "My Ex-Wife's")
        .replaceAll(/China|Beijing/gi, "My Ex-Wife");
    } else {
      replaced = title
        .replaceAll(
          /in\s+(?:(?:(?:Chinese\s+)?President\s+|China['’]s\s+)?\bXi(?!'an)\b(?:\s+Jinping)?(?:['’]s\s+))?(?:China|Beijing)/g,
          "at my ex-wife's place",
        )
        .replaceAll(
          /In\s+(?:(?:(?:Chinese\s+)?President\s+|China['’]s\s+)?\bXi(?!'an)\b(?:\s+Jinping)?(?:['’]s\s+))?(?:China|Beijing)/g,
          "At my ex-wife's place",
        )
        .replaceAll(
          /^(?:(?:Chinese\s+)?President\s+|China['’]s\s+)?\bXi(?!'an)\b(?:\s+Jinping)?(?:['’]s China)?/gi,
          "My ex-wife",
        )
        // needs more context to capitalize properly when it's not title case and
        // not at the start of the string but maybe better than nothing
        .replaceAll(
          /(?:(?:Chinese\s+)?President\s+|China['’]s\s+)?\bXi(?!'an)\b(?:\s+Jinping)?(?:['’]s China)?/gi,
          "my ex-wife",
        )
        .replaceAll("the Chinese", "my ex-wife's")
        .replaceAll("The Chinese", "My ex-wife's");

      const split = replaced.split(/\s+/);
      const parts = [];

      // we could probably use lookbehind to test for capitalization instead of
      // doing this iteratively.

      // first one is always capitalized
      parts.push(
        split[0]
          .replaceAll(/china|beijing/gi, "My ex-wife")
          .replaceAll(/chinese/gi, "My ex-wife's"),
      );

      for (let i = 1; i < split.length; i++) {
        if (/\?\.!/gi.test(split[i - 1].slice(-1))) {
          parts.push(
            split[i]
              .replaceAll(/china|beijing/gi, "My ex-wife")
              .replaceAll(/chinese/gi, "My ex-wife's"),
          );
        } else {
          parts.push(
            split[i]
              .replaceAll(/china|beijing/gi, "my ex-wife")
              .replaceAll(/chinese/gi, "my ex-wife's"),
          );
        }
      }

      replaced = parts.join(" ");
    }

    return replaced;
  }
  //////////////////////////////////////////////////////////
  // end include                                          //
  //////////////////////////////////////////////////////////

  const matcher = /\b(?:china|chinese|beijing|xi jinping)\b/i;

  /**
   * @param {Node} node
   * @returns {void}
   */
  function replaceNode(node) {
    if (matcher.test(/** @type {string} */ (node.textContent))) {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          matcher.test(/** @type {string} */ (n.textContent))
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT,
      });

      let childNode;
      while ((childNode = walker.nextNode())) {
        childNode.textContent = replace(/** @type {string} */ (childNode.textContent));
      }
    }
  }

  function replaceAndWatch() {
    if (matcher.test(document.title)) {
      document.title = replace(document.title);
    }

    replaceNode(document.body);

    const observer = new MutationObserver((mutList) => {
      for (const mut of mutList) replaceNode(mut.target);
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(replaceAndWatch, 1);
  } else {
    document.addEventListener("DOMContentLoaded", replaceAndWatch);
  }
}
