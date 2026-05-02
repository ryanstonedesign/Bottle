# Bottle

Write a statement 100 times. Seal it. Put it on your shelf.

A small, calm web app. No accounts, no streaks, no feed. The ritual is the product.

## Run

It's a static site with no build step. Serve the folder over HTTP:

```sh
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

Bottles persist in the browser's `localStorage`.

## Files

- `index.html` — page shell + view templates
- `styles.css` — light/calm visual direction
- `app.js` — state, routing, views

## Flow

1. **Shelf** — sealed bottles live here. Empty state invites you to start.
2. **New** — write your statement (and an optional title).
3. **Write** — type the statement 100 times. Paste is blocked. Progress saves automatically.
4. **Seal** — once you reach 100, the paper rolls up into the bottle. Tap *Seal bottle*.
5. **Detail** — the sealed bottle, statement, and dates. Read-only.
