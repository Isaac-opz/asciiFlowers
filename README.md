# ASCII Lilies

A bunch of lilies with ruscus greenery and baby's breath that grows and blooms in coloured ASCII on a black background.

**Live:** https://isaac-opz.github.io/asciiFlowers/

Open `index.html` in a browser. It has no dependencies or build step. You can also serve the folder with any static server, for example `npx serve` or VS Code Live Server.

## The bloom

It follows how cut lilies open over a few days, sped up to about 16 seconds:

1. Tall stems rise from a gathered bunch and lance-shaped leaves unfurl along them. Arching sprigs of ruscus fan out around them, with glossy leaves alternating up each sprig.
2. Each stem ends in a cluster of long green buds on short side stalks, which swell.
3. Mature buds blush from green to dusty pink while baby's breath branches through the bunch and bursts into clouds of tiny white flowers.
4. One by one the buds split into six tepals that open into a star, curl back at the tips and show long stamens with dark anthers.
5. A few buds stay green or only blush, like a real bunch.

After that it keeps swaying gently. Once the last lily is open, a red heart
pops in over the stems, beats softly, and the message `Te amo Maria` is typed
out below in 5×7 block letters.

## Controls

- **Click, Space or `R`**: replay the bloom
- **`P`**: switch colours (cherry & ivory → white → mixed garden)

## URL options

- `?p=1` picks the starting colours (0, 1 or 2)
- `?t=8` starts 8 seconds into the bloom (`?t=15` jumps to the note)
- `?m=0` hides the heart and the message

## The message

The name lives in `LOVE_NAME` near the top of the note section in `bouquet.js`.
The letters are 5×7 block glyphs, one lit pixel per character cell, so they are
drawn from the same characters as the flowers and stay readable instead of
turning to mush at that resolution. The heart is an ordinary vector shape, so
it goes through the same ascii pipeline as everything else.

## How it works

Each frame draws the lilies with ordinary canvas shapes onto a tiny offscreen canvas, one pixel per character cell. Each pixel is then redrawn as a glyph from ` .:-=+*cxoaX#%&@`, picked by brightness and coloured with the pixel's colour. A faint blurred copy underneath gives the glow.
