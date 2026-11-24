# Best time to post: X, LinkedIn, Telegram

Research for the automatic-timing redesign (FR-16, FR-33, FR-34, FR-45). Sources accessed 24 Nov 2026.
Numbers in square brackets point to the source list at the end.

## Summary

- **X:** the two big 2026 studies disagree on the hour. Buffer (8.7M posts) says about 09:00 local, fading after early afternoon [4]. Sprout (about 2B engagements) says 12:00–18:00 local, Tuesday to Thursday [2]. Both agree that weekdays win, Saturday is worst and evenings are weak.
- **LinkedIn:** three studies, three answers. Sprout 2026 says 11:00–17:00 [3]. Buffer 2026 (4.8M posts) says 15:00–20:00 [5]. Hootsuite (Q4 2024 data) says 08:00–09:00 [6]. They agree on weekdays (Tue–Thu best) and weak weekends.
- **Telegram:** there is no large, published, method-disclosed study of best posting times. The vendor pages we found give no sample or method. We seed a labelled ASSUMPTION and let the user's own data replace it (FR-34).
- **Regions (DataReportal, Oct 2026 ad audiences):** X is 33% Americas, 14% Europe, 15% Africa + Middle East, 37% Asia-Pacific [8]. LinkedIn is 38% Americas, 19% Europe, 12% Africa + Middle East, 31% Asia-Pacific [7].
- **Telegram regions:** no country or region MAU split is published by Telegram or DataReportal. The only first-party split is for 25M new sign-ups in Jan 2021 (Asia 38%, Europe 27%, Latin America 21%, MENA 8%) [11]. We use it as a labelled ASSUMPTION.
- **Audience types:** Sprout's industry splits show tech and finance audiences sit inside working hours. Its "Education & Schools" audience on X is the exception: evenings and weekends, worst during school hours [2]. No source covers "creatives".
- **Biggest change to the seed:** the audience curve should be a *ratio* against the general curve, not a second absolute activity curve, or work-hour peaks get counted twice.

## 1. Per-platform findings

All three vendors analyse **their own customers' posts**. That is brands and creators using a scheduling tool, not a random sample of users. They measure engagement on posts sent at an hour, not when readers are online. Nobody publishes the numeric hour-by-hour values behind their heatmaps, so every 24-value curve below is **derived** by us from the published peaks and descriptions.

### Study methods

| Study | Published | Sample | Metric | Time zone handling |
|---|---|---|---|---|
| Sprout Social 2026 [1][2][3] | 31 Mar 2026 | ~2B engagements, ~307,000 profiles, 30,000+ Sprout customers, 27 Nov 2025 – 27 Feb 2026, six networks | Engagements (reactions, comments, shares, DMs, link clicks) | "Local time", not one hub zone |
| Buffer X 2026 [4] | 13 Mar 2026 | 8.7M+ posts sent through Buffer (page header also says "1 Million", a mismatch) | Engagement rate | "Consider all the recommendations local time"; method not explained |
| Buffer LinkedIn 2026 [5] | 9 Sep 2026 | 4.8M+ posts sent through Buffer | Engagement (reactions, comments, reposts) | "Normalized by local time zone" |
| Hootsuite LinkedIn [6] | Nov 2025 (data Q4 2024) | "over 1 million social posts", with Critical Truth | Engagement | Localised across 118 countries |

### X (Twitter)

**Buffer 2026 [4]** (vendor customer data):
- Best slot: Tuesday 09:00. Then Wednesday 10:00, Wednesday 09:00.
- Every weekday's #1 is 09:00 or 10:00; #2 and #3 are 08:00–11:00. Weekends too.
- Shape: picks up early morning, peaks about 09:00, tapers in early afternoon. 18:00–23:00 is worst on every day.
- Days: Wednesday best, then Tuesday, then Thursday. Saturday worst, Friday second worst.

**Sprout Social 2026 [2]** (vendor customer data):
- Monday 14:00–15:00 and 17:00. Tuesday–Thursday 12:00–18:00 (peak). Friday 12:00–18:00 (moderate). Sunday 14:00–18:00 (moderate). Saturday: avoid (lowest).
- Early mornings are among the worst times.

**Disagreement:** Buffer peaks at 09:00 and calls early afternoon a decline. Sprout calls early mornings bad and peaks 12:00–18:00. They agree on: weekdays over weekends, Saturday lowest, Tue–Thu strongest, late evening and night weak. A blended curve with a broad 09:00–16:00 plateau respects both.

### LinkedIn

**Sprout Social 2026 [3]:** Monday 13:00–14:00. Tuesday 11:00–17:00. Wednesday 11:00–16:00. Thursday 11:00 and 13:00–17:00. Friday 11:00 and 13:00–14:00. Weekends worst. (Its FAQ says engagement drops after 14:00, which conflicts with its own table.)

**Buffer 2026 [5]:** best window 15:00–20:00 on weekdays; top slots Wednesday 16:00, Friday 15:00, Friday 16:00. Mornings (06:00–11:00) lower. Wednesday best, then Thursday, then Friday; Monday lowest, Tuesday close behind. Buffer says its 2025 data peaked inside working hours and fell after 17:00; the 2026 peak moved later.

**Hootsuite (Q4 2024 data) [6]:** headline 08:00–09:00 Tue/Wed, but the body says 04:00–06:00 Tue/Wed. Per day: Mon 11:00, Tue 06:00–08:00, Wed 09:00, Thu 14:00, Fri 20:00. Internally inconsistent and the oldest data; lowest weight.

**Disagreement:** a three-way split (morning / midday-afternoon / late afternoon-evening). The middle of the day (11:00–16:00) is the overlap of Sprout and Buffer and is the safe default. All agree on Tue–Thu and weak weekends; Buffer alone ranks Monday lowest.

### Telegram

See section 4. No study meeting the bar exists.

## 2. Worldwide audience by region

Source: DataReportal "essential stats" pages, data **October 2026**, page updated 5 Nov 2026 [7][8]. These are **ad-audience** figures from each platform's own ad tools. X's figure is ad reach (433M). LinkedIn's is **registered members** (1.55B), not active users, so it overstates places where many dormant accounts exist (DataReportal warns about both). We group DataReportal's UN sub-regions into four:

| Region | X share | LinkedIn share | Sub-regions counted |
|---|---|---|---|
| Americas | 32.8% | 37.8% | Northern, Central, Southern America, Caribbean |
| Europe | 14.4% | 18.9% | Western, Northern, Southern, Eastern Europe |
| Africa + Middle East | 15.4% | 12.3% | All five African regions + Western Asia |
| Asia-Pacific | 37.3% | 30.9% | Central, Southern, South-Eastern, Eastern Asia, Oceania |

Sub-region detail (share of global):

| Sub-region | X [8] | LinkedIn [7] |
|---|---|---|
| Northern America | 19.2% | 21.5% |
| Central America + Caribbean | 4.8% | 3.4% |
| Southern America | 8.8% | 12.9% |
| Europe (all) | 14.4% | 18.9% |
| Western Asia (Middle East, Turkey) | 9.6% | 4.8% |
| Africa (all) | 5.8% | 7.5% |
| Southern + Central Asia | 6.6% | 16.7% |
| South-Eastern Asia | 11.8% | 7.3% |
| Eastern Asia | 17.8% | 5.3% |
| Oceania | 1.1% | 1.6% |

**Top countries.**
- X (ad audience, Oct 2026) [8]: US 77.3M, Japan 54.8M, India 22.9M, Indonesia 20.1M, Brazil 18.6M, Turkey 16.6M, Mexico 15.5M, UK 15.2M, Saudi Arabia 13.5M, Thailand 11.8M.
- LinkedIn (registered members, Oct 2026) [7]: US 300M, India 210M, Brazil 110M, China 59M, UK 53M, Indonesia 45M, France 43M, Mexico 35M, Canada 32M, Italy 29M.

Note: Asia-Pacific is not one clock. X's Asian audience is mostly Japan (UTC+9) and South-East Asia (UTC+7); LinkedIn's is mostly India (UTC+5:30). That is why the seed below uses sub-regions, not four rows.

**Telegram:** Telegram reports only a global total: over 1 billion MAU, announced by Durov on 19 Mar 2025 [10] (700M in June 2022 [12], with no regional split). DataReportal has no Telegram country page (404) and its Digital 2026 global overview gives no Telegram country figures [9]. Country user counts on stats blogs (for example "India 104M") have no traceable primary source. The only first-party regional split is Durov's Jan 2021 post: of 25M sign-ups in 72 hours, 38% Asia, 27% Europe, 21% Latin America, 8% MENA [11]. That is new users in one week, not the user base.

## 3. Does timing differ by audience type?

Yes, but the evidence is thin and only comes from industry splits of brand accounts. These describe when an industry's *posts* do well, which is a proxy for when its audience reads.

**Sprout 2026, X by industry [2]:**
- Software & Tech: Tue–Thu 11:00–16:00, Fri 11:00–13:00; weekends worst.
- Financial Services: Tue 08:00 and 10:00–13:00, Wed 08:00–13:00, Thu 09:00–17:00; weekends worst.
- Government, Nonprofits: Tue–Thu, roughly 09:00–18:00; weekends worst.
- **Education & Schools: Saturday and Sunday best.** Mon 18:00, Tue 19:00–21:00, Wed 18:00 and 21:00, Sat 13:00–23:00, Sun 12:00–18:00. **Worst: weekdays 09:00–17:00.**

**Sprout 2026, LinkedIn by industry [3]:**
- Technology & Software: Mon 12:00–13:00, Tue 10:00–14:00, Wed 10:00–16:00, Thu 10:00–15:00, Fri 11:00–13:00 and 15:00.
- Financial Services: earlier: Wed and Thu from 08:00, mostly 08:00–15:00.
- Education & Schools: Tue 10:00–17:00, Wed 11:00–16:00, Thu 10:00–16:00 (here education looks like other office work: LinkedIn readers of schools are staff and parents, not students).

**Hootsuite LinkedIn by industry (Q4 2024) [6]:** Technology Mon 11:00; Education Wed 09:00, Fri 11:00–13:00; Financial services Mon 17:00, Wed 13:00, Thu 17:00–19:00. Few slots, and they conflict with Sprout on finance.

**Developer proxy (labelled: old data, site visits, not social posts):**
- Stack Overflow visits by local hour, Aug 2016 [14]: at least 1M visits an hour from 09:00 to 17:00, a dip around 12:00, a bit more traffic in the afternoon than the morning. Some communities (C, Haskell) stay active in the evening; Haskell gets only half its visits in 9–5.
- Stack Overflow 2021 traffic [15]: 85% of traffic is Monday–Friday; 64% more questions on a weekday than a weekend day.
- So developers look like office workers with an afternoon lean and a weekday lean, plus a modest evening tail. Nothing supports the current seed's claim that 20:00–22:00 is developers' best time.

**Creatives / design:** no source with data. ASSUMPTION only.

## 4. Telegram channel post timing

- **No reliable public study.** We found no TGStat or Telemetr research with sample, method and results by hour. A 2019 TGStat chart of *when channels publish* is cited second-hand and is out of date. Vendor guides (Postmypost Apr 2025 [17], SMMplanner Sep 2025 [16], Schedulala, timetopost.co) give windows such as 08:00–10:00 and 18:00–22:00, but disclose no sample, method or metric. SMMplanner calls its hours "a starting hypothesis". These are opinions, not data.
- **Telegram's own data exists per channel only.** The channel statistics API has a `top_hours_graph` (views by hour) for channels above a server-side size limit [13]. It is in the MTProto user API for admins, not the Bot API, so our bot cannot read it. A channel owner can see it in the app.
- **Why the shape probably differs from X/LinkedIn:** Telegram is a messenger; channel posts arrive as notifications and are read through the day and evening, including weekends (Durov reports 21 opens and 41 minutes a day [10]). Vendor guides agree on two peaks (morning commute, evening). That is plausible, not proven.
- **Proposed labelled assumption:** two peaks, 08:00–10:00 and 18:00–21:00 local, lunch shoulder, low 01:00–06:00; weekdays a little above weekends; replaced by the user's own posts once they have 50 with reactions (FR-34). Because Telegram audiences are often one-country (and the redesign switches to local time for local-script channels), regional spread matters less here than on X or LinkedIn.

## 5. How this maps onto Voxlace

### What the current seed assumes (migration 0008, `services/scheduling.py`)

- `posting_curves` holds, per platform, **one 24-hour shape** multiplied by **seven weekday factors**, audience `general`. So every weekday has the same shape, only taller or shorter.
  - X: "Buffer 2026 (8.7M posts)": peak 09:00, falls to .50 by 15:00. Days `[.90, 1.0, .98, .92, .80, .65, .72]`. Follows Buffer only; ignores Sprout's afternoon peak.
  - LinkedIn: "Buffer 2026 (4.8M posts); Sprout, Hootsuite for mornings": peak 16:00, .70–.78 through the morning and midday. Days `[.75, .90, 1.0, .97, .96, .45, .50]`.
  - Telegram: "Vendor studies (Schedulala, Lyve)": two peaks at 09:00 and 19:00. Days `[.90, 1.0, 1.0, .98, .88, .80, .82]`. The vendor pages have no disclosed data (section 4).
- Four audience rows (`platform = 'any'`), one 24-hour curve each, labelled "Voxlace heuristic". They are **absolute** activity curves (developers 1.0 at 12–13 and 20–22; students 1.0 from 18:00 to 23:00).
- `audience_scores()` multiplies platform value × audience value at each place's local hour. Because the platform curve already contains the office-hours shape, multiplying by a second office-hours curve (business) sharpens the peak twice. And because the developer curve is 1.0 at 20–22, it pulls X posts for developers toward late evening, which no source supports.
- Places come from `platform_settings.audience_places` (the form being removed); empty means the user's own zone.

### What changes

1. **24 hourly values per weekday per platform** (general audience): 7 × 24 rows instead of shape × factor, so a study can say "Sunday afternoon is fine, Saturday is not" (Sprout X) and Monday can differ from Wednesday (Buffer LinkedIn). The table already allows this (`weekday` + `hours`); only the seed changes.
2. **One 24-hour audience-shape curve per audience type**, stored as a **ratio to the general audience** (general = all 1.0). Values near 1.0 mean "like everyone else"; .7 means "this audience is less around than average at that hour". Normalised so the max is 1.0. `audience_scores()` stays as it is.
3. **Optional 7 weekday multipliers per audience type** (a new column or 7 rows). Needed for students: Sprout's education data says weekends beat weekdays on X [2]. Without it, the students curve cannot express this. Flag for decision.
4. **New per-platform region table** (shared seed, no RLS, like `platform_profiles`): `platform, region, timezone, share, source, as_of`. Replaces `audience_places` as the default for international timing. Local-script platforms use `[user's zone, 1.0]` instead.

### Proposed seed: general curves (local hours 00–23)

DERIVED = interpolated by us from the cited peaks; no source publishes these numbers.

**X shape** — DERIVED from Buffer [4] (09:00–10:00 peak) and Sprout [2] (12:00–18:00 peak), blended into a 09:00–15:00 plateau; evenings low (both).

```
00 .15  01 .10  02 .07  03 .06  04 .07  05 .15  06 .35  07 .60
08 .82  09 .97  10 1.0  11 .95  12 .93  13 .92  14 .90  15 .85
16 .78  17 .70  18 .55  19 .45  20 .40  21 .35  22 .28  23 .20
```

X weekday factors (Mon→Sun): `.92, 1.0, 1.0, .95, .80, .60, .72`. Tue/Wed best (Buffer and Sprout), Thu next, Fri second worst (Buffer) / moderate (Sprout), Sat worst (both), Sun moderate (Sprout). For Sunday, shift weight to 12:00–18:00 (Sprout): multiply Sunday 06:00–11:00 by .8 and 14:00–17:00 by 1.1 before normalising (DERIVED).

**LinkedIn shape** — DERIVED; plateau 11:00–16:00 is the overlap of Sprout [3] (11–17) and Buffer [5] (15–20); mornings kept moderate for Hootsuite [6]; evening tail for Buffer.

```
00 .05  01 .03  02 .03  03 .03  04 .05  05 .10  06 .22  07 .40
08 .60  09 .72  10 .85  11 .95  12 .95  13 .97  14 .98  15 1.0
16 1.0  17 .92  18 .75  19 .62  20 .50  21 .38  22 .25  23 .12
```

LinkedIn weekday factors: `.85, .95, 1.0, .97, .88, .35, .35`. Wed best (Buffer, Hootsuite), Thu next (Buffer), Tue strong (Sprout, Hootsuite), Monday lowest weekday (Buffer), weekends avoid (Sprout). Weekends lower than the current `.45/.50` because Sprout says avoid both.

**Telegram shape** — ASSUMPTION (section 4); same two-peak idea as today, slightly flatter in the afternoon.

```
00 .30  01 .18  02 .10  03 .07  04 .07  05 .12  06 .35  07 .65
08 .90  09 1.0  10 .88  11 .75  12 .78  13 .75  14 .65  15 .62
16 .65  17 .78  18 .92  19 1.0  20 .98  21 .88  22 .65  23 .45
```

Telegram weekday factors: `.95, 1.0, 1.0, 1.0, .95, .85, .85` (ASSUMPTION: messengers are used every day; vendor pages say Tue–Thu strongest).

### Proposed seed: audience ratio curves (local hours 00–23, × general)

| Audience | Shape (00→23) | Basis |
|---|---|---|
| general | all 1.0 | — |
| developers | `.9 .9 .9 .9 .8 .7 .7 .75 .8 .85 .9 .95 .9 .95 1.0 1.0 1.0 .95 .9 .9 .9 .9 .9 .9` | DERIVED: Sprout Software & Tech 11–16 on X, 10–15 on LinkedIn [2][3]; SO afternoon > morning, lunch dip, modest evening tail [14] (proxy, 2016) |
| business | `.8 .8 .8 .8 .85 .9 .95 1.0 1.0 1.0 1.0 1.0 1.0 .95 .9 .85 .8 .75 .7 .65 .6 .6 .65 .7` | DERIVED: Sprout Financial Services 08–13/15 on X and LinkedIn [2][3] |
| students | `1.0 1.0 .9 .8 .7 .6 .6 .6 .6 .6 .6 .65 .7 .65 .65 .7 .8 .9 1.0 1.0 1.0 1.0 1.0 1.0` | DERIVED: Sprout Education & Schools on X: best evenings, worst 09–17 weekdays [2] |
| creatives | `1.0 .9 .9 .9 .8 .7 .7 .7 .75 .8 .85 .9 .9 .9 .9 .9 .9 .95 1.0 1.0 1.0 1.0 1.0 1.0` | ASSUMPTION: no source; a later day than office work, like the current seed |

Ratios are deliberately mild (0.6–1.0). They nudge the platform's peak, they don't replace it. Night ratios above 1.0-ish don't matter, because the general curve there is near zero.

Audience weekday multipliers (if item 3 is accepted): students `.8, .85, .85, .85, .9, 1.2, 1.15` then normalised (DERIVED: Sprout Education on X, Sat/Sun best [2]; only X has this signal, LinkedIn education doesn't). Others: all 1.0 (tech, finance: weekdays already carry them through the general factors).

### Proposed seed: region shares

X and LinkedIn: DataReportal Oct 2026 [7][8], grouped by clock. Telegram: ASSUMPTION built on Durov's Jan 2021 sign-up split [11] (Asia 38, Europe 27, LatAm 21, MENA 8, rest 6), with Asia split by where Telegram is commonly cited as large (India, Indonesia) and Europe including Russia/Ukraine at UTC+3.

| Platform | Region | Time zone | Share | Source |
|---|---|---|---|---|
| x | North + Central America | America/Chicago | 24.0 | [8] |
| x | South America | America/Sao_Paulo | 8.8 | [8] |
| x | Europe | Europe/Paris | 14.4 | [8] |
| x | Middle East + Africa | Asia/Riyadh | 15.4 | [8] (Western Asia 9.6 + Africa 5.8) |
| x | South + Central Asia | Asia/Kolkata | 6.6 | [8] |
| x | South-East Asia | Asia/Jakarta | 11.8 | [8] |
| x | East Asia + Oceania | Asia/Tokyo | 18.9 | [8] (Japan dominates) |
| linkedin | North + Central America | America/Chicago | 24.9 | [7] |
| linkedin | South America | America/Sao_Paulo | 12.9 | [7] |
| linkedin | Europe | Europe/Paris | 18.9 | [7] |
| linkedin | Middle East | Asia/Riyadh | 4.8 | [7] |
| linkedin | Africa | Africa/Johannesburg | 7.5 | [7] (spread UTC+0…+3; +2 is the middle) |
| linkedin | South + Central Asia | Asia/Kolkata | 16.7 | [7] |
| linkedin | South-East Asia | Asia/Jakarta | 7.3 | [7] |
| linkedin | East Asia + Oceania | Asia/Shanghai | 6.9 | [7] |
| telegram | Europe (incl. Russia) | Europe/Moscow | 17 | ASSUMPTION from [11] |
| telegram | Europe (west/centre) | Europe/Paris | 10 | ASSUMPTION from [11] |
| telegram | South Asia | Asia/Kolkata | 20 | ASSUMPTION from [11] |
| telegram | South-East Asia | Asia/Jakarta | 13 | ASSUMPTION from [11] |
| telegram | Other Asia | Asia/Tashkent | 5 | ASSUMPTION from [11] |
| telegram | Latin America | America/Sao_Paulo | 21 | ASSUMPTION from [11] |
| telegram | Middle East + N. Africa | Asia/Riyadh | 8 | ASSUMPTION from [11] |
| telegram | Rest (N. America, Africa) | America/Chicago | 6 | ASSUMPTION |

Notes on time zone choice:
- America/Chicago (UTC−6/−5) sits between New York and Los Angeles and matches Mexico City; using New York would move US-weighted hours one hour earlier. Cheap to test both.
- Europe/Paris covers the UK (−1 h) to Eastern Europe (+1 h).
- The four-region view the redesign asked for is the sum of these rows (section 2 table). Using sub-regions keeps Japan (UTC+9) and India (UTC+5:30) apart, which is 3.5 hours.

### Effect, roughly

For a user in Addis Ababa (UTC+3) on X with these shares, the Middle East peaks at 09:00–15:00 on the same clock as Addis, Europe's 09:00–15:00 is Addis 11:00–17:00 (Paris in winter), the Americas' 09:00 is Addis 18:00 (Chicago in winter), and Asia's afternoon is Addis morning. Expect a flat, wide best band with a modest lift around Addis 15:00–18:00 when Europe, the Middle East and the US East overlap. Worth checking with `best_hours()` once seeded.

## 6. Confidence and gaps

- **High:** the regional shares for X and LinkedIn (first-party ad tools via DataReportal, Oct 2026). But they are ad audiences / registered members, not active readers, and LinkedIn overcounts dormant regions.
- **Medium:** weekday ranking on X and LinkedIn (all studies agree on Tue–Thu and weak weekends).
- **Low:** the exact hour of the peak. The studies disagree by up to 6 hours, all use their own customers' brand posts, and none publish hourly numbers or how they localise time. Our 24-value curves are interpolations.
- **Low:** audience ratios. Only Sprout's industry tables (brand accounts) and a 2016 Stack Overflow proxy. Students' evening/weekend lean is the one clear signal.
- **None:** Telegram timing and Telegram regions. Assumptions only; the user's own data (FR-34) is the real answer. A future option: ask channel owners to read the "views by hour" chart in Telegram's own statistics [13].
- **Not checked:** Hootsuite's and Later's X studies; Sprout's previous years (to see whether the peaks are stable); GitHub commit-hour data (no first-party 2024–2026 source found).
- **Method mismatch:** Buffer measures engagement *rate* of a post sent at that hour; Sprout counts engagements *happening* at that hour. They answer different questions, which partly explains the disagreement.

## Sources

1. Sprout Social, "The best times to post on social media in 2026", 31 Mar 2026. https://sproutsocial.com/insights/best-times-to-post-on-social-media/ (accessed 2026-11-24)
2. Sprout Social, "Best times to post on X in 2026", 31 Mar 2026. https://sproutsocial.com/insights/best-times-to-post-on-twitter/ (accessed 2026-11-24)
3. Sprout Social, "Best times to post on LinkedIn in 2026", 31 Mar 2026. https://sproutsocial.com/insights/best-times-to-post-on-linkedin/ (accessed 2026-11-24)
4. Buffer, "The Best Time to Post on Twitter/X in 2026: 8.7 Million Posts Analyzed", 13 Mar 2026. https://buffer.com/resources/best-time-to-post-on-twitter/ (accessed 2026-11-24)
5. Buffer, "The Best Time to Post on LinkedIn in 2026: 4.8 Million Posts Analyzed", 9 Sep 2026. https://buffer.com/resources/best-time-to-post-on-linkedin/ (accessed 2026-11-24)
6. Hootsuite, "Best time to post on LinkedIn", Nov 2025 (Q4 2024 data). https://blog.hootsuite.com/best-time-to-post-on-linkedin/ (accessed 2026-11-24)
7. DataReportal, "LinkedIn Users, Stats, Data & Trends", data Oct 2026, updated 5 Nov 2026. https://datareportal.com/essential-linkedin-stats (accessed 2026-11-24)
8. DataReportal, "X Users, Stats, Data & Trends", data Oct 2026, updated 5 Nov 2026. https://datareportal.com/essential-x-stats (accessed 2026-11-24)
9. DataReportal, "Digital 2026 Global Overview Report", Oct 2025. https://datareportal.com/reports/digital-2026-global-overview-report (accessed 2026-11-24)
10. TechCrunch, report of Pavel Durov's 1B MAU announcement, 19 Mar 2025 (Durov's own figure, not audited). https://techcrunch.com/2025/03/19/telegram-founder-pavel-durov-says-app-now-has-1b-users-calls-whatsapp-a-cheap-watered-down-imitation (accessed 2026-11-24)
11. S&P Global Market Intelligence, "Telegram crosses 500 million monthly active users", Jan 2021, reporting Durov's 12 Jan 2021 post and its regional split of new users. https://www.spglobal.com/market-intelligence/en/news-insights/articles/2021/1/telegram-crosses-500-million-monthly-active-users-62094638 (accessed 2026-11-24)
12. Telegram blog, "700 Million Users and Telegram Premium", 19 Jun 2022. https://telegram.org/blog/700-million-and-premium (accessed 2026-11-24)
13. Telegram API docs, "Channel statistics" (`stats.broadcastStats`, `top_hours_graph`). https://core.telegram.org/api/stats (accessed 2026-11-24)
14. Stack Overflow blog, D. Robinson, "What programming languages are used late at night?", 19 Apr 2017 (visits, Aug 2016, local time). https://stackoverflow.blog/2017/04/19/programming-languages-used-late-night/ (accessed 2026-11-24)
15. Stack Overflow blog, "Stack Overflow trends: weekday vs weekend site activity", 27 Sep 2022 (2021 data). https://stackoverflow.blog/2022/09/27/stack-overflow-trends-weekday-vs-weekend-site-activity/ (accessed 2026-11-24)
16. SMMplanner, Telegram posting time article, 9 Sep 2025 (no disclosed data). https://smmplanner.com/blog/nievidimost-ili-viralnyi-rost-kak-vriemia-publikatsii-v-tielieghramie-vliiaiet-na-uspiekh-kanala/ (accessed 2026-11-24)
17. Postmypost, "The best time to post on Telegram in 2025", 14 Apr 2025 (no disclosed data). https://postmypost.io/resources/the-best-time-to-post-on-telegram-in-2025/ (accessed 2026-11-24)
