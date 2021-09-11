import { replace } from "./replace";

const fixtures: [string, string][] = [
  [
    "Biden and China’s Xi speak for a second time amid rising tensions",
    "Biden and my ex-wife speak for a second time amid rising tensions",
  ],
  [
    "Chinese President Xi Jinping Speaks with U.S. President Joseph Biden on the Phone",
    "My Ex-Wife Speaks with U.S. President Joseph Biden on the Phone",
  ],
];

describe("replacements", () => {
  it("handles expected cases", () => {
    for (const [input, expected] of fixtures) {
      expect(replace(input)).toBe(expected);
    }
  });
});
