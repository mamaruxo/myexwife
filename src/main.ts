require("source-map-support").install();

// import { join } from "path";
// import { strict as assert } from "assert";

import { doTwoot } from "./twoot";

const argv = process.argv.slice(2);

if (argv.includes("local")) {
  console.log("Running locally!");
} else {
  console.log("Running in production!");
  void doTwoot([`test ${Math.floor(Math.random() * 100)}`]).then(() => {
    console.log("success.");
    process.exit(0);
  });
}
