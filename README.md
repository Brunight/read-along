# Read Along

Read a PDF book while its audiobook plays: the original PDF pages scroll by themselves and the paragraph being narrated is highlighted.

It has two parts:

| Part | Where it runs | What it does |
|------|---------------|--------------|
| `prep/` (Python) | a machine with an NVIDIA GPU | Transcribes each audiobook with Whisper and aligns the words to the PDF's paragraphs, then writes each volume's `.sync/` |
| `app/` (Bun, TanStack Start, React, Tailwind) | any server, via Docker; no GPU or Python needed | Serves the library and the reader |

## Books folder

```
books/
  <book>/                       # e.g. mushoku_tensei (shown as "Mushoku Tensei")
    <volume>/                   # e.g. volume_1
      <anything>.pdf
      audio/
        <anything>.m4b          # must have chapter markers
        cover*.jpg              # optional extra cover (prep also extracts one)
      .sync/                    # written by prep
        sync.json               # what the app reads
        words.json              # per-word page positions + times (word highlighting)
        transcript.json         # cached Whisper output (slow to regenerate)
        paragraphs.json
        cover.jpg               # the PDF's cover page (else the m4b's cover art)
        debug/                  # with --debug-png: pages with paragraph boxes drawn
```

The library groups volumes by book. Folders can be symlinks. When a volume has several cover images, the library uses the one closest to A4 shape.

## 1. Prepare books (GPU machine)

You need [uv](https://docs.astral.sh/uv/), ffmpeg, and an NVIDIA driver. The CUDA libraries come from pip wheels, so you don't need to install a system CUDA toolkit.

```sh
cd prep
uv run prep.py                                 # process every book in ../books that is new or changed
uv run prep.py --book mushoku_tensei           # one book (all its volumes)
uv run prep.py --book mushoku_tensei/volume_1  # one volume
uv run prep.py --force                         # rebuild sync.json (re-aligns but reuses the cached transcript)
uv run prep.py --force-transcribe
uv run prep.py --debug-png                     # also render a few pages with the detected paragraph boxes
uv run prep.py --covers-only                   # just extract missing covers (seconds, no GPU)
```

With `large-v3` on an RTX 5070 Ti, transcription runs at about 27× realtime, so a 7-hour book takes about 15–20 minutes (Volume 1, 7h18m, took about 16). Progress is saved after every chapter, so an interrupted run picks up where it stopped. At the end, a table shows how well each chapter matched the PDF; 95% or higher is typical.

How it works:
- **PDF paragraphs:** PyMuPDF reads text lines with their positions. A new paragraph starts wherever the first line is indented. Page footers are dropped, and a paragraph that spans pages gets one box per page.
- **Transcription:** faster-whisper runs one chapter at a time with word timestamps. Each window is decoded independently (`condition_on_previous_text=False`), which prevents hallucination loops.
- **Alignment:** the PDF has no text chapter headings, so the whole book is aligned at once. Word 4-grams that appear exactly once in both the PDF and the transcript serve as anchors. The longest chain of anchors in order is kept, and `difflib` fills the gaps between them. Each paragraph's start time is the time of its first word.

## 2. Run the app

### Docker (server)

```sh
# copy the prepared books (including the hidden .sync folders) to the server
rsync -av books/ server:/path/to/read-along/books/

# on the server, in the repo folder
mkdir -p data
docker compose up -d --build
```

Open `http://server:3000`. Reading positions are saved in `./data/app.sqlite`, so they follow you across devices. (An older `data/progress.json` is imported on first start and renamed to `progress.json.imported`.)

To keep the phone's screen on during playback, the page must count as secure. Browsers only allow the screen wake lock on HTTPS or `localhost`. Over plain `http://` on your network, the reader shows a notice and the screen may turn off. You can fix this in either of two ways:
- **Without HTTPS:** in Chrome on the phone, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enable it, add the app's address (for example `http://192.168.0.100:3000`), and relaunch Chrome.
- **With HTTPS:** serve the app through Caddy, Traefik, or Tailscale Serve.

### Install as an app (PWA)

Once the page counts as secure (HTTPS, or the Chrome flag above), open Chrome's menu and choose **Install app** (on some versions, **Add to Home screen**). The app then opens in its own window without the address bar, and starts on the library.

### Sharing with friends (Google login)

Without any setup the app is single-user: everyone who can reach it shares one set of reading positions. To put it on the internet (for example behind a Cloudflare Tunnel) and let only your friends in, turn on Google login:

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an OAuth client of type **Web application**. Add `https://<your-host>/api/auth/callback/google` as an authorized redirect URI.
2. Copy `.env.example` to `.env` next to `docker-compose.yml` and fill it in: the client ID and secret, a `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), and `BETTER_AUTH_URL=https://<your-host>`.
3. Restart with `docker compose up -d`. While there is no admin, the server prints a one-time link:
   ```sh
   docker compose logs app | grep -A1 "No admin yet"
   ```
   Open it and sign in with Google. That account becomes the admin, and the reading positions saved before login was turned on move to it.

After that, every page needs a signed-in, approved account. A friend who signs in waits on a "waiting for approval" screen until you approve them on the **Admin** page (avatar menu on the library). There you can also:
- pre-approve an email, so that account gets in on its first sign-in
- block or remove people, and make other admins
- limit which series each person sees
- see how far each person is in their books

Each person has their own reading positions. Nothing is emailed; Google handles the sign-in.

### Development

```sh
cd app
bun install
bun --bun run dev    # reads ../books, writes ../data
```

`BOOKS_DIR`, `DATA_DIR`, and `PORT` can be set through environment variables, and the Google login variables from `.env.example` work the same way in development (use `BETTER_AUTH_URL=http://localhost:3000` and add `http://localhost:3000/api/auth/callback/google` to the OAuth client).

The database is SQLite through Drizzle. After changing `app/src/server/db/schema.ts`, run `bun run db:generate` and commit the new folder under `app/drizzle/`; migrations run on startup. If you change better-auth's options in `app/src/server/auth/options.ts`, run `bun run auth:generate` first to regenerate `app/src/server/db/auth-schema.ts`.

## Reader controls

| Key | Action |
|-----|--------|
| Space / K | Play or pause |
| ← / → | Skip back or forward 15 s |
| Shift + ← / → | Previous or next paragraph |
| [ / ] | Slower or faster |
| F | Turn auto-follow on or off |

The highlight can follow the **paragraph**, the **word** being spoken, or **both**; choose in Settings (the gear on the library page), where you can also pick colors and opacity. Click any paragraph to jump the audio there. If you scroll yourself, auto-follow pauses; click **Back to narration** to turn it back on. Headphone buttons and lock-screen controls work through the Media Session API.

## License

[MIT](LICENSE). This covers the code only; bring your own books and audiobooks.
