# wsop-console lives in its own repo now

The WSOP 2027 Console (the PWA served at `futurega.me/console`, plus its
Capacitor iOS wrapper and push-service schedule) was split out to:

**https://github.com/ethanibennett/wsop-console**

It is **not** vendored here anymore. At deploy time, `build.js` clones that repo
into `./wsop-console/` (using the `CONSOLE_REPO_TOKEN` env var — a fine-grained,
read-only GitHub PAT for that one repo) and builds `app/` into
`wsop-console/app/dist`, where `server.js` serves it under `/console`.
`server.js` also `require()`s `wsop-console/push-service/schedule.js` from the
same clone.

The build is **fail-loud**: if the clone or console build fails, `build.js`
exits non-zero, Render marks the deploy failed, and the previous good deploy
stays live — no silent console-less deploy.

**To change the console:** work in the `wsop-console` repo. A new deploy of THIS
service (any push to its branch, or a manual redeploy) re-clones and rebuilds
the console at its `main` HEAD. (Override the branch with `CONSOLE_REPO_BRANCH`.)
