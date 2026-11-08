---
name: statechart-dashboard
description: "Build one offline Chrome page that shows every statechart of a run with its rules, report, spec, and notes. Use after a statechart run, or to view several statecharts in one browser page."
---

# Statechart dashboard

The page puts each chart next to its verdicts, so the reader can click through states, arrows, and bug paths in one place. It needs no server and no network. To make the charts, follow [the statechart skill](skill://statechart).

## When to run

Run it at the end of each statechart run that wrote an output folder. Run it also when the reader asks to see several statecharts together.

## Build the page

```sh
bun <skill dir>/scripts/build.ts --out DIR [--title TEXT] [--repo DIR] [--overview FILE.mmd] [--no-open] [--force] FOLDER...
```

- Give each `--out` folder of the statechart command as a FOLDER. It holds `report.md`, and `chart.mmd` unless the model is over the chart budget. Such a folder still gets a page with its report.
- Put DIR outside the repo, in the scratch folder next to the models, such as `<scratch>/dashboard`.
- The spec folder is FOLDER when it holds a `.tla` file, and its parent otherwise. The page shows each `.tla`, `.cfg`, and `view.mjs` file in it.
- `--overview` draws one more Mermaid file at the top of the page, such as a map of how the charts connect.

The command writes `DIR/index.html` and a `chart.svg` next to each `chart.mmd`, then opens the page in Google Chrome. When the page exists and no input changed, it prints `Reused` and only opens it. So run the same command again whenever you want the page, and after any change to a model or its notes. Use `--force` to rebuild anyway, and `--no-open` to skip Chrome. The first build installs Pele from the lockfile, so it needs the network once.

## Add notes

Put an optional `dashboard.json` in the spec folder. Each key is optional, and the build fails on an unknown key or a wrong type.

```json
{
  "id": "checkout",
  "title": "Checkout",
  "group": "Payments",
  "summary": "How a cart becomes a paid order.",
  "scope": "One cart and one payment provider.",
  "assumptions": ["The provider answers each call once."],
  "omissions": ["Refunds"],
  "links": ["refunds"],
  "stateNotes": { "Paying": "The provider holds the card details." },
  "arrowNotes": {
    "the payment fails": { "description": "The provider declines the card.", "sources": [0] }
  },
  "sources": [{ "path": "src/pay.ts", "start": 40, "end": 58, "note": "Where a decline is handled." }]
}
```

- `id` names the chart in `links` and in the page address. It defaults to the name of the spec folder.
- `links` lists the ids of other charts on the same page.
- `stateNotes` keys are state labels. `arrowNotes` keys are arrow labels, with or without the trailing `[condition]`.
- A `sources` path is absolute, or relative to `--repo` when you give it, or else relative to the spec folder. The page shows lines `start` to `end`. Each arrow note lists the indexes of its sources.

Notes explain the chart. They never change a verdict, because each rule's status comes from `report.md` alone. Do not write a note that softens a rule that breaks.

## Check the page

`scripts/verify.mjs` exports `verify(page)` for a Puppeteer page. It opens each chart and throws when a state or an arrow shows a different label than `chart.mmd`, when an arrow does not touch its states, when Fit does not fit, when the inspector does not open, or when a tab is empty.

```js
const { verify } = await import("<skill dir>/scripts/verify.mjs");
await page.goto("file://DIR/index.html");
console.log(await verify(page));
```

## Hand off

Show each chart as a `mermaid` code block in the reply, as the statechart skill says. Then give the path of `DIR/index.html` and the build command, so that the reader can reopen or rebuild the page. The Rebuild tab of the page shows the same command.
