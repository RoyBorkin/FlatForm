<!-- FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved -->
# Publishing FlatForm on GitHub

This guide takes FlatForm from the zip file to three public things:

| What | Where |
|---|---|
| The source code | `https://github.com/royborkin/FlatForm` |
| The web app | `https://royborkin.github.io/FlatForm/` |
| Windows and macOS installers | `https://github.com/royborkin/FlatForm/releases` |

You do the uploading once. After that, GitHub's own computers (GitHub Actions) build the web app and the installers for you, using the workflow files in `.github/workflows/`. You never need a Mac to build the Mac app, or a PC to build the Windows one.

> **Why it was stuck on the loading screen.** GitHub Pages was set to *Deploy from a branch*. That publishes the repository files exactly as they are, including `index.html`, which points at the source code (`/src/main.tsx`) instead of the built app. Browsers cannot run that file, so the app never started. Step 3 below switches Pages to *GitHub Actions*, which builds FlatForm first and publishes the result. The new loading screen now says this in plain words if it ever happens again.

---

## 1. Prepare the folder on your computer

1. Unzip `flatform.zip`. You get a folder called `flatform`. You can rename it `FlatForm` if you like; the name of the folder does not matter.
2. Install **Git** if you do not have it:
   - Windows: <https://git-scm.com/download/win> (keep the default options; it includes the *Git Credential Manager*, which handles signing in).
   - macOS: open *Terminal* and type `git --version`. If Git is missing, macOS offers to install the Command Line Tools; accept.
3. Optional but easiest for signing in: install **GitHub CLI** from <https://cli.github.com>, then run `gh auth login` and pick *GitHub.com → HTTPS → Login with a web browser*.

The folder already contains a Git history (the `.git` folder is hidden). You do not need to run `git init`.

> If you prefer not to use a terminal at all, **GitHub Desktop** (<https://desktop.github.com>) works too: *File → Add local repository*, choose the folder, then *Publish repository* (untick *Keep this code private*). Then continue at step 3.

## 2. Create the repository and push the code

### 2a. If the `FlatForm` repository does not exist yet

1. Go to <https://github.com/new>.
2. **Owner**: `royborkin`. **Repository name**: `FlatForm`. Capital letters matter, because the web address will be `/FlatForm/`.
3. Choose **Public** (free GitHub Pages needs a public repository; the *All Rights Reserved* licence still protects the code).
4. Leave *Add a README*, *.gitignore* and *licence* **unticked**. The project already has them, and adding them here makes the first push fail.
5. Click **Create repository**.

### 2b. If you already created `FlatForm` and uploaded files to it

The files you uploaded before have a different history from the one in the zip. Pick one:

- **Start clean (simplest):** in the repository open *Settings*, scroll to the bottom, *Delete this repository*, then do 2a.
- **Keep the repository and replace its contents:** push with `--force` in the next step (shown below). This replaces everything in the repository with the zip's version.

### 2c. Push

Open a terminal **in the project folder** (Windows: right-click inside the folder → *Open in Terminal* or *Git Bash Here*; macOS: in Terminal type `cd ` and drag the folder onto the window, then press Enter), and run:

```bash
git branch -M main
git remote add origin https://github.com/royborkin/FlatForm.git
git push -u origin main
```

- If Git says `remote origin already exists`, run `git remote set-url origin https://github.com/royborkin/FlatForm.git` instead of the `add` line.
- If the push is rejected because the repository already has other files (case 2b, second option), run `git push -u origin main --force`.
- If you are asked to sign in, a browser window opens (Git Credential Manager or GitHub CLI). Approve it. GitHub no longer accepts your account password in the terminal; if you are asked for a password there, create a token at *GitHub → Settings → Developer settings → Personal access tokens → Fine-grained*, give it *Contents: Read and write* on `FlatForm`, and paste the token as the password.

Refresh the repository page on GitHub. You should see the README with the FlatForm icon.

## 3. Turn on the web app (GitHub Pages)

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**. (Not *Deploy from a branch*: that is what caused the stuck loading screen.)
3. Open the **Actions** tab. If GitHub asks whether to enable workflows, click **I understand my workflows, go ahead and enable them**.
4. Click **Deploy web app to GitHub Pages** on the left, then **Run workflow → Run workflow**. (It also runs by itself every time you push to `main`.)
5. Wait for the green tick (about 2–3 minutes). The *deploy* step shows the address.
6. Open <https://royborkin.github.io/FlatForm/>. The first visit downloads about 3 MB and shows the loading screen for a few seconds while the first model is built.

Your portfolio at `royborkin.github.io` is not affected: project sites live in their own folder (`/FlatForm/`).

Every later `git push` to `main` updates the web app automatically. The **CI** workflow also runs on every push and checks that the code type-checks, the tests pass and the app builds.

## 4. Build the Windows and macOS apps (Releases)

The *Desktop release* workflow builds, on GitHub's machines:

| File | For |
|---|---|
| `FlatForm_1.0.0_x64_en-US.msi` | Windows installer (Windows 10/11) |
| `FlatForm_1.0.0_x64-setup.exe` | Windows installer, alternative format |
| `FlatForm_1.0.0_universal.dmg` | macOS 11 or later, Apple silicon and Intel |
| `FlatForm_universal.app.tar.gz` | The bare macOS app (for updaters; most people want the `.dmg`) |

### Make the first release

Either:

- **From the website:** *Actions* tab → **Desktop release** → **Run workflow** → **Run workflow**. The release is named after the version in `src-tauri/tauri.conf.json` (now `1.0.0`, so the tag is `v1.0.0`).

or, from the terminal in the project folder:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Then:

1. Watch *Actions → Desktop release*. Two jobs run side by side: *windows-latest* and *macos-latest*. The first run takes about 15–25 minutes (the Rust toolchain compiles everything once; later runs are faster thanks to caching).
2. When both are green, open the **Releases** page (right-hand side of the repository's main page). You will find a **draft** release called *FlatForm v1.0.0* with the files attached and install notes already written.
3. Click the pencil icon, check the text, and press **Publish release**. Drafts are invisible to the public until you do this.

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

1. Make your changes and check them locally (`npm run dev`).
2. Set the new version everywhere at once:
   ```bash
   npm run version:set 1.1.0
   ```
3. Commit and push:
   ```bash
   git add -A
   git commit -m "FlatForm 1.1.0"
   git push
   ```
   The web app updates by itself within a few minutes.
4. Make the installers: `git tag v1.1.0 && git push origin v1.1.0` (or *Actions → Desktop release → Run workflow*), then publish the draft release as in step 4.

Versions must go up (1.0.0 → 1.0.1 → 1.1.0 …). The Windows installer refuses to install an older or identical version over a newer one.

## 6. If something goes wrong

| Symptom | Fix |
|---|---|
| The web address shows *404* | Pages has not deployed yet. Check *Actions → Deploy web app to GitHub Pages* for a green tick, and that *Settings → Pages → Source* is *GitHub Actions*. |
| The loading screen says *"This page is the source code, not the built app"* | *Settings → Pages → Source* is still *Deploy from a branch*. Switch it to *GitHub Actions* and run the Pages workflow. |
| The web app shows an old version | Hard-refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac). |
| A workflow fails at `npm ci` | `package-lock.json` must be committed. It is in the zip; make sure it was pushed. |
| The deploy step fails with *"environment protection rules"* | *Settings → Environments → github-pages* → allow the `main` branch (or remove the rule). |
| *Desktop release* fails with *"Resource not accessible by integration"* | *Settings → Actions → General → Workflow permissions* → **Read and write permissions** → Save, then re-run. |
| A release with the same tag already exists | Delete the old draft release (and its tag under *Tags*), or raise the version with `npm run version:set`. |
| The push asks for a password and rejects it | Use GitHub CLI (`gh auth login`) or a personal access token, as in step 2c. |

## What lives where

| File | Role |
|---|---|
| `.github/workflows/pages.yml` | Builds the web app on every push to `main` and publishes it to Pages |
| `.github/workflows/ci.yml` | Type-check, tests and build on every push and pull request |
| `.github/workflows/release.yml` | Builds the Windows and macOS installers into a draft release |
| `src-tauri/tauri.conf.json` | Desktop app name, version, icons, installer settings |
| `scripts/set-version.mjs` | `npm run version:set x.y.z` |
| `scripts/notices.mjs` | Writes `public/THIRD-PARTY-NOTICES.txt` (runs on every build) |
