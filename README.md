# Keepsake

**One real-life challenge a day. Every one you complete becomes a collectible card in the book of your life.**

Go to an open mic. Take a bus to nowhere. Ask a stranger over 60 for the best advice they ever got. When you've done it, add a photo and one line about what happened. The app then deals you a card: it charges up through the rarity tiers, flips, bursts with confetti, plays a chime and vibrates. The card lands in your Book, numbered, dated and kept forever. You can export it as a high-resolution image to share.

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
