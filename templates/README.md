# President's Club tracker template

**[Download presidents-club-tracker.xlsx](presidents-club-tracker.xlsx)** (on the next page, hit the download button in the top right).

This is the Excel sheet the President's Club Passport reads. Add a row whenever a rep does something that counts, and their passport and the standings pick it up. It takes about five minutes to learn. The same steps are on the sheet's first tab, **Start here**.

## Three rules

1. Don't rename the tabs, the tables or the header rows. The passport finds them by name.
2. Add a row by typing in the first empty row under a table. The table grows on its own.
3. Only add what actually happened. Nothing planned, nothing missed.

## Step 1. Add every rep (Reps tab)

One row per person in the program. Do it once at the start, then again only when someone joins.

| Column | What to put in it |
|---|---|
| `rep_email` | Their work email. Stamps are matched to the rep by this, so it has to be spelled the same on both tabs. |
| `rep_name` | First and last name, the way it should show on their passport. |
| `team` | Pick from the list: Communications, POSB, NetSec, Cisco or Federal. |
| `start_date` | Only if they joined after July 1, 2026. Leave it blank for everyone else. |

## Step 2. Add a row each time someone earns a stamp (Stamps tab)

Find what happened in the left column, then fill in the row the same way. A dash means leave that cell empty.

| What happened | `activity` | `event` | `supplier` | `date` | `format` | `location` |
|---|---|---|---|---|---|---|
| Went to a supplier training in person | Supplier training | The training's name, like *Zebra solutions workshop* | Zebra | The day | In person | The city |
| Joined a supplier training online | Supplier training | The training's name, like *Zebra partner training* | Zebra | The day | Virtual | - |
| Went to a supplier fair | Supplier fair | The fair's name, like *Fall Supplier Fair* | - | The day | - | The city |
| Finished a course on the Hub | Hub course | The course's title, like *Meraki fundamentals* | Cisco | The day they finished | - | - |
| Went to Club Express | Club Express | *Club Express Fall* or *Club Express Spring* | - | The day | - | The city |
| Hit their sales growth quota | Quota | *FY27 sales growth quota* | - | The day results came in | - | - |

- **A whole room?** Fill in one row, then copy it down once for each person and change only the email. That keeps the event name and date the same for everyone, which is how the passport knows they were at the same event.
- **Quota:** results come in at the end of June. Add one Quota row for each rep who hit it, and leave everyone else off.
- **Not sure?** Leave it out and ask. A missing row is easy to add later; a wrong one gives someone a stamp they didn't earn.

## Step 3. Check before you save

- [ ] Every email on the Stamps tab is also on the Reps tab, spelled the same. (Stamps warns you when it isn't.)
- [ ] Everyone at the same event has the same event name and the same date.
- [ ] Every supplier training says In person or Virtual. A blank one counts as virtual.
- [ ] Dates are real dates: Excel shows them like 2026-09-23. If one sits on the left of its cell, it's text, so type it again.
- [ ] Nothing is in there that hasn't happened yet.

## What counts toward President's Club

A rep qualifies once they've met all five. Stamps past a minimum still count toward their total on the standings.

| | Minimum |
|---|---|
| Supplier trainings | 4 in person. Virtual ones earn a stamp too, but don't count toward the 4. |
| Supplier fairs | 2 |
| Hub courses | 2 supplier courses finished on the Hub |
| Club Express | Both events, Fall and Spring |
| Sales growth quota | Hit it. That one is the gold seal. |

## Keep the real one off GitHub

This repo is public. Fill in a copy saved somewhere private (like a SharePoint folder), never this file. The repo won't commit any other spreadsheet anyway, so a filled-in copy can't end up here by mistake.

<!-- The workbook is built by scripts/make-template.py (npm run template). Edit that, not the .xlsx. -->
