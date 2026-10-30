# Keepsake

**One real-life challenge a day. Every one you complete becomes a collectible card in the book of your life.**

Go to an open mic. Take a bus to nowhere. Ask a stranger over 60 for the best advice they ever got. When you've done it, add a photo and one line about what happened, and watch a live preview of your card. Then tap the face-down card. It charges up through the rarity tiers, which stay hidden until this moment, and flips. Your photo develops like a print, your words ink in, and a wax seal presses into the corner. Epic and Legendary cards also get a burst of light and confetti. The card lands in your Book, numbered, dated and kept forever. You can edit its words later or export it as a high-resolution image to share.

One card a day. The Deck is for browsing: you can swap any challenge in as today's, and a challenge finished after midnight can still be sealed the next day.

### Built to keep you going

- **A gentle start that builds courage.** Three setup questions (solo or social, budget, time) filter the deck. You start at courage level 2, and every three challenges at your level unlock the next one.
- **Reminders.** A morning nudge with the day's challenge and an optional 8pm check-in. There are two ways to get them:
  - **Notifications:** in browsers that support background checks (Chrome on Android, installed app), and while the app is open.
  - **A calendar file** with repeating events, which works everywhere and is always on time.
- **When and where.** "Plan it" asks when (today or any day this week, at a time you choose) and where. Today then shows the plan as a sentence ("Tonight at 9:00 PM, at Café Lux."). The reminder moves to that exact time, and you can add the plan to your calendar or send it to a friend ("Hold me to it"). A challenge planned for another day becomes that day's challenge. Cards sealed from a plan say "Planned and done".
- **Installable.** Keepsake is a web app you can add to your home screen (a PWA), and it works offline.
- **Secret challenges.** 17 hidden challenges show in the Deck as locked cards with a hint, like hidden achievements. They unlock after a particular challenge (Take the Mic → Encore), 5 cards in one category, courage level 5, 25 cards, cards on 7 different days, a Legendary card, or a completed dare. A dare link can open a secret early. Their conditions live in the `unlock` field of `data/challenges.json`.
- **Dares and Stories.** Every card can be shared as a 1080×1920 Story image, or as a dare link (`?dare=<challenge>&from=<name>`) that opens the same challenge for a friend. Cards record who dared you.

Real push notifications, sent while the app is closed and on time on every platform, need a small server to send them. This prototype doesn't have one yet.

## Run it

It's a static site with no build step:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

It also works on GitHub Pages as is. All data stays on the device: cards are stored in `localStorage` and photos in IndexedDB.

## Files

| Path | What |
|---|---|
| `data/challenges.json` | The curated challenge database (101 challenges) |
| `index.html`, `style.css`, `app.js` | The prototype: Today / Deck / Book, the proof sheet, the card reveal, PNG export |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support, background reminders, home-screen install |

### Challenge schema

```jsonc
{
  "id": "open-mic",
  "title": "Take the Mic",
  "category": "creative",      // social | body | creative | explore | mind | kindness
  "courage": 5,                // 1–5 → card rarity: Common, Uncommon, Rare, Epic, Legendary
  "solo": true,
  "cost": "free",              // free | $ | $$
  "minutes": 120,
  "prompt": "Find an open mic this week…",
  "why": "Nothing rewires your fear thermostat like being seen on purpose.",
  "easier": "Go as audience and talk to one performer afterwards.",  // drops the card one rarity
  "safety": null
}
```

## Why this, and not another challenge app (research, Oct 2026)

The basic idea of "daily real-life challenge + streak + XP" is already crowded. There are about 20 small indie apps doing it: Diss Comfort, nudge., Introvert: Daily Courage, Mandate, Solo Quest XP, Errant, Hyper Challenges, Sidequest, Rejection Therapy, Rejecto, TSBL, Bucketer and others. None of them has broken out. Their weak spots are the same two things this project bets on:

1. **Generic rewards.** They use XP, badges and streaks, the same as every habit tracker. Keepsake's reward is a *memory artifact*: your photo and your words on a numbered card whose rarity comes from how much courage the challenge took. That card is worth keeping and sharing.
2. **Bland challenge lists.** They are either AI-generated or generic comfort-zone lists. Keepsake treats the challenge deck as an editorial product: each challenge has a voice, a reason, an easier version and a safety note.
