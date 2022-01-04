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
  [
    "China removes two officials in locked-down Xi'an - FRANCE 24",
    "My ex-wife removes two officials in locked-down Xi'an - FRANCE 24",
  ],
  ["In Xi Jinping's China, Disaster Strikes", "At my Ex-Wife's Place, Disaster Strikes"],
];

describe("replacements", () => {
  it("handles expected cases", () => {
    expect.hasAssertions();
    for (const [input, expected] of fixtures) {
      expect(replace(input)).toBe(expected);
    }
  });
});
