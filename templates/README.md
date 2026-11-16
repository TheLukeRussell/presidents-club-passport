# President's Club tracker template

**[Download the template](https://github.com/TheLukeRussell/presidents-club-passport/raw/main/templates/presidents-club-tracker.xlsx)** (one click, it downloads straight away)

This is the Excel sheet the President's Club Passport reads. Add a row whenever a rep does something that counts, and their passport and the standings pick it up. It takes about five minutes to learn. Use Excel, on the desktop or online: Google Sheets and Numbers lose the dropdowns.

**This page is public.** Save your copy somewhere private, like your team's SharePoint folder, and fill that one in. Never put real names here.

The sheet opens on a **Start here** tab with these same steps, every column explained, and a few made-up examples.

## Three rules

1. Don't rename the tabs or change the headers in row 1. The passport finds them by name.
2. Start in row 2 of each tab and keep going down. The table grows on its own.
3. Only add what actually happened. Not events coming up, and not ones someone was invited to but skipped.

## Step 1. Add every rep (Reps tab)

One row per person in the program. Do it once at the start, then again only when someone joins.

| Column | What to put in it |
|---|---|
| `rep_email` | Their work email. Stamps are matched to the rep by this, so it has to be spelled the same on both tabs. |
| `rep_name` | First and last name, the way it should show on their passport. |
| `team` | Pick from the list: Communications, POSB, NetSec, Cisco or Federal. |
| `start_date` | Only for someone who joined after the program started on July 1, 2026, like a new hire. Leave it blank for everyone else. Don't log anything from before their start date. |

## Step 2. Add a row each time someone earns a stamp (Stamps tab)

Pick the rep's email from the dropdown in the first column. Then find what happened below and fill in the rest of the row the same way. "Like ..." is an example; words in quotes are typed exactly.

| What happened | `activity` | `event` | `supplier` | `date` | `format` | `location` |
|---|---|---|---|---|---|---|
| Went to a supplier training in person | Supplier training | The training's name, like Zebra solutions workshop | The supplier, like Zebra | The day | In person | The city, like Greenville |
| Joined a supplier training online | Supplier training | The training's name, like Zebra partner training | The supplier, like Zebra | The day | Virtual | *(leave blank)* |
| Went to a supplier fair | Supplier fair | The fair's name, like Fall Supplier Fair | *(leave blank)* | The day | *(leave blank)* | The city, or "Online" |
| Finished a course on the Hub | Hub course | The course's title, like Meraki fundamentals | The supplier, like Cisco | The day they finished | *(leave blank)* | *(leave blank)* |
| Went to Club Express | Club Express | "Club Express Fall" or "Club Express Spring" | *(leave blank)* | The day | *(leave blank)* | The city |
| Hit their sales growth quota | Quota | "Sales growth quota" | *(leave blank)* | The day results came in | *(leave blank)* | *(leave blank)* |

- **A whole room?** Fill in one row, then copy it and paste it once for each person (Ctrl+C, then Ctrl+V; Cmd on a Mac), and change only the email. Don't drag the corner of the cell down: Excel adds a day to the date on every row. The same event name and date for everyone is how the passport knows they were at the same event.
- **Quota:** results come in at the end of June. Add one Quota row for each rep who hit it, and leave everyone else off.
- **Not sure?** Leave it out and ask. A missing row is easy to add later; a wrong one gives someone a stamp they didn't earn.
- **Someone leaves:** leave their rows where they are, and ask before deleting anything.
- **Your own notes:** add a column at the far right if you like. The passport ignores it.

## Step 3. Check before you save

- [ ] Every email on the Stamps tab is also on the Reps tab, spelled the same. (Stamps warns you when it isn't.)
- [ ] Everyone at the same event has the same event name and the same date.
- [ ] Every supplier training says In person or Virtual. A blank one counts as virtual.
- [ ] Dates are real dates. Type them like 9/23/2026, and Excel shows them as 2026-09-23. If one sits on the left of its cell, it's text, so type it again.
- [ ] Nothing is in there that hasn't happened yet.

## Step 4. Save it in the shared folder

Save it where your team keeps it, under the same file name. That's the copy the passport reads. Reading it straight from there is still being set up, so for now the demo shows sample data.

## What counts toward President's Club

A rep qualifies once they've met all five. Stamps past a minimum still count toward their total on the standings.

| | Minimum |
|---|---|
| Supplier trainings | 4 in person. Virtual ones earn a stamp too, but don't count toward the 4. |
| Supplier fairs | 2 |
| Hub courses | 2 supplier courses finished on the Hub |
| Club Express | Both events, Fall and Spring |
| Sales growth quota | Hit it. That one is the gold seal. |

<!-- The workbook is built by scripts/make-template.py (npm run template). Edit that, not the .xlsx. -->
