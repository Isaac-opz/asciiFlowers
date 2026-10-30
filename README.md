# ASCII Lilies

A bunch of lilies with ruscus greenery and baby's breath that grows and blooms in coloured ASCII on a black background.

Open `index.html` in a browser. It has no dependencies or build step. You can also serve the folder with any static server, for example `npx serve` or VS Code Live Server.

## The bloom

It follows how cut lilies open over a few days, sped up to about 15 seconds:

1. Tall stems rise from a gathered bunch and lance-shaped leaves unfurl along them. Arching sprigs of ruscus fan out around them, with glossy leaves alternating up each sprig.
2. Each stem ends in a cluster of long green buds on short side stalks, which swell.
3. Mature buds blush from green to dusty pink while baby's breath branches through the bunch and bursts into clouds of tiny white flowers.
4. One by one the buds split into six tepals that open into a star, curl back at the tips and show long stamens with dark anthers.
5. A few buds stay green or only blush, like a real bunch.

After that it keeps swaying gently.

## Controls

- **Click, Space or `R`**: replay the bloom
- **`P`**: switch colours (pink → white → mixed garden)

## URL options

- `?p=1` picks the starting colours (0, 1 or 2)
- `?t=8` starts 8 seconds into the bloom

## How it works

Each frame draws the lilies with ordinary canvas shapes onto a tiny offscreen canvas, one pixel per character cell. Each pixel is then redrawn as a glyph from ` .:-=+*cxoaX#%&@`, picked by brightness and coloured with the pixel's colour. A faint blurred copy underneath gives the glow.
