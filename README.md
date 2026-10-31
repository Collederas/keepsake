# Keepsake

**Do something worth telling.** One story at a time.

Keepsake gives you a real-life challenge each week (or a few a week, or every day). Every one you do becomes a collectible card you keep.

Go to an open mic. Take a bus to nowhere. Ask a stranger over 60 for the best advice they ever got. When you've done it, add a photo and one line about what happened, and watch a live preview of your card. Then tap the face-down card. It charges up through the rarity tiers, which stay hidden until this moment, and flips. Your photo develops like a print, your words ink in, and a wax seal presses into the corner. Epic and Legendary cards also get a burst of light and confetti. The card lands in your Book, numbered, dated and kept forever. You can edit its words later or export it as a high-resolution image to share.

**Rhythm:** *Once a week* (the default; a new challenge every Monday, with the whole week to do it), *A few a week* (up to three, one per day) or *Every day*. People who set up before rhythms existed stay on every day. The Deck is for browsing: you can swap any challenge in as the current one, and a challenge finished just after the day or week ends can still be added to it.

### Built to keep you going

- **Day Zero.** Setup ends with one question, "What's one thing you've always wanted to try?". The answer goes in the Book as an empty frame, #000. It turns into a real card, with your photo, your line and the date, the day you actually do it. It doesn't count toward progress.
- **Foil.** A card's colour comes from the challenge's courage, so you know it before you flip. Foil is the surprise. A card comes out foil because of how you did it: you planned it and did it, a friend dared you, it's your first card in a category, or you came back after a break. You only find out when the card flips.
- **A gentle start that builds courage.** Setup questions (how often, solo or social, budget, time) shape the deck. You start at courage level 2, and every three challenges at your level unlock the next one. The Deck lists challenges near your level first; harder ones show when they open.
- **Reminders that back off.** On a weekly rhythm, a nudge on Monday and a check-in on Thursday. Otherwise, one morning reminder on your rhythm's days, worded as an invitation. The 8pm check-in is opt-in, except on days you planned something, and has a "Not today" button. If you go quiet, reminders come every other day after 3 days. Around day 5 the app asks once whether you're busy. After a week, it only sends a fresh start on a Monday or the 1st, and after two of those it sends a last message and stops. Opening the app resets all of this. Nothing is ever "missed" or "late". There are two ways to get reminders:
  - **Notifications:** in browsers that support background checks (Chrome on Android, installed app), and while the app is open.
  - **A calendar file** with repeating events, which works everywhere and is always on time.
- **Busy?** Pause all reminders for 1 week, 2 weeks or until you're back. Today then shows a calm screen with an optional 2-minute challenge, and coming back starts with an easy one. 15 tiny challenges (`"tiny": true`) cover busy days.
- **When and where.** "Plan it" asks when (today or any day this week, at a time you choose), where, and what might get in the way. You can tap a common obstacle (too tired, no time, weather…) to get a suggested "If it happens, I'll…" plan to edit, or write your own. Today then shows the plan as a sentence ("Tonight at 9:00 PM, at Café Lux."). The reminder moves to that exact time, and you can add the plan to your calendar or send it to a friend ("Hold me to it"). A challenge planned for another day becomes that day's challenge. Cards sealed from a plan say "Planned and done".
- **Installable.** Keepsake is a web app you can add to your home screen (a PWA), and it works offline.
- **Secret challenges.** 17 hidden challenges show in the Deck as locked cards with a hint, like hidden achievements. They unlock after a particular challenge (Take the Mic → Encore), 5 cards in one category, courage level 5, 25 cards, cards on 7 different days, a Legendary card, or a completed dare. A dare link can open a secret early. Their conditions live in the `unlock` field of `data/challenges.json`.
- **Dares and Stories.** Every card can be shared as a 1080×1920 Story image, or as a dare link (`?dare=<challenge>&from=<name>`) that opens the same challenge for a friend. Cards record who dared you.

### For testers

- **Backup and restore.** Settings → Your cards saves one file with every card and photo, and restores it on any phone. After the third card, Today suggests making one, because cards only live on the phone (and Safari on iPhone can clear a site's data after about a week away unless it's on the Home Screen).
- **Feedback.** "Send feedback" in Settings and "How did that go? Tell me" under every finished card open an email to the maker, with the version, device, rhythm and card count filled in.
- **Stats, opt-in only.** The app counts things on the phone: days opened, cards made (foil, planned, dared), swaps and which challenges were swapped away, plans, Busy, reveal skips, settings and help visits. Nothing is sent automatically. "Share my stats" shows the exact text first, then opens an email the tester sends themselves. It never includes anything they wrote: no stories, places, names, Day Zero wish or photos. Today asks once after the second card and once after the sixth.
- **Link preview.** Sharing the link in a chat shows the title, a line of description and `og.jpg`.

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
| `data/challenges.json` | The curated challenge database (109 challenges: 77 regular, 17 secret, 15 tiny) |
| `index.html`, `style.css`, `app.js` | The prototype: Today / Deck / Book, the proof sheet, the card reveal, PNG export |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support, background reminders, home-screen install |
| `og.jpg` | The image shown when the link is shared |

### Challenge schema

```jsonc
{
  "id": "open-mic",
  "title": "Take the Mic",
  "category": "creative",      // social | body | creative | explore | mind | kindness
  "theme": "stage",            // what kind of thing it is; the picker never serves the same kind twice in a row
  "courage": 5,                // 1–5 → card rarity: Common, Uncommon, Rare, Epic, Legendary
  "solo": true,
  "cost": "free",              // free | $ | $$
  "minutes": 120,
  "prompt": "Find an open mic this week…",
  "why": "Nothing rewires your fear thermostat like being seen on purpose.",
  "easier": "Go as audience and talk to one performer afterwards.",  // not shown in the app (the easy version was removed)
  "safety": null
  // optional: "tiny": true (busy days), "starter": true (first challenges for new people),
  // "secret": true + "unlock" (hidden until earned), "retired": true (kept only so earned cards still show)
}
```

The picker keeps things varied: after a swap, and for the next few weeks, it avoids the theme of anything you just passed on or did recently, and it avoids the same category twice in a row. New people start from a handpicked set of strong first challenges.

## Why this, and not another challenge app (research, Oct 2026)

The basic idea of "daily real-life challenge + streak + XP" is already crowded. There are about 20 small indie apps doing it: Diss Comfort, nudge., Introvert: Daily Courage, Mandate, Solo Quest XP, Errant, Hyper Challenges, Sidequest, Rejection Therapy, Rejecto, TSBL, Bucketer and others. None of them has broken out. Their weak spots are the same two things this project bets on:

1. **Generic rewards.** They use XP, badges and streaks, the same as every habit tracker. Keepsake's reward is a *memory artifact*: your photo and your words on a numbered card whose rarity comes from how much courage the challenge took. That card is worth keeping and sharing.
2. **Bland challenge lists.** They are either AI-generated or generic comfort-zone lists. Keepsake treats the challenge deck as an editorial product: each challenge has a voice, a reason and, where needed, a safety note.
