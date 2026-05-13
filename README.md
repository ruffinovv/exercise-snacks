# Exercise Snacks

Local-first PWA prototype for work-from-home exercise breaks.

## Run Locally

```powershell
cd "C:\Users\jmmen\Documents\New project\exercise-snacks"
node dev-server.js
```

Then open:

```text
http://127.0.0.1:4173
```

## Deploy On GitHub Pages

This app is a static PWA, so it can be hosted directly from a GitHub repository.

1. Create a public repository named `exercise-snacks`.
2. Upload the contents of this folder to the repository root.
3. In GitHub, open `Settings > Pages`.
4. Set `Source` to `Deploy from a branch`.
5. Set the branch to `main` and folder to `/ (root)`.
6. Save.

The app will be available at:

```text
https://<github-username>.github.io/exercise-snacks/
```

For the current GitHub account, that should be:

```text
https://ruffinovv.github.io/exercise-snacks/
```

## Current Features

- 90-day seeded workout plan starting on May 13, 2026.
- Start time, break interval, and exercises-per-break controls.
- Daily break schedule with target reps and target weights.
- Done, actual-result, skip-exercise, and skip-day flows.
- Progress and plan views.
- Local browser persistence.
- Export/reset local data.
- Optional browser reminders for planned break times.

## Notification Notes

The prototype supports local browser notifications while the app is open or installed and the browser allows notifications for the app URL. A Play Store version should eventually use native Android notifications for more reliable background reminders.
