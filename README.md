# Movie Night Ballot

A voting page for you and your friends. You paste a list of films; the host page pulls each film's poster, synopsis, cast and trailer from TMDB; friends rate them from a link; every vote lands in your Google Sheet.

## What's in this folder

| File | What it is |
| --- | --- |
| `index.html` | The page your friends open to vote |
| `admin.html` | Your host page: build the poll, see results |
| `config.js` | One setting: the address of your Google script |
| `common.js`, `style.css` | Shared code and styling |
| `Code.gs` | The script that goes inside your Google Sheet (do **not** upload this to GitHub) |

## One-time setup (about 15 minutes)

### 1. Get a TMDB key

1. Create a free account at https://www.themoviedb.org/ and confirm your email.
2. Go to **Settings → API** and request a key. Choose **Developer** (non-commercial use).
3. Copy the **API Key**. You'll paste it into the host page later. It never goes into any file.

### 2. Set up the Google Sheet

1. Create a new Google Sheet. Name it anything.
2. In the sheet, open **Extensions → Apps Script**.
3. Delete whatever is in the editor and paste in everything from `Code.gs`.
4. Near the top, change `'change-me'` to a password only you know. The script refuses host actions until you do.
5. Optional: put your email between the quotes on the `NOTIFY_EMAIL` line to get an email for each vote.
6. Click **Deploy → New deployment**. Click the gear next to "Select type" and choose **Web app**.
   - **Execute as:** Me
   - **Who has access:** Anyone
7. Click **Deploy**, then approve the permission prompts. Google will warn that the app is unverified because you wrote it yourself; choose **Advanced → Go to (your project)**.
8. Copy the **Web app URL**. It ends in `/exec`.

### 3. Connect the site to the sheet

Open `config.js` in any text editor and replace `PASTE_YOUR_WEB_APP_URL_HERE` with the URL you just copied. Keep the quotes.

### 4. Put the site on GitHub Pages

1. On GitHub, create a new **public** repository, for example `movie-ballot`.
2. On the repository page choose **uploading an existing file** and drag in `index.html`, `admin.html`, `config.js`, `common.js` and `style.css`. Commit.
3. Go to **Settings → Pages**. Under "Build and deployment" set **Source** to *Deploy from a branch*, pick the **main** branch and the **/ (root)** folder, then **Save**.
4. After a minute or two your site is at `https://YOUR-USERNAME.github.io/movie-ballot/`.

## Running a poll

1. Open `https://YOUR-USERNAME.github.io/movie-ballot/admin.html`.
2. Enter your host password and TMDB key. They are remembered in that browser only.
3. Set the title and the rating choices, one per line. Choices that start with a number count toward the average. Anything else, such as "Didn't watch", is counted separately.
4. Paste your films and series, one per line, with or without the year, and press **Find these films**.
5. Check the matches. Each line you typed is shown with the films and series TMDB found for it, with poster, year and synopsis.
   - A film is pre-selected only when exactly one result has the title (and year) you typed.
   - Where several films fit, or none do, you have to choose: pick one, search again with a different title or year, add the title with no details, or leave it off.
   - Nothing is added or dropped until every line has a choice and you press **Add these to the ballot**.
   - Each film on the ballot keeps a "You typed" label, a **Check this film on TMDB** link and a **Wrong film?** menu, so you can still fix one later.
6. Press **Publish poll** and send friends the link shown at the top.

Friends need no account. They can come back in the same browser and change their vote.

## Seeing the results

- **Host page → Results:** ranking, everyone's ratings, comments. You can remove a response there.
- **Your Google Sheet:** the `Results` tab has one row per person and one column per film for the current round. The `Votes` tab keeps every vote from every round as a backup.
- If you ticked "Let friends see the results", the voting page gets a Results tab as well.

## Starting a new poll

On the host page press **Start a new poll**. That clears the list and keeps your rating choices. Add the new titles and publish. The old poll stays live until you publish.

Your sheet is not wiped:

- The `Votes` tab keeps every vote from every round.
- The `Results` tab switches to the new round. The previous round's table is saved as its own tab, named after the old poll and the time.

To change the current poll without starting over (fix a synopsis, add one title), just edit and press **Publish changes**. Existing votes are kept.

## Good to know

- **Changing `Code.gs` later:** after editing, use **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**. That keeps the same URL.
- **Privacy:** anyone who has the link can vote, and the site is public on the internet. Names and ratings are stored in your sheet. Don't collect anything sensitive with it.
- **The host password** protects publishing and deleting. It is a simple shared password, sent to your own script over HTTPS, so pick one you don't use anywhere else.
- **TMDB credit:** the pages carry the text credit TMDB requires. TMDB's terms also ask that you show their logo; you can download an approved one from https://www.themoviedb.org/about/logos-attribution and add it to the footer if you keep using this.
- **Limits:** 60 films per poll and 500 votes per round.
