# The Wake System

How LifeOS gets you out of bed, what the research actually supports, and the
two Shortcuts that make it real.

---

## The hard constraint, stated once

**The PWA cannot be your alarm.** On iOS, web push notifications for a
home-screen PWA have no sound option, do not reach the lock screen, and are
suppressed by Silent mode and Focus. There is no workaround — it's a platform
limitation, not a config problem. Anyone who tells you otherwise is selling
something.

Only the native **Clock app** holds the entitlement to break through Silent
mode, Do Not Disturb, and a Sleep Focus. So:

> **Clock rings. LifeOS decides.**
> A Shortcut is the wire between them.

---

## What the research actually says

Ranked by effect size, not by how good the tip sounds.

**1. Consistent wake time beats everything else.** Nothing in the literature
comes close. A regular wake anchor is the single strongest lever on morning
alertness — bigger than sound, light, or any gadget. This is why the system
below never lets your wake time drift more than it has to, and why "mercy"
mode still rings at the target instead of sliding to noon.

**2. Melodic alarm > harsh beeping.** A 2020 PLOS ONE study
([Stuart & Dingle, RMIT](https://pmc.ncbi.nlm.nih.gov/articles/PMC6986749/))
found melodic alarm tones significantly reduce *sleep inertia* — the grogginess
that makes you rationalize going back to sleep. Neutral/harsh beeps made it
worse. Follow-up work found melodic wakers had faster, more accurate cognitive
performance on waking. Mechanism: melody supports a smoother cortical
transition; a harsh beep triggers a startle response that leaves you
adrenalized but foggy.
→ **Set your Clock alarm sound to something melodic, with a gradual ramp.
This is a 30-second change with one of the best evidence-to-effort ratios
available.**

**3. Sleep inertia is the real enemy, and it's time-limited.** It peaks in the
first ~15–30 min after waking. Every decision you make in that window is made
by a brain that is *measurably* impaired — which is why "I'll just decide when
it goes off" fails. The decision has to be made the night before, by someone
who isn't groggy. That's the entire design principle here.

**4. Light and temperature: modest and mixed.** The
[NASA/Hilditch at-home study](https://www.sleephealthjournal.org/article/S2352-7218(23)00165-1/fulltext)
found light helped a bit when waking from slow-wave sleep, but *hurt* on some
tasks in other conditions. A
[multimodal bedroom system](https://pmc.ncbi.nlm.nih.gov/articles/PMC10969141/)
manipulating light + sound + temperature found "little overall impact."
→ Worth a smart bulb if you already have one. Not worth buying hardware.

**5. Smart/sleep-cycle alarms: weaker than marketed.** The premise is sound
(waking from light sleep reduces inertia), but phone-based stage detection runs
~66–70% accurate, and a 2024 review found only 32.9% of sleep apps have any
empirical backing. A ±30 min wake window also *directly attacks lever #1*.
→ **Skipped on purpose.** Trading a guaranteed-consistent wake time for a
coin-flip guess at your sleep stage is a bad trade.

**6. Caffeine works, but as a countermeasure, not a plan.** Caffeine taken
immediately on waking measurably lessens inertia. Useful. Doesn't solve
getting vertical.

---

## The design

Two modes, decided at bedtime by a brain that isn't tired yet.

| | **FULL** | **MERCY** |
|---|---|---|
| when | ≥ 6h30m before your wake target | < 6h30m |
| alarm | rings at target | **still rings at target** |
| backup | yes | **none** |
| wake gate | armed | **stands down** |
| if you ignore it | system escalates | you go back to sleep, and that's fine |

Your rule, implemented literally: *the 10am alarm still fires even if you
went to bed at 5 — but it fires once, gently, and then leaves you alone.*
If the day genuinely matters, you'll know it and set your own alarm.

**Why mercy still rings at all:** because of lever #1. A single ring at 10:00
gives you the *option* to take the consistent wake. Silently moving the alarm
to 11:30 takes that choice away from you and drifts your anchor. Ringing once
and accepting "no" preserves both the anchor and the rest.

**Why the gate stands down on a mercy morning:** LifeOS locks your scroll apps
until you read the brief (`wake_gate`). On a 5-hours-of-sleep morning, that's
punishing you for a decision you already paid for. It's now automatic.

---

## What the data said about you

Before building anything, I looked at your last 14 days:

- **`sleep_at` is NULL for every night on record.** The bedtime Shortcut was
  never installed, so `lifeos_sleep_stats` has been returning nulls this whole
  time. Your Sleep card, the capacity trim, the consistency read, the sleep
  credit tiers — all dead code, waiting on one missing hook.
- **`wake_method = 'override'` on 13 of 14 days.** The wake challenge is being
  bypassed ~93% of the time. One `'challenge'` completion, on Jul 6.

Read those together and the conclusion is uncomfortable but clear: **the
current system isn't failing because it's too weak. It's failing because the
escape hatch is free and always available.** Adding a louder alarm on top of
that changes nothing — you'd override it too.

That's why the highest-leverage item below is Shortcut #1, not the alarm
itself. And it's why mercy mode exists: an escape hatch you *don't need* to
reach for is one you stop reflexively pulling. If the system is fair when
you're genuinely wrecked, the gate has moral authority on the mornings you're
not.

---

## Shortcut 1 — Bedtime (the important one)

**Automation:** Personal Automation → *Sleep Focus* → **When Turning On** →
Run Immediately, Notify When Run **off**.

One HTTP call does everything: logs bedtime, computes the alarm, picks the
mode, and stores the plan.

**Get Contents of URL**
- URL: `https://xebiaoycxwstrzgkjult.supabase.co/rest/v1/rpc/lifeos_bedtime`
- Method: `POST`
- Headers:
  - `apikey` → *(your `sb_publishable_...` key — copy from the CONFIG block at the top of `index.html`)*
  - `Content-Type` → `application/json`
- Request Body: JSON, empty `{}`

**Get Dictionary Value** → `alarm_iso` from *Contents of URL*
**Get Dictionary Value** → `alarm_clock` from *Contents of URL*
**Get Dictionary Value** → `mode` from *Contents of URL*
**Get Dictionary Value** → `reason` from *Contents of URL*

**Date** → `alarm_iso`
> ⚠️ Use an **Adjust Date** (by 0 minutes) right after this. *Create Alarm*
> fails silently if it gets a Text where it wants a Date; Adjust Date forces
> the conversion into a Clock-compatible format. This is the single most
> common way this Shortcut breaks.

**Create Alarm**
- Time: the adjusted Date
- Label: `LifeOS`
- Snooze: **off for mercy, on for full**
  (wrap in an `If mode is mercy` — snooze is how a groggy brain converts a
  single ring into three hours)

**Show Notification** → `⏰ {alarm_clock} · {mode}` / body `{reason}`

**Optional (HomeKit):** `If mode is full` → Set scene "Wake" to fade lights up
at the alarm time. Skip it in mercy mode.

### Cleanup

Clock accumulates alarms and Shortcuts can't reliably delete them by label.
Add at the **top** of this Shortcut:

**Get Alarms** → **Repeat with Each** → `If` alarm label is `LifeOS` →
**Remove Alarm**. This keeps exactly one LifeOS alarm alive at a time.

---

## Shortcut 2 — Wake confirm

**Automation:** Personal Automation → *Alarm* → **When Alarm Is Stopped** →
alarm: `LifeOS` → Run Immediately.

**Get Contents of URL**
- URL: `https://xebiaoycxwstrzgkjult.supabase.co/rest/v1/rpc/lifeos_confirm_wake`
- Method `POST`, same two headers
- Body: JSON → `p_method` : `alarm`

That's it. It stamps `wake_confirmed_at` / `wake_time` / `wake_method='alarm'`
so `lifeos_sleep_stats` finally has both ends of the night.

Note this fires on **Stop**, not Snooze — so a snoozed alarm doesn't count as
awake, which is correct.

---

## Setup order (do it in this order)

1. **Clock → change your default alarm sound to something melodic.**
   30 seconds, best evidence-to-effort ratio in this document. Not a jingle,
   not a klaxon — something with an actual melodic line that ramps.
2. **Build Shortcut 1.** Nothing else works until `sleep_at` is populated.
   This is the keystone.
3. Run it manually once. Check the Sleep card in LifeOS — tonight's alarm row
   should appear with a time and a mode.
4. **Build Shortcut 2.**
5. Live with it for ~2 weeks. You need `sleep_baseline_days` (14) of real
   nights before the consistency read and capacity trim mean anything.

---

## Tunable settings

All in `lifeos_settings`:

| key | default | what it does |
|---|---|---|
| `sleep_min_ok_min` | `390` | the mercy line — 6h30m. Below this, no enforcement. |
| `alarm_apply` | `on` | master switch |
| `alarm_lead_min` | `0` | shift every alarm earlier by N minutes |
| `wake_targets` | per-weekday | your `full` / `hard` wake times |
| `sleep_need_min` | `480` | 8h — what the capacity trim measures debt against |

You said "6 or 7 hours." I set the line at **6h30m** — the midpoint. It's one
`update` away if it feels wrong after a couple weeks:

```sql
update lifeos_settings set value = '420' where key = 'sleep_min_ok_min';  -- 7h
```

---

## What I deliberately did not build

- **A snooze-defusing math-problem alarm.** Your override rate says the
  failure isn't insufficient friction — it's that friction is optional. More
  friction with a free bypass just makes the bypass more attractive.
- **Sleep-cycle wake windows.** See research note #5. Bad trade against
  lever #1.
- **Anything requiring hardware.** The multimodal-bedroom evidence doesn't
  justify it.

---

## The honest open question

The `override` button is still there, still free. Mercy mode removes your
*legitimate* reason to press it — but it doesn't stop you pressing it on a
9-hour night.

I left that alone deliberately: it's a question about what you want, not a
technical gap. Once you have two weeks of real `sleep_at` data, the override
rate on **full-mode mornings specifically** will tell us whether the gate needs
teeth. Right now we'd be guessing, and the data to answer it properly starts
existing the day Shortcut 1 goes in.

---

### Sources

- [Stuart & Dingle — Alarm tones, music and their elements: analysis of reported waking sounds to counteract sleep inertia (PLOS ONE, 2020)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6986749/)
- [RMIT — Using your favourite song as an alarm can help you wake up more alert](https://www.rmit.edu.au/news/all-news/2021/apr/snooze-blues)
- [Hilditch et al. — An at-home evaluation of a light intervention to mitigate sleep inertia (Sleep Health)](https://www.sleephealthjournal.org/article/S2352-7218(23)00165-1/fulltext)
- [The Efficacy of a Multimodal Bedroom-Based 'Smart' Alarm System on Mitigating the Effects of Sleep Inertia (2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10969141/)
- [Sleep inertia: current insights (Nature and Science of Sleep)](https://www.dovepress.com/sleep-inertia-current-insights-peer-reviewed-fulltext-article-NSS)
- [Trotti — Waking up is the hardest thing I do all day: sleep inertia and sleep drunkenness](https://www.sciencedirect.com/science/article/abs/pii/S1087079216300910)
- [MagicBell — PWA iOS limitations and Safari support (2026)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Progressier — Troubleshooting web push notifications on iOS 16.4+](https://intercom.help/progressier/en/articles/7212230-troubleshooting-web-push-notifications-on-ios-16-4-or-later)
- [RoutineHub — Creating alarms from Shortcuts (the Adjust Date fix)](https://blog.routinehub.co/how-to-create-an-apple-shortcut-to-set-alarms-for-todays-calendar-events/)
