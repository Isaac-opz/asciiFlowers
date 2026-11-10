# ASCII Lilies & Roses

A wrapped bouquet of white lilies and red roses with ruscus greenery that grows and blooms in coloured ASCII on a black background.

**Live:** https://isaac-opz.github.io/asciiFlowers/

Open `index.html` in a browser. Rendering runs on WebGL: the scene is read back
once per frame at one pixel per character cell and drawn as glyphs from a
pre-rendered atlas in a single draw call (with a canvas 2D fallback). It has no dependencies or build step. You can also serve the folder with any static server, for example `npx serve` or VS Code Live Server.

## The letter

It opens on a night sky. A line types itself out like a terminal,
`> Maria, tengo algo para ti`, and an envelope floats up, sealed with a beating
red heart. Tapping it (or pressing Space or Enter) breaks the seal, swings the flap
open and lets out a warm light that sinks into the bouquet's wrap, and the bloom
begins. The tap also starts a little music box: an original waltz synthesised in
the browser with WebAudio, so there are no audio files. Browsers only allow sound
after a tap, which is why the letter comes first.

## The bloom

A hand-tied florist's bouquet, mirrored left to right, sped up to about 12 seconds (`SPEED` in `bouquet.js`):

1. Stems rise out of a dark paper wrap, tied at the neck with a satin bow, and
   sprigs of ruscus fan out symmetrically behind them.
2. Each stem ends in a bud that swells: long green lily buds around the rim,
   rose buds blushing red in the middle.
3. The lilies open from the top down, centre first and then in mirrored pairs:
   six tepals part into a star, curl back and show long stamens with dark anthers.
4. Twelve roses open as a neat dome, back-centre first and spreading outwards,
   each unfurling ring by ring around a dark spiral heart.

After that it keeps swaying gently. Once the last lily is open, a red heart
pops in on the wrap, beats softly, and the message `Te amo Maria` is written
out below in a glowing script, left to right like ink, followed by a smaller
`Eres mi prioridad`.

## Controls

- **Tap, Space or Enter** on the letter: open it
- **Click, Space or `R`**: replay the bloom
- **`S`**: music on or off
- **`P`**: switch colours (white lilies + red roses → cherry lilies + pink roses → mixed garden)

## URL options

- `?p=1` picks the starting colours (0, 1 or 2)
- `?intro=0` skips the letter and starts at the bloom
- `?t=8` skips the letter and starts 8 seconds into the bloom (`?t=15` jumps to the note)
- `?m=0` hides the heart and the message

## The message

The name lives in `LOVE_NAME` and the second line in `LOVE_SUB`, both in the love
note section of `bouquet.js`. The second line uses Dancing Script, whose letters
stay legible at the smaller size. The
words are set in Great Vibes (from Google Fonts, falling back to Snell Roundhand
or Segoe Script) as real type over the ascii: a flowing hand loses its hairlines
at character resolution, so it is the one thing not turned into glyphs. The heart
is an ordinary vector shape, so it goes through the same ascii pipeline as
everything else.
