// The demo, start to finish: open the passport, turn every page, stamp all
// five minimums, check the standings moved, filter, then reset.

import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { ACTIVITIES, STORAGE_KEY } from '../src/config.ts'
import type { PassportData, StampRow } from '../src/data/types.ts'

const where = (page: Page) => page.locator('.passport__where')
const next = (page: Page) => page.getByRole('button', { name: 'Next page' })
const prev = (page: Page) => page.getByRole('button', { name: 'Previous page' })
// The pages actually showing. The book also keeps hidden copies of every page
// to size itself, so text checks look only here.
const shown = (page: Page) => page.locator('.book__slot')
// One page that's showing, by its name: "Supplier fairs", "Quota seal".
const sheet = (page: Page, name: string) => shown(page).getByRole('region', { name, exact: true })
// Where the rep stands, on the data page. Only the box that's showing: the
// room kept for the qualified message is hidden from everyone.
const standing = (page: Page) => sheet(page, 'Data page').getByRole('status')
const still = (page: Page) => expect(page.locator('.book.is-turning')).toHaveCount(0)
const demo = (page: Page) => page.getByRole('button', { name: 'Demo', exact: true })
const recordButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

// Where See all leaves the row it focuses: on screen, at the top under the
// page's scroll padding, unless the page runs out of room to scroll first.
// Polled, since the scroll is smooth.
const landed = (row: Locator) =>
  expect
    .poll(() =>
      row.evaluate((el) => {
        const box = el.getBoundingClientRect()
        const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
        const end = scrollY >= document.documentElement.scrollHeight - innerHeight - 1
        return box.top >= 0 && box.bottom <= innerHeight && (Math.abs(box.top - pad) < 2 || end)
      }),
    )
    .toBe(true)

// Walks the board top to bottom. Every rep is drawn or counted in a gap
// once, and each gap's button says it opens the places right where it sits.
const accounted = (page: Page) =>
  page.evaluate(() => {
    let at = 0
    const gaps: number[] = []
    const wrong: string[] = []
    for (const el of document.querySelector('.board tbody')!.children as HTMLCollectionOf<HTMLElement>) {
      if (el.dataset.rep) at++
      if (!el.classList.contains('board__gap')) continue
      const count = Number(el.querySelector('.board__gap-count')!.textContent!.match(/\d+/)![0])
      const from = Number(el.querySelector('button')!.getAttribute('aria-label')!.match(/reps (\d+)/)![1])
      if (from !== at + 1) wrong.push(`gap at ${at} opens from ${from}`)
      gaps.push(at)
      at += count
    }
    return { total: at, gaps, wrong }
  })

// See All sits on the score's line, right after its words, not a whole
// step away.
const seeAllBesideScore = (step: Locator) =>
  step.evaluate((el) => {
    const score = el.querySelector('.podium__rate')!
    // Where the words end, not the box: on a phone the stamps are a block.
    let right = 0
    const walk = document.createTreeWalker(score, NodeFilter.SHOW_TEXT)
    while (walk.nextNode()) {
      const text = document.createRange()
      text.selectNodeContents(walk.currentNode)
      const box = text.getBoundingClientRect()
      // The screen reader words are clipped to nothing.
      if (box.width > 1) right = Math.max(right, box.right)
    }
    const button = el.querySelector('.podium__all')!.getBoundingClientRect()
    return { gap: button.left - right, line: Math.abs(button.bottom - score.getBoundingClientRect().bottom) }
  })

// What each Record button stamps on Hannah's passport, in the order the
// demo presses them, and what the page says once it lands.
const HANNAH = [
  {
    button: 'Supplier training',
    detail: 'Pioneer, in person',
    page: 3,
    sheet: 'Supplier trainings',
    stamp: 'Pioneer solutions workshop, June 17, 2027, in person. Show details',
    endorse: 'Stamped 17 JUN 2027. In person 4 of 4, done. 1 of 5 met.',
    why: 'Already recorded today. Reset the demo to run it again.',
  },
  {
    button: 'Supplier fair',
    detail: 'Summer Supplier Fair',
    page: 4,
    sheet: 'Supplier fairs',
    stamp: 'Summer Supplier Fair, June 17, 2027, Greenville. Show details',
    endorse: 'Stamped 17 JUN 2027. Fairs 2 of 2, done. 2 of 5 met.',
    why: 'Already recorded today. Reset the demo to run it again.',
  },
  {
    button: 'Hub course',
    detail: 'Zebra course',
    page: 5,
    sheet: 'Hub training',
    stamp: 'Zebra Hub course, Mobile computing essentials, June 17, 2027, online. Show details',
    endorse: 'Stamped 17 JUN 2027. Hub 2 of 2, done. 3 of 5 met.',
    why: 'Already recorded for Hannah. Reset the demo to run it again.',
  },
  {
    button: 'Club Express',
    detail: 'Spring, Greenville',
    page: 6,
    sheet: 'Club Express',
    stamp: 'Club Express Spring, June 17, 2027, Greenville. Show details',
    endorse: 'Stamped 17 JUN 2027. Club Express 2 of 2, done. All four activities done.',
    why: 'Already recorded today. Reset the demo to run it again.',
  },
] as const

// Each Record button and the page its stamp lands on.
const RECORDS = [
  ['Supplier training', 3],
  ['Supplier fair', 4],
  ['Hub course', 5],
  ['Club Express', 6],
  ['Quota', 8],
] as const

test('the demo flow works end to end', async ({ page }, info) => {
  // Five stamp moments and a lot of page turns.
  test.slow()
  const phone = info.project.name.startsWith('phone')

  // Opens on the default rep's cover, with a blind ring where the
  // President's Club seal goes once all five are met.
  await page.goto('./')
  await expect(page).toHaveURL(/#\/passport\/hannah-kowalski$/)
  await expect(where(page)).toHaveText('Cover')
  await expect(shown(page).locator('.cover')).not.toHaveClass(/is-sealed/)
  await expect(shown(page).locator('.cover__seal')).toHaveClass(/gold-seal--blind/)
  await page.getByRole('button', { name: 'Open passport' }).click()
  await expect(standing(page).locator('.data__line-head')).toHaveText('Five to go')
  await expect(standing(page).locator('.data__line-sub')).toHaveText(
    '1 more in-person training, 1 more fair, 1 more Hub course and Club Express Spring. Quota results land June 30.',
  )
  await expect(shown(page).locator('.data__stat').filter({ hasText: 'Rank' })).toContainText('53rd of 60, tied')
  await expect(shown(page).locator('.data__stat').filter({ hasText: 'Minimums met' })).toContainText('0 of 5')

  // Turn every page forward to the back cover, then all the way back to the front.
  const seen = new Set<string>()
  // Click, wait for the label to change and the paper to stop moving, then read it.
  const turn = async (button: Locator) => {
    const before = (await where(page).textContent()) ?? ''
    await button.click()
    await expect(where(page)).not.toHaveText(before)
    await still(page)
    seen.add((await where(page).textContent()) ?? '')
  }
  while (await next(page).isEnabled()) await turn(next(page))
  await expect(where(page)).toHaveText('Back cover')
  await expect(page.getByRole('button', { name: 'Back to the front' })).toBeVisible()
  while (await prev(page).isEnabled()) await turn(prev(page))
  await expect(where(page)).toHaveText('Cover')
  if (phone) {
    expect(seen).toEqual(
      new Set([
        'Cover',
        'Inside cover, page 1 of 8',
        'Data page, page 2 of 8',
        'Supplier trainings, page 3 of 8',
        'Supplier fairs, page 4 of 8',
        'Hub training, page 5 of 8',
        'Club Express, page 6 of 8',
        'President’s Club checklist, page 7 of 8',
        'Quota seal, page 8 of 8',
        'Back cover',
      ]),
    )
  } else {
    expect(seen).toEqual(new Set(['Cover', 'Pages 1 and 2 of 8', 'Pages 3 and 4 of 8', 'Pages 5 and 6 of 8', 'Pages 7 and 8 of 8', 'Back cover']))
  }

  // Keys turn pages too, and on a phone so does a swipe. From the cover,
  // the next page is the inside cover on a phone and the first spread on a laptop.
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(phone ? /page=1/ : /page=2/)
  // The URL changes a render ahead of the book, so wait for the label too.
  await expect(where(page)).toHaveText(phone ? 'Inside cover, page 1 of 8' : 'Pages 1 and 2 of 8')
  if (phone) {
    const stage = page.locator('.passport__stage')
    const box = (await stage.boundingBox())!
    const y = box.y + 200
    await stage.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: box.x + 300, clientY: y, isPrimary: true })
    await stage.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7, clientX: box.x + 60, clientY: y + 10, isPrimary: true })
    await expect(page).toHaveURL(/page=2/)
    await expect(standing(page).locator('.data__line-head')).toHaveText('Five to go')
  }

  // Tap a stamp to see what it was without leaving the page. A slot still
  // to fill is a dashed outline with no event or date on it.
  await page.goto('./#/passport/hannah-kowalski?page=3')
  const trainings = sheet(page, 'Supplier trainings')
  const count = trainings.locator('.activity__count:not(.activity__count--reserve)')
  await expect(count.locator('.activity__tally')).toHaveText('3 of 4')
  await expect(count).toContainText('3 stamps')
  await expect(count).not.toContainText('Minimum met')
  await expect(trainings.locator('.slot--stamped[data-stamp]')).toHaveCount(3)
  await expect(trainings.locator('.slot--empty')).toHaveText('Still needed')
  await page.getByRole('button', { name: 'Zebra solutions workshop, September 23, 2026, in person. Show details' }).click()
  const slip = page.getByRole('dialog')
  await expect(slip.getByRole('heading', { name: 'Zebra' })).toBeVisible()
  await expect(slip).toContainText('Supplier training')
  await expect(slip).toContainText('In person, Greenville')
  await expect(slip.getByText('In person, so it counts toward the 4 in-person trainings.')).toBeVisible()
  await slip.getByRole('button', { name: 'Close' }).click()
  await expect(slip).toBeHidden()

  // A full page keeps the rest in its Also attended list. A virtual
  // training earns a stamp but doesn't count, and one past the minimum is
  // an extra that still adds to the total.
  await page.goto('./#/passport/jordan-hale?page=3')
  const jordans = sheet(page, 'Supplier trainings')
  await expect(jordans.locator('.slot--stamped[data-stamp]')).toHaveCount(4)
  await expect(jordans.locator('.slot--empty')).toHaveCount(0)
  await expect(jordans.locator('.activity__summary')).toHaveText('Also attended 7')
  await expect(jordans.locator('.extra[data-stamp]').first()).toBeHidden()
  await jordans.locator('.activity__summary').click()
  await expect(jordans.locator('.extra[data-stamp]')).toHaveCount(7)
  await jordans.getByRole('button', { name: /^HP Poly partner training, December 9, 2026, virtual\./ }).click()
  await expect(slip.getByText('A virtual training earns a stamp, but the minimum counts in-person sessions only.')).toBeVisible()
  await page.keyboard.press('Escape')
  await jordans.getByRole('button', { name: /^Brady solutions workshop, May 19, 2027, in person\./ }).click()
  await expect(slip.getByText('An extra: Jordan already had the 4 in-person trainings. It still adds to the stamp total on Standings.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(slip).toBeHidden()

  // The checklist has a row for each minimum, and each row turns to its page.
  await page.goto('./#/passport/hannah-kowalski?page=7')
  const checklist = sheet(page, 'President’s Club checklist')
  await expect(checklist.locator('.checklist__count')).toHaveText('0 of 5 met')
  await expect(checklist.getByRole('img', { name: /^Qualified/ })).toHaveCount(0)
  await checklist.getByRole('button', { name: 'Supplier fairs: 1 of 2. Go to page 4' }).click()
  await expect(page).toHaveURL(phone ? /page=4$/ : /page=3$/)
  await still(page)
  await expect(sheet(page, 'Supplier fairs')).toBeVisible()

  // Record all five from the passport. Each button turns the book to its
  // page, the stamper brings the stamp down, the endorsement gets written
  // in, and the button is used up, saying why.
  await page.goto('./#/passport/hannah-kowalski?page=2')
  await demo(page).click()
  for (const r of HANNAH) {
    const button = recordButton(page, r.button)
    await expect(button).toBeEnabled()
    await expect(button).toHaveAccessibleDescription(r.detail)
    await button.click()
    await expect(page).toHaveURL(new RegExp(`page=${r.page}$`))
    const leaf = sheet(page, r.sheet)
    await expect(leaf.getByRole('button', { name: r.stamp })).toBeVisible()
    await expect(leaf.locator('.slot--empty')).toHaveCount(0)
    await expect(leaf.locator('.visa__endorse')).toHaveText(r.endorse)
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await expect(button).toHaveAccessibleDescription(r.why)
    await expect(page.locator('.stamper')).toHaveCount(0, { timeout: 5000 })
  }
  await expect(page.locator('.demo__record .demo__help')).toHaveText(
    'Recorded Club Express Spring for Hannah and the others who were there. Reset to run it again.',
  )

  // Quota brings the seal press down on page 8, and the gold seal is there
  // as it lifts. The checklist facing it gets its QUALIFIED stamp.
  const quota = recordButton(page, 'Quota')
  await expect(quota).toHaveAccessibleDescription('Gold seal')
  await quota.click()
  await expect(page).toHaveURL(/page=8$/)
  const seal = sheet(page, 'Quota seal')
  await expect(seal.getByRole('img', { name: 'Gold seal, Hannah Kowalski’s quota achieved' })).toBeVisible()
  await expect(seal.getByRole('status')).toHaveText('Sealed 17 JUN 2027. Qualified for President’s Club.')
  await expect(seal.locator('.seal-page__name')).toHaveText('Hannah Kowalski')
  await expect(page.locator('.seal-press')).toHaveCount(0, { timeout: 5000 })
  await expect(quota).toHaveAttribute('aria-disabled', 'true')
  await expect(quota).toHaveAccessibleDescription('Already recorded for Hannah. Reset the demo to run it again.')
  await page.goto('./#/passport/hannah-kowalski?page=7')
  await still(page)
  await expect(checklist.locator('.checklist__count')).toHaveText('5 of 5 met')
  await expect(checklist.getByRole('img', { name: 'Qualified for President’s Club 2027, 17 JUN 2027' })).toBeVisible()
  await expect(checklist.getByRole('button', { name: 'Sales growth quota: Achieved, met. Go to page 8' })).toBeVisible()

  // All five met, so the President's Club seal is pressed into the cover.
  await page.goto('./#/passport/hannah-kowalski')
  await still(page)
  await expect(shown(page).locator('.cover')).toHaveClass(/is-sealed/)
  await expect(shown(page).locator('.cover__seal')).toHaveClass(/gold-seal--club/)
  await expect(shown(page).getByRole('img', { name: 'President’s Club seal: all five minimums met' })).toBeVisible()

  // And the data page says she's in.
  await page.goto('./#/passport/hannah-kowalski?page=2')
  await expect(standing(page).locator('.data__line-head')).toHaveText('Qualified for President’s Club')
  await expect(standing(page).locator('.data__line-sub')).toHaveText('All five minimums met. See you on the trip in 2028.')
  await expect(shown(page).locator('.data__stat').filter({ hasText: 'Minimums met' })).toContainText('5 of 5')
  await expect(shown(page).locator('.data__stat').filter({ hasText: 'Rank' })).toContainText('1st of 60')
  await expect(shown(page).locator('.data__quota .data__quota-head')).toHaveText('Achieved')
  await expect(shown(page).locator('.data__quota .data__quota-sub')).toHaveText('17 JUN 2027')

  // Standings picked it up. Hannah is first and the only one over the line,
  // and 21 reps have all four activities in.
  await page.getByRole('link', { name: 'Standings' }).click()
  const hannah = page.locator('[data-rep="hannah-kowalski"]')
  await expect(hannah.locator('.board__rank')).toHaveText('1')
  await expect(hannah.locator('.board__met')).toHaveText('5 of 5 met')
  await expect(hannah.locator('.board__status')).toHaveText('Qualified')
  await expect(hannah).toContainText('You')
  await expect(page.locator('.board__none')).toHaveCount(0)
  expect(await page.locator('.board__cut').evaluate((el) => (el.previousElementSibling as HTMLElement | null)?.dataset.rep)).toBe('hannah-kowalski')
  await expect(page.locator('.figures__value')).toHaveText(['1', '21', '12.2'])
  await expect(page.locator('.figures__unit').nth(0)).toHaveText('of 60 reps')
  await expect(page.locator('.podium__name')).toHaveText(['Hannah Kowalski', 'Jordan Hale'])
  await expect(page.locator('.podium__step--third .podium__count')).toHaveText('2 reps tied for 3rd')
  await expect(page.locator('.podium__step--third .podium__meta')).toHaveText('POSB')

  // Filter by team, then search for nobody.
  await page.locator('label[for="team-federal"]').click()
  await expect(page).toHaveURL(/team=federal/)
  // Wait for the board itself to narrow before reading it.
  await expect(page.locator('[data-rep]')).toHaveCount(12)
  const teams = await page.locator('[data-rep] .board__team').allTextContents()
  expect(teams.every((t) => t.includes('Federal'))).toBe(true)
  await expect(page.locator('.figures__unit').nth(0)).toHaveText('of 12 Federal reps')
  await expect(page.locator('.figures__value')).toHaveText(['0', '3', '10.8'])
  // Liam is the only Federal rep at 9th, but he's tied with reps from
  // other teams on the full board, so he keeps his T here and on the podium.
  await expect(page.locator('[data-rep="liam-tremblay"] .board__rank')).toHaveText('Tied T9')
  await expect(page.locator('.podium__step--first .podium__rank')).toHaveText('Rank T9')
  await expect(page.locator('.board__none')).toHaveText('Nobody on Federal has met all five yet. Quota results land June 30.')
  await page.getByLabel('Search by name').fill('zzz')
  await expect(page.getByText('Nobody named “zzz” on Federal')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.locator('[data-rep]')).toHaveCount(12)

  // Selecting a rep opens their passport.
  await page.getByRole('link', { name: 'Ethan Park' }).first().click()
  await expect(page).toHaveURL(/#\/passport\/ethan-park\?page=2/)

  // Reset, and it's undoable.
  await page.getByRole('link', { name: 'Standings' }).click()
  await page.getByRole('button', { name: 'Reset demo' }).click()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  await expect(page.locator('.figures__value')).toHaveText(['0', '0', '10.1'])
  for (const [name] of RECORDS) await expect(recordButton(page, name)).toBeEnabled()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.figures__value')).toHaveText(['1', '21', '12.2'])
  await expect(recordButton(page, 'Quota')).toBeDisabled()
  await page.getByRole('button', { name: 'Reset demo' }).click()
  await expect(page.locator('.figures__value').nth(0)).toHaveText('0')

  // Recording from someone else's passport stamps that passport, not the
  // rep in the View as box, and Standings then highlights them. The new
  // hire's training stamp lands, but she missed Club Express Fall, so
  // she's still out of reach.
  await page.goto('./#/passport/clara-dubois?page=2')
  await expect(page.locator('#demo-panel')).toBeVisible()
  await expect(page.locator('#record-title')).toHaveText('Record a stamp for Clara')
  await recordButton(page, 'Supplier training').click()
  await expect(page).toHaveURL(/clara-dubois\?page=3$/)
  const claras = sheet(page, 'Supplier trainings')
  await expect(claras.getByRole('button', { name: 'Pioneer solutions workshop, June 17, 2027, in person. Show details' })).toBeVisible()
  await expect(claras.locator('.visa__endorse')).toHaveText('Stamped 17 JUN 2027. In person 1 of 4. 0 of 5 met.')
  await expect(claras.locator('.slot--empty')).toHaveCount(3)
  await page.goto('./#/passport/clara-dubois?page=2')
  await expect(standing(page).locator('.data__line-head')).toHaveText('Out of reach this year')
  await page.getByRole('link', { name: 'Standings' }).click()
  const clara = page.locator('[data-rep="clara-dubois"]')
  await expect(clara).toContainText('You')
  await expect(clara.locator('.board__status')).toHaveText('Out of reach')
  await expect(page.locator('.podium__step--first .podium__name')).toHaveText('Jordan Hale')
  await expect(page.locator('.podium__rank').first()).toHaveText('Rank 1')
})

// Past 25 reps the board is short: the top 10, two reps either side of the
// line and three either side of you, with a gap row for each run left out.
// A team of 12 shows everyone, a search shows every match, and the gaps you
// open stay open until the team filter changes, searching or not.
test('the board stays short and every rep is a tap away', async ({ page }) => {
  const rows = page.locator('[data-rep]')
  const gaps = page.locator('.board__gap')
  const table = page.getByRole('table', { name: /^Standings/ })
  await page.goto('./#/standings')

  // You're on it without opening anything. Nobody has qualified, so the
  // line sits at the very top, under a row that says so.
  await expect(page.locator('[data-rep="hannah-kowalski"]')).toContainText('You')
  await expect(rows).toHaveCount(17)
  await expect(gaps).toHaveText([/^40 more reps/, /^3 more reps/])
  await expect(page.locator('.board__none')).toHaveText('Nobody has met all five yet. Quota results land June 30.')
  expect(
    await page.locator('.board tbody > tr').evaluateAll((els) => els.slice(0, 3).map((el) => (el as HTMLElement).dataset.rep ?? el.className)),
  ).toEqual(['board__none', 'board__cut', 'jordan-hale'])
  // Screen readers hear that this is only part of the board.
  await expect(table).toHaveAccessibleDescription(/^Showing 17 of 60 reps\./)

  // A gap is a row of the table with one cell across all eight columns, and
  // its button says what it opens, which places included, so no two gap
  // buttons sound the same. Open it from the keyboard: focus lands on the
  // first rep it brings in, where the gap was.
  const gap = page.getByRole('row', { name: /40 more reps/ })
  await expect(gap.getByRole('cell')).toHaveAttribute('colspan', '8')
  const more = gap.getByRole('button', { name: 'Show all 40' })
  await expect(more).toHaveText('Show all 40')
  await expect(more).toHaveAccessibleName('Show all 40, reps 11 to 50 of 60')
  await expect(more).toHaveAccessibleDescription('40 more reps')
  await expect(page.getByRole('button', { name: 'Show all 3' })).toHaveAccessibleName('Show all 3, reps 58 to 60 of 60')
  await more.focus()
  await page.keyboard.press('Enter')
  await expect(rows).toHaveCount(57)
  await expect(gaps).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Rahul Mehta' })).toBeFocused()
  await expect(table).toHaveAccessibleDescription(/^Showing 57 of 60 reps\./)

  // Still open after a trip to a passport and back.
  await page.getByRole('link', { name: 'Rahul Mehta' }).click()
  await expect(page).toHaveURL(/#\/passport\/rahul-mehta/)
  await page.goBack()
  await expect(rows).toHaveCount(57)

  // A team of 12 shows them all. Changing the filter folds the board back up.
  await page.locator('label[for="team-federal"]').click()
  await expect(rows).toHaveCount(12)
  await expect(gaps).toHaveCount(0)
  await page.locator('label[for="team-all"]').click()
  await expect(rows).toHaveCount(17)
  await expect(gaps).toHaveCount(2)

  // Search shows every match, in rank order, with no gaps. Open a gap
  // first: it's still open once the search is cleared, typed or not.
  await page.getByRole('button', { name: 'Show all 40' }).click()
  await expect(rows).toHaveCount(57)
  const data: PassportData = await page.evaluate(() => fetch('data/passport.json').then((r) => r.json()))
  const matches = data.reps.filter((r) => r.rep_name.toLowerCase().includes('e')).length
  expect(matches).toBeGreaterThan(25)
  const search = page.getByLabel('Search by name')
  await search.fill('e')
  await expect(rows).toHaveCount(matches)
  await expect(gaps).toHaveCount(0)
  await expect(page.locator('.board__none')).toHaveCount(0)
  await expect(table).not.toHaveAttribute('aria-describedby')
  const ranks = (await page.locator('[data-rep] .board__rank').allTextContents()).map((t) => Number(t.replace(/\D/g, '')))
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  await search.fill('')
  await expect(rows).toHaveCount(57)
  await expect(gaps).toHaveCount(1)
  await search.pressSequentially('zzz')
  await expect(page.getByText('Nobody named “zzz”')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(rows).toHaveCount(57)

  // The last gap runs down to the new hire, last and out of reach.
  await page.getByRole('button', { name: 'Show all 3' }).click()
  await expect(page.locator('[data-rep="clara-dubois"] .board__status')).toHaveText('Out of reach')
  await expect(rows.last()).toHaveAttribute('data-rep', 'clara-dubois')
  await expect(rows).toHaveCount(60)
  await expect(gaps).toHaveCount(0)
  await expect(table).not.toHaveAttribute('aria-describedby')
})

// A tie too big for the steps left gets one step that counts it, so the
// alphabet never picks who stands on the podium. See all takes you to the
// first of them on the board, and the whole step is its button.
test('the podium counts a tie it can’t fit and See all finds them', async ({ page }, info) => {
  const phone = info.project.name.startsWith('phone')
  const steps = page.locator('.podium__step')
  const tie = page.locator('.podium__step--tie')
  await page.goto('./#/standings?team=federal')

  // On Federal, Liam and Ethan get steps of their own, and the two sharing
  // 24th get the last one together.
  await expect(page.getByRole('heading', { name: 'Top three in Federal' })).toBeVisible()
  await expect(steps).toHaveCount(3)
  await expect(page.locator('.podium__name')).toHaveText(['Liam Tremblay', 'Ethan Park'])
  await expect(page.locator('.podium__step--first .podium__rank')).toHaveText('Rank T7')
  await expect(page.locator('.podium__step--second .podium__rank')).toHaveText('Rank 21')
  await expect(tie).toHaveClass(/podium__step--third/)
  await expect(tie).toHaveClass(/podium__step--short/)
  await expect(tie.locator('.podium__rank')).toHaveText('Rank T24')
  await expect(tie.locator('.podium__count')).toHaveText('2 reps tied for 24th')
  await expect(tie.locator('.podium__rate')).toHaveText('2 of 5 minimums met, · 11 stamps')
  const seeAll = page.getByRole('button', { name: 'See all 2 reps tied for 24th' })
  await expect(seeAll).toHaveText('See all 2')
  // On a laptop the count step's score and button share a line, so its
  // score lines up with the others and the podium is no taller than usual.
  const tall = (await steps.first().boundingBox())!.height
  if (!phone) {
    const apart = await seeAllBesideScore(tie)
    expect(apart.gap, 'See all is next to the score').toBeLessThan(40)
    expect(apart.line, 'See all is on the score’s line').toBeLessThan(2)
    const bottoms = await page.locator('.podium__rate').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().bottom)))
    expect(new Set(bottoms).size, 'scores on one line').toBe(1)
  }

  // From the keyboard: focus lands on the first T24 on the board, its row
  // brought up to the top of the screen.
  const aisha = page.locator('[data-rep="aisha-bello"]')
  await expect(aisha.locator('.board__rank')).toHaveText('Tied T24')
  await seeAll.focus()
  await page.keyboard.press('Enter')
  await expect(aisha.getByRole('link', { name: 'Aisha Bello' })).toBeFocused()
  await landed(aisha)

  // A tap anywhere on the step does the same.
  await page.getByLabel('Search by name').focus()
  await page.evaluate(() => scrollTo(0, 0))
  const box = (await tie.boundingBox())!
  await tie.click({ position: { x: box.width - 12, y: 12 } })
  await expect(aisha.getByRole('link', { name: 'Aisha Bello' })).toBeFocused()
  await landed(aisha)

  // Every rank fits its step on a 320 phone instead of running into the edge.
  const size = page.viewportSize()!
  await page.setViewportSize({ width: 320, height: size.height })
  const ranks = await page.locator('.podium__rank').evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth))
  expect(ranks, 'every rank fits its step at 320').toEqual([0, 0, 0])
  await page.setViewportSize(size)

  // Communications has the same shape: two reps by name, then two
  // sharing 15th.
  await page.locator('label[for="team-communications"]').click()
  await expect(page.getByRole('heading', { name: 'Top three in Communications' })).toBeVisible()
  await expect(page.locator('.podium__name')).toHaveText(['Owen Fitzgerald', 'Talia Ross'])
  await expect(tie.locator('.podium__count')).toHaveText('2 reps tied for 15th')
  await page.getByRole('button', { name: 'See all 2 reps tied for 15th' }).click()
  const imani = page.locator('[data-rep="imani-carter"]')
  await expect(imani.locator('.board__rank')).toHaveText('Tied T15')
  await expect(imani.getByRole('link', { name: 'Imani Carter' })).toBeFocused()
  await landed(imani)

  // After today's training, Cisco has one rep out in front and three
  // sharing the next place. Second's tie takes the left slot and leaves the
  // right one empty.
  await page.locator('label[for="team-cisco"]').click()
  await expect(page.getByRole('heading', { name: 'Top three in Cisco' })).toBeVisible()
  await expect(page.locator('.podium__count')).toHaveCount(0)
  await demo(page).click()
  await recordButton(page, 'Supplier training').click()
  await page.keyboard.press('Escape')
  await expect(steps).toHaveCount(2)
  await expect(page.locator('.podium__name')).toHaveText(['Theo Vance'])
  await expect(tie).toHaveClass(/podium__step--second/)
  await expect(tie).toHaveClass(/podium__step--mid/)
  await expect(tie.locator('.podium__count')).toHaveText('3 reps tied for 13th')
  // Let the rows finish sliding first, so the scroll aims at where they land.
  await expect(page.locator('.board .is-sliding')).toHaveCount(0)
  await page.getByRole('button', { name: 'See all 3 reps tied for 13th' }).click()
  const janelle = page.locator('[data-rep="janelle-moss"]')
  await expect(janelle.locator('.board__rank')).toHaveText('Tied T13')
  await expect(janelle.getByRole('link', { name: 'Janelle Moss' })).toBeFocused()
  await landed(janelle)
  await page.getByRole('button', { name: 'Demo', exact: true }).click()
  await page.getByRole('button', { name: 'Reset demo' }).click()
  await page.keyboard.press('Escape')

  // Three at the top that fit all three steps stand up there by name.
  await page.locator('label[for="team-all"]').click()
  await expect(page.getByRole('heading', { name: 'Top three', exact: true })).toBeVisible()
  await expect(page.locator('.podium__name')).toHaveText(['Jordan Hale', 'Marcus Bell', 'Priya Natarajan'])
  await expect(page.locator('.podium__rank')).toHaveText(['Rank 1', 'Rank T2', 'Rank T2'])
  await expect(page.locator('.podium__count')).toHaveCount(0)
  if (!phone) expect((await steps.first().boundingBox())!.height, 'Federal’s podium is as tall as this one').toBe(tall)
})

// Prod size: 600 reps, the sample plus nine made-up copies of it (each rep's
// stamps under a first name paired with another sample surname), so ranks
// run past 99 with big ties. Every page that loads data gets this instead.
async function useSixHundred(page: Page) {
  const sample: PassportData = JSON.parse(readFileSync('public/data/passport.json', 'utf8'))
  const byRep = new Map<string, StampRow[]>()
  for (const stamp of sample.stamps) byRep.set(stamp.rep_email, [...(byRep.get(stamp.rep_email) ?? []), stamp])
  const big: PassportData = { reps: [...sample.reps], stamps: [...sample.stamps] }
  for (let k = 1; k < 10; k++) {
    sample.reps.forEach((rep, i) => {
      const first = rep.rep_name.split(' ')[0]
      const last = sample.reps[(i + k * 7) % sample.reps.length].rep_name.split(' ').at(-1)
      const email = rep.rep_email.replace('@', `.${k}@`)
      big.reps.push({ ...rep, rep_email: email, rep_name: `${first} ${last}` })
      for (const stamp of byRep.get(rep.rep_email) ?? []) big.stamps.push({ ...stamp, rep_email: email })
    })
  }
  expect(big.reps).toHaveLength(600)
  expect(new Set(big.reps.map((r) => r.rep_name)).size, 'every made-up name is new').toBe(600)
  expect(big.stamps).toHaveLength(sample.stamps.length * 10)
  await page.route('**/data/passport.json', (route) => route.fulfill({ json: big }))
}

// At 600 reps the demo still opens as Hannah, the board stays short with
// you on it, and the rank column fits ties like T521 without printing over
// the name, down to a 320 phone, with every row one height. Record still
// slides, and nothing prints text over text while it does.
test('a 600 rep board stays short and its ranks fit', async ({ page }, info) => {
  await useSixHundred(page)

  await page.goto('./')
  await expect(page).toHaveURL(/#\/passport\/hannah-kowalski$/)
  await page.goto('./#/standings')
  const rows = page.locator('[data-rep]')
  const hannah = page.locator('[data-rep="hannah-kowalski"]')
  await expect(hannah).toContainText('You')
  await expect(hannah.locator('.board__rank')).toHaveText('Tied T521')
  await expect(page.locator('.figures__unit').nth(0)).toHaveText('of 600 reps')
  expect(await rows.count()).toBeLessThanOrEqual(25)
  expect(await page.locator('.board__gap').count()).toBeGreaterThanOrEqual(2)
  await expect(page.getByRole('table', { name: /^Standings/ })).toHaveAccessibleDescription(new RegExp(`^Showing ${await rows.count()} of 600 reps\\.`))
  // Two gaps can open the same number of reps. Their buttons still say
  // which places they open, so a screen reader can tell them apart.
  const names = await page.locator('.board__gap-more').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
  expect(new Set(names).size).toBe(names.length)
  for (const name of names) expect(name).toMatch(/^Show (\d+ more|all \d+|both), reps \d+ (to|and) \d+ of 600$/)

  // Every drawn rank sits inside its own cell, clear of the name, the name
  // clear of the score, and nothing scrolls sideways. A four character rank
  // fits your Ember block without eating into its padding, even T999.
  const fits = async (label: string, oneHeight: boolean) => {
    await page.evaluate(() => document.fonts.ready)
    const r = await page.evaluate(() => {
      // The right edge of the text you can see, leaving out the screen
      // reader words, which lay out full width even though they're clipped.
      const right = (el: Element) => {
        const range = document.createRange()
        let edge = -Infinity
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE && (node as Element).classList?.contains('visually-hidden')) continue
          range.selectNodeContents(node)
          edge = Math.max(edge, range.getBoundingClientRect().right)
        }
        return edge
      }
      const inside = (cell: Element) => cell.getBoundingClientRect().right - parseFloat(getComputedStyle(cell).paddingRight) + 0.5
      const bad: string[] = []
      for (const row of document.querySelectorAll('[data-rep]')) {
        const rank = row.querySelector('.board__rank')!
        const rep = row.querySelector('.board__rep')!
        const met = row.querySelector('.board__met')!
        const edge = right(rank)
        if (edge > inside(rank) || edge > rep.getBoundingClientRect().left) bad.push(`${rank.textContent} over the name`)
        if (right(row.querySelector('.board__link')!) > met.getBoundingClientRect().left + 0.5 && rep.getBoundingClientRect().top === met.getBoundingClientRect().top) bad.push(`${row.getAttribute('data-rep')} under the score`)
      }
      // The widest rank there could be, in your row's rank cell. The cell's
      // own nodes go back afterwards, not copies: React still holds them, and
      // copies crash it the next time the rank changes.
      const mine = document.querySelector('.board__row.is-you .board__rank')!
      const was = [...mine.childNodes]
      const wasClass = mine.className
      mine.replaceChildren('T999')
      mine.classList.add('board__rank--long')
      if (right(mine) > inside(mine)) bad.push('T999 in your Ember block')
      mine.replaceChildren(...was)
      mine.className = wasClass
      const wide = [...document.querySelectorAll('[data-rep] .board__rank')].some((el) => /\d{3}/.test(el.textContent ?? ''))
      // Gap rows stay one line, so they're all one height.
      const gaps = new Set([...document.querySelectorAll('.board__gap')].map((el) => Math.round(el.getBoundingClientRect().height)))
      const heights = new Set([...document.querySelectorAll('[data-rep]')].map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10))
      return { bad, wide, gaps: gaps.size, heights: [...heights], scroll: document.documentElement.scrollWidth - innerWidth }
    })
    expect(r.wide, `${label}: no three digit rank on the board`).toBe(true)
    expect(r.gaps, `${label}: gap rows of different heights`).toBeLessThanOrEqual(1)
    expect(r.bad, label).toEqual([])
    expect(r.scroll, `${label}: the page scrolls sideways`).toBeLessThanOrEqual(0)
    // From 360 up every rep row on a phone is one height, whatever its
    // stamps, team or rank. At 320 a long name may wrap: names wrap, never
    // get cut off.
    if (oneHeight) expect(r.heights, `${label}: rep rows of different heights`).toHaveLength(1)
  }
  if (info.project.name.startsWith('phone')) {
    const size = page.viewportSize()!
    const search = page.getByLabel('Search by name')
    for (const width of [320, 360, 390, 440]) {
      await page.setViewportSize({ width, height: 800 })
      await fits(`${width} wide`, width >= 360)
      // A search draws hundreds of rows, you included.
      await search.fill('a')
      await expect(page.locator('.board__gap')).toHaveCount(0)
      expect(await rows.count()).toBeGreaterThan(300)
      await fits(`${width} wide, every rep with an a`, width >= 360)
      await search.fill('')
      await expect(page.locator('.board__gap')).not.toHaveCount(0)
    }
    await page.setViewportSize(size)
  } else {
    await fits('desktop', false)
  }

  // Record Club Express, frozen mid slide. Every rep drawn before and after
  // starts right where it was, and wherever two rows cross, the one on top
  // is opaque.
  await page.evaluate(() => document.querySelector('.board__row.is-you')!.scrollIntoView({ block: 'center' }))
  await demo(page).click()
  const spots = () =>
    page.evaluate(() => {
      const body = document.querySelector('.board tbody')!
      const top = body.getBoundingClientRect().top
      return Object.fromEntries([...body.querySelectorAll<HTMLElement>('[data-rep]')].map((el) => [el.dataset.rep!, el.getBoundingClientRect().top - top]))
    })
  const before = await spots()
  await recordButton(page, 'Club Express').click()
  const slide = await page.evaluate(() => {
    const body = document.querySelector('.board tbody')!
    const anims = document.getAnimations().filter((a) => body.contains((a.effect as KeyframeEffect | null)?.target ?? null))
    anims.forEach((a) => a.pause())
    const frames: string[] = []
    const starts: Record<string, number> = {}
    for (const t of [0, 60, 120, 200, 300, 450]) {
      anims.forEach((a) => (a.currentTime = t))
      const top = body.getBoundingClientRect().top
      const kids = [...body.children] as HTMLElement[]
      const boxes = kids.map((el) => {
        const box = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        const fill = style.backgroundColor.match(/[\d.]+/g)!.map(Number)
        return { el, top: box.top, bottom: box.bottom, opacity: Number(style.opacity), z: style.zIndex === 'auto' ? 0 : Number(style.zIndex), solid: (fill[3] ?? 1) === 1 }
      })
      if (t === 0) for (const b of boxes) if (b.el.dataset.rep) starts[b.el.dataset.rep] = b.top - top
      boxes.forEach((a, i) =>
        boxes.slice(i + 1).forEach((b) => {
          if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) < 1 || a.opacity < 0.02 || b.opacity < 0.02) return
          // Higher z-index on top; the same, the later row.
          const over = a.z > b.z ? a : b
          if (over.opacity < 0.99 || !over.solid) frames.push(`${t}ms: ${over.el.dataset.rep ?? over.el.className} shows through`)
        }),
      )
    }
    anims.forEach((a) => a.finish())
    return { count: anims.length, frames, starts }
  })
  expect(slide.count).toBeGreaterThan(0)
  expect(slide.frames).toEqual([])
  const moved = Object.keys(before).filter((id) => id in slide.starts)
  expect(moved.length).toBeGreaterThan(3)
  for (const id of moved) expect(Math.abs(slide.starts[id] - before[id]), `${id} starts off its old spot`).toBeLessThan(0.5)
  await expect(hannah.locator('.board__status')).toHaveText('4 to go')
  expect(await rows.count()).toBeLessThanOrEqual(25)

  // The other four take you over the line, alone at the top, and the
  // board stays short.
  for (const name of ['Supplier training', 'Supplier fair', 'Hub course', 'Quota']) await recordButton(page, name).click()
  await expect(hannah.locator('.board__status')).toHaveText('Qualified')
  await expect(hannah.locator('.board__rank')).toHaveText('1')
  await expect(page.locator('.figures__value').nth(0)).toHaveText('1')
  expect(await page.locator('.board__cut').evaluate((el) => (el.previousElementSibling as HTMLElement | null)?.dataset.rep)).toBe('hannah-kowalski')
  expect(await rows.count()).toBeLessThanOrEqual(25)
})

// At 600 reps a tie fills the podium. See all draws the whole tie on the
// short board, as if Show more had opened just that run, and the gap rows
// still count everyone else. What it opens stays open through a search and
// Record, and folds up when the team filter changes, the same as a gap.
test('a 600 rep podium counts its tie and See all opens all of it', async ({ page }) => {
  await useSixHundred(page)
  const steps = page.locator('.podium__step')
  const tied = (rank: string) => page.locator('[data-rep]').filter({ has: page.locator('.board__rank', { hasText: new RegExp(`^Tied ${rank}$`) }) })

  // Jordan and his nine copies share 1st, which the short board's top ten
  // already shows. One step for all of them, across the podium.
  await page.goto('./#/standings')
  await expect(page.getByRole('heading', { name: 'Tied at the top', exact: true })).toBeVisible()
  await expect(steps).toHaveCount(1)
  await expect(steps).toHaveClass(/podium__step--all/)
  await expect(steps.locator('.podium__rank')).toHaveText('Rank T1')
  await expect(steps.locator('.podium__count')).toHaveText('10 reps tied for 1st')
  await expect(steps.locator('.podium__meta')).toHaveText('POSB')
  await expect(steps.locator('.podium__rate')).toHaveText('3 of 5 minimums met, · 19 stamps')
  await expect(page.locator('.podium__name')).toHaveCount(0)
  const seeAll = page.getByRole('button', { name: 'See all 10 reps tied for 1st' })
  await expect(seeAll).toHaveText('See all 10')
  const apart = await seeAllBesideScore(steps)
  expect(apart.gap, 'See all is next to the score').toBeLessThan(40)
  expect(apart.line, 'See all is on the score’s line').toBeLessThan(2)

  // From the keyboard, then a tap on the step's corner. Either way focus
  // lands on the first of the tie, its row at the top of the screen.
  await seeAll.focus()
  await page.keyboard.press('Enter')
  await expect(tied('T1')).toHaveCount(10)
  await expect(tied('T1').first().locator('.board__link')).toBeFocused()
  await landed(tied('T1').first())
  await page.getByLabel('Search by name').focus()
  await page.evaluate(() => scrollTo(0, 0))
  const box = (await steps.boundingBox())!
  await steps.click({ position: { x: box.width - 12, y: 12 } })
  await expect(tied('T1').first().locator('.board__link')).toBeFocused()
  await landed(tied('T1').first())
  expect(await accounted(page)).toMatchObject({ total: 600, wrong: [] })

  // Twenty NetSec reps share 31st. The short board shows the top ten, with
  // the rest of the tie folded into a gap. See all draws every one of them.
  await page.locator('label[for="team-netsec"]').click()
  await expect(page.getByRole('heading', { name: 'Tied at the top in NetSec' })).toBeVisible()
  await expect(steps.locator('.podium__count')).toHaveText('20 reps tied for 31st')
  await expect(page.locator('.board__gap')).not.toHaveCount(0)
  expect((await accounted(page)).gaps[0]).toBe(10)
  expect(await tied('T31').count()).toBeLessThan(20)
  await page.getByRole('button', { name: 'See all 20 reps tied for 31st' }).click()
  await expect(tied('T31')).toHaveCount(20)
  const drawnFirst = await page.locator('.board tbody > tr[data-rep]').evaluateAll((els) => els.slice(0, 20).every((el) => el.querySelector('.board__rank')?.textContent === 'Tied T31'))
  expect(drawnFirst, 'the tie is the top 20 reps, together').toBe(true)
  await expect(tied('T31').first().locator('.board__link')).toBeFocused()
  await landed(tied('T31').first())
  const opened = await accounted(page)
  expect(opened).toMatchObject({ total: 120, wrong: [] })
  expect(opened.gaps.every((at) => at >= 20), 'no gap inside the tie').toBe(true)
  await expect(page.getByRole('table', { name: /^Standings/ })).toHaveAccessibleDescription(new RegExp(`^Showing ${await page.locator('[data-rep]').count()} of 120 reps\\.`))

  // Still open after a search and Clear search.
  const search = page.getByLabel('Search by name')
  await search.fill('a')
  await expect(page.locator('.board__gap')).toHaveCount(0)
  await search.fill('')
  await expect(tied('T31')).toHaveCount(20)

  // And after Record, which reshuffles the tie: the same 20 places stay drawn.
  await demo(page).click()
  await recordButton(page, 'Club Express').click()
  await expect(steps.locator('.podium__count')).not.toHaveText('20 reps tied for 31st')
  await page.keyboard.press('Escape')
  const recorded = await accounted(page)
  expect(recorded).toMatchObject({ total: 120, wrong: [] })
  expect(recorded.gaps.every((at) => at >= 20), 'the 20 places stay open').toBe(true)

  // Another team folds it back up.
  await page.locator('label[for="team-all"]').click()
  await page.locator('label[for="team-netsec"]').click()
  await expect(page.locator('.board__gap').first()).toBeVisible()
  expect((await accounted(page)).gaps[0]).toBe(10)
})

test('the app still works when storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
  })
  await page.goto('./#/standings')
  await expect(page.getByRole('heading', { name: 'Standings' })).toBeVisible()
  await demo(page).click()
  await expect(page.getByText('This browser is blocking storage')).toBeVisible()
  await recordButton(page, 'Club Express').click()
  await expect(page.locator('.figures__value').nth(1)).toHaveText('18')
  await expect(page.locator('.figures__value').nth(0)).toHaveText('0')
  await expect(recordButton(page, 'Club Express')).toBeDisabled()
})

// Keyboard and screen reader basics. The arrow keys turn pages even after
// the demo panel's buttons and select, focus never drops to the page body
// (Open passport, either end of the book, a checklist row, Record, Undo,
// Escape, a new screen), every screen has its own title, and the slip opens
// on its title.
test('keyboard focus stays put and the arrows always turn pages', async ({ page }, info) => {
  const phone = info.project.name.startsWith('phone')
  const lost = () => page.evaluate(() => !document.activeElement || document.activeElement === document.body)

  await page.goto('./#/passport/hannah-kowalski')
  await expect(page).toHaveTitle('Hannah Kowalski’s passport · President’s Club 2027')
  await page.getByRole('button', { name: 'Open passport' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/page=2/)
  // The cover leaves the moment the turn starts. Then wait for it to land.
  await expect(shown(page).locator('.cover')).toHaveCount(0)
  await still(page)
  expect(await lost(), 'focus dropped after Open passport').toBe(false)

  // The machine-readable strip reads as its label, not 88 chevrons.
  await expect(shown(page).getByRole('img', { name: 'Machine-readable zone for Hannah Kowalski' })).toBeVisible()

  // Preview a data state, go back to live data, then turn with the arrows.
  await demo(page).click()
  await page.getByRole('button', { name: 'Loading', exact: true }).click()
  const live = page.getByRole('button', { name: 'Live data' })
  await live.click()
  await expect(live).toHaveAttribute('aria-pressed', 'true')
  await live.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/page=3/)
  await expect(live).toHaveAttribute('aria-pressed', 'true')
  // The URL changes before the book does, so wait for the label too.
  await expect(where(page)).toHaveText(phone ? 'Supplier trainings, page 3 of 8' : 'Pages 3 and 4 of 8')
  await still(page)

  // Same from the View as select: the page turns and the rep stays.
  const viewAs = page.locator('#view-as')
  await viewAs.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(/page=2/)
  await expect(viewAs).toHaveValue('hannah-kowalski')
  await expect(where(page)).toHaveText(phone ? 'Data page, page 2 of 8' : 'Pages 1 and 2 of 8')
  await still(page)

  // And from a Record button, without recording anything.
  await recordButton(page, 'Hub course').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/page=3/)
  await expect(where(page)).toHaveText(phone ? 'Supplier trainings, page 3 of 8' : 'Pages 3 and 4 of 8')
  await expect(recordButton(page, 'Hub course')).toBeEnabled()
  await still(page)

  // Escape from inside the panel hands focus back to the Demo button.
  await page.keyboard.press('Escape')
  await expect(page.locator('#demo-panel')).toBeHidden()
  await expect(demo(page)).toBeFocused()

  // Back to the front from the back cover, then Previous page at the front:
  // focus lands on the book, then stays on the button that can't go further.
  await page.goto('./#/passport/hannah-kowalski?page=9')
  await page.getByRole('button', { name: 'Back to the front' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/hannah-kowalski$/)
  await expect(shown(page).locator('.cover--back')).toHaveCount(0)
  await still(page)
  expect(await lost(), 'focus dropped after Back to the front').toBe(false)
  await prev(page).focus()
  await page.keyboard.press('Enter')
  await expect(prev(page)).toBeFocused()
  await expect(prev(page)).toBeDisabled()

  // A checklist row turns to its page from the keyboard too.
  await page.goto('./#/passport/hannah-kowalski?page=7')
  await still(page)
  await sheet(page, 'President’s Club checklist').getByRole('button', { name: /^Hub training: 1 of 2\./ }).focus()
  await page.keyboard.press('Enter')
  await expect(sheet(page, 'Hub training')).toBeVisible()
  await still(page)
  expect(await lost(), 'focus dropped after a checklist row').toBe(false)

  // A new screen gets its own title and focus moves to the top of it.
  await page.getByRole('link', { name: 'Standings' }).click()
  await expect(page).toHaveTitle('Standings · President’s Club 2027')
  await expect(page.locator('#main')).toBeFocused()
  const search = page.getByLabel('Search by name')
  await search.fill('zzz')
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(search).toBeFocused()
  await page.getByRole('link', { name: 'Jordan Hale' }).first().click()
  await expect(page).toHaveTitle('Jordan Hale’s passport · President’s Club 2027')
  await expect(page.locator('#main')).toBeFocused()

  // The slip opens on its heading, so it starts at the top.
  await page.goto('./#/passport/hannah-kowalski?page=3')
  await shown(page).getByRole('button', { name: /^Zebra solutions workshop, September 23, 2026/ }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Zebra' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()

  // Record and Undo keep focus in the panel.
  await demo(page).click()
  const record = recordButton(page, 'Supplier training')
  await record.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /^Pioneer solutions workshop, June 17, 2027, in person\./ })).toBeVisible()
  await expect(record).toBeDisabled()
  await expect(record).toBeFocused()
  // A used-up button stays put under Enter, focus included.
  await page.keyboard.press('Enter')
  await expect(record).toBeFocused()
  await page.getByRole('button', { name: 'Reset demo' }).click()
  await page.getByRole('button', { name: 'Undo' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Reset demo' })).toBeFocused()
  await expect(record).toBeDisabled()
})

// Grab-to-tilt. With a mouse, drag the cover: it tilts, the foil lights up,
// the President's Club seal pressed into it too, and when you let go it settles flat
// with nothing left behind. The drag isn't a click, but a click after it
// still opens the passport, and the laminate on the inside cover and the
// data page lights up the same way without moving anything, under one light
// across the spread. On a phone (Chrome only, since it needs real touch
// input), hold, wobble a pixel the way a resting finger does, then drag up:
// it stays held and the page doesn't scroll. A still tap that's a little
// slow still opens a stamp.
test('the passport can be picked up and tilted', async ({ page, browserName }, info) => {
  const phone = info.project.name.startsWith('phone')
  test.skip(phone && browserName !== 'chromium', 'real touch input needs Chrome')
  const stage = page.locator('.passport__stage')
  const settled = async () => {
    await expect(stage).not.toHaveClass(/is-lit/, { timeout: 4000 })
    expect(await stage.evaluate((el) => el.style.transform)).toBe('')
    expect(await page.locator('.book__slot .foil, .book__slot .cover__mark, .book__slot .laminate__light').evaluateAll((els) => els.map((el) => (el as HTMLElement).style.length))).not.toContain(3)
  }
  const shine = (el: Locator) => el.evaluate((node) => Number((node as HTMLElement).style.getPropertyValue('--shine')))

  if (!phone) {
    // Hannah has all five already, so her cover carries the seal.
    const all = Object.fromEntries(ACTIVITIES.map((a) => [a, ['hannah.kowalski@example.com']]))
    await page.addInitScript(([key, recorded]) => localStorage.setItem(key, JSON.stringify({ recorded })), [STORAGE_KEY, all] as const)
    await page.goto('./')
    const cover = shown(page).locator('.cover')
    await expect(cover).toBeVisible()
    await expect(cover).toHaveClass(/is-sealed/)
    const box = (await cover.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 80, y + 20, { steps: 8 })
    await expect(stage).toHaveClass(/is-held/)
    await expect.poll(() => stage.evaluate((el) => el.style.transform)).toContain('rotateY')
    await expect.poll(() => shine(shown(page).locator('.cover__year'))).toBeGreaterThan(0.5)
    await expect.poll(() => shine(shown(page).locator('.cover__seal .cover__mark'))).toBeGreaterThan(0.5)
    await page.mouse.up()
    await settled()
    await expect(page).toHaveURL(/#\/passport\/hannah-kowalski$/)
    await page.mouse.click(x, y)
    await expect(page).toHaveURL(/page=2/)

    // The laminate on the inside cover and the data page lights up the same
    // way. It's paint only: the pages keep their size, the film never takes
    // a click, and a drag across the page doesn't turn it. Each page draws
    // the same band in a box centred on it, so at rest both boxes centre on
    // the spine: one band across the spread, not two.
    const data = shown(page).locator('.page--data')
    const notes = shown(page).locator('.page--notes')
    await expect(data).toBeVisible()
    await expect(notes).toBeVisible()
    const size = () => [data, notes].map((p) => p.evaluate((el) => [(el as HTMLElement).offsetWidth, (el as HTMLElement).offsetHeight]))
    const flat = await Promise.all(size())
    const lights = shown(page).locator('.laminate__light')
    await expect(lights).toHaveCount(2)
    expect(await shown(page).locator('.laminate').evaluateAll((els) => els.map((el) => getComputedStyle(el).pointerEvents))).toEqual(['none', 'none'])
    // Measured in one go, so the book sliding open can't skew it.
    const { spine, centres } = await stage.evaluate((el) => {
      const box = (node: Element) => node.getBoundingClientRect()
      const [left, right] = [box(el.querySelector('.book__slot .page--notes')!), box(el.querySelector('.book__slot .page--data')!)]
      return { spine: (left.right + right.left) / 2, centres: [...el.querySelectorAll('.book__slot .laminate__light')].map((n) => box(n).left + box(n).width / 2) }
    })
    for (const centre of centres) expect(Math.abs(centre - spine)).toBeLessThanOrEqual(2)
    const d = (await data.boundingBox())!
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2)
    await page.mouse.down()
    await page.mouse.move(d.x + d.width / 2 - 80, d.y + d.height / 2 + 20, { steps: 8 })
    await expect(stage).toHaveClass(/is-held/)
    for (const p of [data, notes]) await expect.poll(() => shine(p.locator('.laminate__light'))).toBeGreaterThan(0.5)
    expect(await Promise.all(size())).toEqual(flat)
    await page.mouse.up()
    await settled()
    await expect(page).toHaveURL(/page=2/)
    return
  }

  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await page.goto('./#/passport/hannah-kowalski?page=3')
  const slot = shown(page).getByRole('button', { name: /^Zebra solutions workshop, September 23, 2026/ })
  await expect(slot).toBeVisible()
  const box = (await slot.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await touch('touchStart', x, y)
  await page.waitForTimeout(100)
  await touch('touchMove', x + 1, y)
  await page.waitForTimeout(400)
  for (let i = 1; i <= 10; i++) await touch('touchMove', x + 1, y - i * 12)
  await expect(stage).toHaveClass(/is-held/)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await touch('touchEnd')
  await settled()
  await expect(page.getByRole('dialog')).toBeHidden()

  // Lift the finger right after the book is picked up, still without moving.
  await touch('touchStart', x, y)
  await page.waitForFunction(() => document.querySelector('.passport__stage')!.classList.contains('is-held'), null, { polling: 'raf' })
  await touch('touchEnd')
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Zebra' })).toBeVisible()
})

// Phones only. Every page of two passports (the default rep and the new
// hire) fits on its paper, the paper fits on the screen under the top bar,
// and the turn buttons are on screen without covering any of it, on a 390
// phone and an iPhone 16 Pro Max in Safari. An iPhone SE is too short for
// all that, so there the bar sits under the page instead of over it, and
// every page still fits its paper. Recording mustn't make the book grow,
// whichever button, whether the stamp lands in a slot (Hannah) or in a full
// page's Also attended list (Jordan), and the gold seal and the QUALIFIED
// stamp keep their room too.
test('every passport page fits on a phone screen', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('phone'), 'phones only')
  // Sixty pages to measure and ten stamp moments.
  test.slow()

  const measure = async (rep: string, p: number) => {
    await page.goto(`./#/passport/${rep}${p ? `?page=${p}` : ''}`)
    await expect(shown(page).locator('.page').first()).toBeVisible()
    await still(page)
    await page.evaluate(() => document.fonts.ready)
    return page.evaluate(() => {
      const sheet = document.querySelector('.book__slot .page')!
      const box = sheet.getBoundingClientRect()
      // A shut Also attended list still lays out its rows, unseen, so only
      // what's drawn counts.
      const spill = [...sheet.querySelectorAll('*')]
        .filter((el) => el.checkVisibility())
        .map((el) => ({ el, b: el.getBoundingClientRect() }))
        .filter(({ b }) => b.height > 0 && b.bottom > box.bottom + 1)
        .map(({ el }) => el.className.toString())
      const controls = document.querySelector('.passport__controls')!.getBoundingClientRect()
      return { spill, bottom: box.bottom, vh: window.innerHeight, controls: controls.bottom, controlsTop: controls.top, book: document.querySelector('.book')!.getBoundingClientRect().height }
    })
  }
  const check = async (label: string, rep: string, p: number, onScreen = true) => {
    const r = await measure(rep, p)
    expect(r.spill, `${label} ${rep} page ${p}: content runs past the bottom of the page`).toEqual([])
    expect(r.controlsTop, `${label} ${rep} page ${p}: the turn buttons cover the foot of the page`).toBeGreaterThanOrEqual(r.bottom - 0.5)
    if (onScreen) {
      expect(r.bottom, `${label} ${rep} page ${p}: the page runs past the bottom of the screen`).toBeLessThanOrEqual(r.vh)
      expect(r.controls, `${label} ${rep} page ${p}: the turn buttons are off screen`).toBeLessThanOrEqual(r.vh + 1)
    }
    return r.book
  }

  const size = page.viewportSize()!
  for (const [width, height] of [[size.width, size.height], [440, 763], [375, 667]]) {
    await page.setViewportSize({ width, height })
    for (const rep of ['hannah-kowalski', 'clara-dubois']) {
      for (let p = 0; p <= 9; p++) await check(`${width}x${height}`, rep, p, height > 667)
    }
  }
  await page.setViewportSize(size)

  const label = `${size.width}x${size.height}`
  for (const rep of ['hannah-kowalski', 'jordan-hale']) {
    const before = await check(label, rep, 2)
    for (const [name, p] of RECORDS) {
      await demo(page).click()
      await recordButton(page, name).click()
      await expect(page).toHaveURL(new RegExp(`page=${p}$`))
      await page.getByRole('button', { name: 'Hide demo' }).click()
      await expect(page.locator('.stamper, .seal-press')).toHaveCount(0, { timeout: 5000 })
      await expect(shown(page).getByRole('status')).toContainText(name === 'Quota' ? 'Sealed' : 'Stamped')
      expect(await check(label, rep, p), `${rep}: ${name} made the book grow`).toBeLessThanOrEqual(before + 0.5)
    }
    expect(await check(label, rep, 7), `${rep}: qualifying made the book grow`).toBeLessThanOrEqual(before + 0.5)
    await demo(page).click()
    await page.getByRole('button', { name: 'Reset demo' }).click()
    await page.getByRole('button', { name: 'Hide demo' }).click()
  }
})

// Laptops and projectors. On a short wide window the book scales down so the
// picker, the whole spread with its page numbers, the label and both arrows
// fit with no scrolling. Under the scale a click still opens the cover, the
// arrows still turn, a recorded stamp still lands on its slot and the gold
// seal still lands on its page.
test('a spread fits a short laptop or projector screen', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('phone'), 'wide screens only')

  const fits = async (label: string) => {
    await page.evaluate(() => document.fonts.ready)
    const r = await page.evaluate(() => {
      const box = (el: Element | null) => el?.getBoundingClientRect()
      const bottoms = [...document.querySelectorAll('.book__slot .page, .book__slot .page__folio, .passport__where')].map((el) => box(el)!.bottom)
      const arrows = [...document.querySelectorAll('.passport__turn')].map((el) => box(el)!)
      return {
        vh: window.innerHeight,
        scroll: document.documentElement.scrollHeight - window.innerHeight,
        lowest: Math.max(...bottoms),
        picker: box(document.getElementById('passport-of'))!.top,
        arrows: arrows.every((b) => b.top >= 0 && b.bottom <= window.innerHeight && b.left >= 0 && b.right <= window.innerWidth),
      }
    })
    expect(r.lowest, `${label}: the spread or its label runs off the bottom`).toBeLessThanOrEqual(r.vh)
    expect(r.scroll, `${label}: the page scrolls`).toBeLessThanOrEqual(0)
    expect(r.picker, `${label}: the picker is off the top`).toBeGreaterThanOrEqual(0)
    expect(r.arrows, `${label}: an arrow is off screen`).toBe(true)
  }

  for (const [width, height] of [[1280, 720], [1280, 610], [1366, 768], [1536, 730], [1440, 790], [1536, 864]]) {
    await page.setViewportSize({ width, height })
    for (const p of [0, 2, 3, 5, 7, 9]) {
      await page.goto(`./#/passport/hannah-kowalski${p ? `?page=${p}` : ''}`)
      await expect(shown(page).locator('.page').first()).toBeVisible()
      await still(page)
      await fits(`${width}x${height} page ${p}`)
    }
  }

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('./')
  const cover = shown(page).locator('.cover')
  const c = (await cover.boundingBox())!
  await page.mouse.click(c.x + c.width / 2, c.y + c.height * 0.3)
  await expect(page).toHaveURL(/page=2/)
  await expect(where(page)).toHaveText('Pages 1 and 2 of 8')
  await still(page)
  await next(page).click()
  await expect(where(page)).toHaveText('Pages 3 and 4 of 8')
  await demo(page).click()
  await recordButton(page, 'Supplier training').click()
  await expect(page.getByRole('button', { name: /^Pioneer solutions workshop, June 17, 2027, in person\./ })).toBeVisible()
  await expect(sheet(page, 'Supplier trainings').locator('.visa__endorse')).toContainText('Stamped')
  await recordButton(page, 'Quota').click()
  await expect(where(page)).toHaveText('Pages 7 and 8 of 8')
  await expect(sheet(page, 'Quota seal').getByRole('img', { name: /^Gold seal/ })).toBeVisible()
  await expect(page.locator('.seal-press')).toHaveCount(0, { timeout: 5000 })
  await page.getByRole('button', { name: 'Hide demo' }).click()
  await fits('1280x720 after the seal')
})

// The Passport of picker opens anyone's passport on the page you're on. It
// doesn't change who you are: the Passport tab and View as still point at you.
test('the picker opens another rep on the same page', async ({ page }, info) => {
  const phone = info.project.name.startsWith('phone')
  await page.goto('./#/passport/hannah-kowalski?page=3')
  const picker = page.getByLabel('Passport of')
  await expect(picker).toHaveValue('hannah-kowalski')
  await expect(picker.locator('optgroup')).toHaveCount(5)
  await expect(picker.locator('option')).toHaveCount(60)
  const before = await where(page).textContent()

  await picker.selectOption('jordan-hale')
  await expect(page).toHaveURL(/#\/passport\/jordan-hale\?page=3$/)
  await expect(picker).toHaveValue('jordan-hale')
  await expect(where(page)).toHaveText(before!)
  await still(page)
  await expect(sheet(page, 'Supplier trainings').locator('.activity__summary')).toHaveText('Also attended 7')

  await expect(page.getByRole('link', { name: 'Passport', exact: true })).toHaveAttribute('href', '#/passport/hannah-kowalski')
  await demo(page).click()
  await expect(page.locator('#view-as')).toHaveValue('hannah-kowalski')
  // Record stamps the passport that's open, so it names Jordan.
  await expect(page.locator('#record-title')).toHaveText('Record a stamp for Jordan')

  // On a phone it lives in the page bar, so it adds no height.
  if (phone) {
    const bar = (await page.locator('.passport__controls').boundingBox())!
    const box = (await picker.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(bar.y)
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y + bar.height)
  }
})

// Pinched in on a phone, a sideways drag pans across the page instead of
// turning it. Chrome only, since it needs real touch input.
test('a pinched-in page pans instead of turning', async ({ page, browserName }, info) => {
  test.skip(!info.project.name.startsWith('phone') || browserName !== 'chromium', 'real touch input needs Chrome')
  await page.goto('./#/passport/hannah-kowalski?page=3')
  await expect(shown(page).locator('.page').first()).toBeVisible()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.synthesizePinchGesture', { x: 195, y: 400, scaleFactor: 1.8, relativeSpeed: 600, gestureSourceType: 'touch' })
  await expect(page.locator('.passport')).toHaveClass(/is-zoomed/)
  const left = await page.evaluate(() => window.visualViewport!.offsetLeft)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', 300, 300)
  for (let i = 1; i <= 10; i++) await touch('touchMove', 300 - i * 20, 302)
  await touch('touchEnd')
  await expect.poll(() => page.evaluate(() => window.visualViewport!.offsetLeft)).toBeGreaterThan(left + 20)
  await page.waitForTimeout(400)
  await expect(page).toHaveURL(/page=3$/)
})
