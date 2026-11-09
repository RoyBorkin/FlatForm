<!-- FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved -->
# Publishing FlatForm on GitHub

This guide takes FlatForm from the zip file to three public things:

| What | Where |
|---|---|
| The source code | `https://github.com/royborkin/FlatForm` |
| The web app | `https://royborkin.github.io/FlatForm/` |
| Windows and macOS installers | `https://github.com/royborkin/FlatForm/releases` |

Everything below uses **GitHub Desktop** and the GitHub website; no command line is needed. You do the uploading once. After that, GitHub's own computers (GitHub Actions) build the web app and the installers for you, using the workflow files in `.github/workflows/`. You never need a Mac to build the Mac app, or a PC to build the Windows one.

> **Why it was stuck on the loading screen.** GitHub Pages was set to *Deploy from a branch*. That publishes the repository files exactly as they are, including `index.html`, which points at the source code (`/src/main.tsx`) instead of the built app. Browsers cannot run that file, so the app never started. Step 3 below switches Pages to *GitHub Actions*, which builds FlatForm first and publishes the result. The new loading screen now says this in plain words if it ever happens again.

---

## 1. Prepare the folder on your computer

1. Unzip `flatform.zip`. You get a folder called `flatform` (rename it `FlatForm` if you like; the folder name does not matter). It already contains the Git history (a hidden `.git` folder), so there is nothing to initialise.
2. Install **GitHub Desktop** from <https://desktop.github.com> and sign in with your GitHub account (*File → Options → Accounts* on Windows, *GitHub Desktop → Settings → Accounts* on macOS).

## 2. Create the repository and push the code

### 2a. First time: publish the folder as `FlatForm`

1. In GitHub Desktop: **File → Add local repository…**, choose the unzipped folder, **Add repository**.
2. Click **Publish repository** in the top bar.
3. **Name**: `FlatForm` (capital letters matter: the web address will be `/FlatForm/`). **Untick** *Keep this code private* (free GitHub Pages needs a public repository; the *All Rights Reserved* licence still protects the code).
4. Click **Publish repository**. GitHub Desktop creates `github.com/royborkin/FlatForm` and uploads everything.

### 2b. If `FlatForm` already exists on GitHub

The simplest route is to start clean: on github.com open the repository's **Settings**, scroll to the bottom, **Delete this repository**, then do 2a. (GitHub Desktop cannot overwrite a repository that has a different history.)

If the repository already holds *this* project (you published it from this folder before), you do not need to do anything here: just commit and push as in step 5.

## 3. Turn on the web app (GitHub Pages)

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**. (Not *Deploy from a branch*: that is what caused the stuck loading screen.)
3. Open the **Actions** tab. If GitHub asks whether to enable workflows, click **I understand my workflows, go ahead and enable them**.
4. Click **Deploy web app to GitHub Pages** on the left, then **Run workflow → Run workflow**. (It also runs by itself every time you push to `main`.)
5. Wait for the green tick (about 2–3 minutes). The *deploy* step shows the address.
6. Open <https://royborkin.github.io/FlatForm/>. The first visit downloads about 3 MB and shows the loading screen for a few seconds while the first model is built.

Your portfolio at `royborkin.github.io` is not affected: project sites live in their own folder (`/FlatForm/`).

Every later push to `main` (GitHub Desktop: **Push origin**) updates the web app automatically. The **CI** workflow also runs on every push and checks that the code type-checks, the tests pass and the app builds.

## 4. Build the Windows and macOS apps (Releases)

The *Desktop release* workflow builds, on GitHub's machines:

| File | For |
|---|---|
| `FlatForm_1.1.3_x64_en-US.msi` | Windows installer (Windows 10/11) |
| `FlatForm_1.1.3_x64-setup.exe` | Windows installer, alternative format |
| `FlatForm_1.1.3_universal.dmg` | macOS 11 or later, Apple silicon and Intel |
| `FlatForm_universal.app.tar.gz` | The bare macOS app (for updaters; most people want the `.dmg`) |

### Make the first release

1. On github.com open the **Actions** tab → **Desktop release** (left) → **Run workflow** → **Run workflow**.
   The release is named after the version in `src-tauri/tauri.conf.json` (now `1.1.3`), and the workflow creates the tag `v1.1.3` for you. No tags are needed in GitHub Desktop.
2. Two jobs run side by side: *windows-latest* and *macos-latest*. The first run takes about 15–25 minutes; later runs are faster thanks to caching.
3. When both are green, open **Releases** (right-hand side of the repository's main page). You will find a **draft** called *FlatForm v1.1.3* with the files attached and install notes already written.
4. Click the pencil icon, check the text, and press **Publish release**. Drafts are invisible to the public until you do this.

**If a release run failed and you want to try again with the same version:** on github.com delete the draft under **Releases** (if one was made), then open **Tags**, click `v1.1.3` → **Delete**. Then run the workflow again. Otherwise the new run reuses the old tag, which points at the old code.

The README's *Download for Windows / macOS* link points to `releases/latest`, so it always opens the newest published release.

### What people see when they install (unsigned builds)

The apps are not code-signed, because that needs paid certificates. They are safe to open, but the operating systems warn the first time:

- **Windows:** *"Windows protected your PC"* (SmartScreen). Click **More info → Run anyway**. The warning fades once enough people have installed the same file.
- **macOS:** open the `.dmg`, drag **FlatForm** to **Applications**, then:
  - macOS 14 and earlier: Control-click (right-click) FlatForm in Applications → **Open** → **Open**.
  - macOS 15 and later: try to open it once, then go to **System Settings → Privacy & Security**, scroll down to *"FlatForm was blocked…"* and click **Open Anyway**.
  - If macOS ever says the app *"is damaged"*, run this once in Terminal and open it again:
    `xattr -dr com.apple.quarantine /Applications/FlatForm.app`

These notes are included in every release's description.

### Signing later (optional)

- **macOS:** with an Apple Developer account ($99/year), add the secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID` under *Settings → Secrets and variables → Actions*, uncomment them in `.github/workflows/release.yml`, and remove `"signingIdentity": "-"` from `src-tauri/tauri.conf.json`. Releases are then signed and notarised, and open with no warning.
- **Windows:** a code-signing certificate (or Azure Trusted Signing) can be added the same way; see <https://tauri.app/distribute/sign/windows/>.

## 5. Publishing an update

1. Change the files (or replace them with a new version from Claude), and check the app locally if you like (`npm run dev`).
2. Raise the version in three places, all to the same number, e.g. `1.1.3` → `1.2.0`:
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version = "…"`

   Or let a script do it: in GitHub Desktop choose **Repository → Open in Command Prompt** (Windows) / **Open in Terminal** (macOS) and run `npm run version:set 1.2.0` (needs Node.js from <https://nodejs.org> and `npm install` once).
3. In GitHub Desktop, the **Changes** tab lists every changed file. Type a summary bottom-left (e.g. *FlatForm 1.2.0*), click **Commit to main**, then **Push origin** in the top bar.
   The web app updates by itself within a few minutes (*Actions → Deploy web app to GitHub Pages*).
4. For new installers: *Actions → Desktop release → Run workflow*, then publish the draft release as in step 4.

Versions must go up (1.0.0 → 1.0.1 → 1.1.0 → 1.1.2 → 1.1.3 → 1.2.0 …). The Windows installer refuses to install an older or identical version over a newer one, and a release run for a version that already has a tag reuses that old tag.

## 6. If something goes wrong

| Symptom | Fix |
|---|---|
| The web address shows *404* | Pages has not deployed yet. Check *Actions → Deploy web app to GitHub Pages* for a green tick, and that *Settings → Pages → Source* is *GitHub Actions*. |
| The loading screen says *"This page is the source code, not the built app"* | *Settings → Pages → Source* is still *Deploy from a branch*. Switch it to *GitHub Actions* and run the Pages workflow. |
| The web app shows an old version | Hard-refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac). |
| A workflow fails at `npm ci` | `package-lock.json` must be committed. It is in the zip; make sure it was pushed. |
| The deploy step fails with *"environment protection rules"* | *Settings → Environments → github-pages* → allow the `main` branch (or remove the rule). |
| *Desktop release* fails with *"Resource not accessible by integration"* | *Settings → Actions → General → Workflow permissions* → **Read and write permissions** → Save, then re-run. |
| A release with the same tag already exists | Delete the old draft release and its tag on github.com (*Releases*, *Tags*), or raise the version (step 5). |
| GitHub Desktop says the push was rejected | Someone (or the website) changed the repository directly. Click **Fetch origin**, then **Pull origin**, then push again. |

## What lives where

| File | Role |
|---|---|
| `.github/workflows/pages.yml` | Builds the web app on every push to `main` and publishes it to Pages |
| `.github/workflows/ci.yml` | Type-check, tests and build on every push and pull request |
| `.github/workflows/release.yml` | Builds the Windows and macOS installers into a draft release |
| `src-tauri/tauri.conf.json` | Desktop app name, version, icons, installer settings |
| `scripts/set-version.mjs` | `npm run version:set x.y.z` (optional; you can edit the three files by hand) |
| `scripts/notices.mjs` | Writes `public/THIRD-PARTY-NOTICES.txt` (runs on every build) |
