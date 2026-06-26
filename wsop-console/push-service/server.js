// server.js — serves the PWA and sends the pushes.
require("dotenv").config();
const express = require("express");
const webpush = require("web-push");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const { BASE_NUDGES, getCurrentPhase, getNudges } = require("./schedule");

const PORT = process.env.PORT || 3000;
const SUBS_FILE = path.join(__dirname, "subscriptions.json");

// --- VAPID ---------------------------------------------------------------
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("Missing VAPID keys. Run: npx web-push generate-vapid-keys");
  console.error("Then put them in .env (see .env.example).");
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT || "mailto:you@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// --- Subscription store (a JSON file is plenty for one user) --------------
function loadSubs() {
  try { return JSON.parse(fs.readFileSync(SUBS_FILE, "utf8")); }
  catch { return []; }
}
function saveSubs(subs) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}
let subscriptions = loadSubs();

// --- App -----------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/vapidPublicKey", (_req, res) => res.send(VAPID_PUBLIC_KEY));

app.get("/status", (_req, res) => {
  const phase = getCurrentPhase();
  res.json({
    phase: phase ? phase.label : "Off-plan",
    phaseId: phase ? phase.id : null,
    devices: subscriptions.length,
    nudges: getNudges().map(({ id, time, title }) => ({ id, time, title })),
  });
});

app.post("/subscribe", (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: "Invalid subscription." });
  if (!subscriptions.find((s) => s.endpoint === sub.endpoint)) {
    subscriptions.push(sub);
    saveSubs(subscriptions);
  }
  res.status(201).json({ ok: true });
});

app.post("/unsubscribe", (req, res) => {
  const { endpoint } = req.body || {};
  subscriptions = subscriptions.filter((s) => s.endpoint !== endpoint);
  saveSubs(subscriptions);
  res.json({ ok: true });
});

// Fire a test push immediately — the fastest way to verify the pipeline.
app.post("/test", async (_req, res) => {
  await sendToAll({ title: "Console armed", body: "Test push delivered. The pipeline works." });
  res.json({ ok: true, devices: subscriptions.length });
});

// --- Sending -------------------------------------------------------------
async function sendToAll(payload) {
  const data = JSON.stringify(payload);
  const dead = [];
  await Promise.all(
    subscriptions.map((sub) =>
      webpush.sendNotification(sub, data).catch((err) => {
        // 404/410 = subscription expired (common on iOS after inactivity). Prune it.
        if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
        else console.error("push error:", err.statusCode || err.message);
      })
    )
  );
  if (dead.length) {
    subscriptions = subscriptions.filter((s) => !dead.includes(s.endpoint));
    saveSubs(subscriptions);
    console.log(`Pruned ${dead.length} expired subscription(s).`);
  }
}

// --- Scheduler -----------------------------------------------------------
// Build one cron job per nudge in the base set. Per-phase swapping can be
// added later by rebuilding jobs on a phase boundary.
const jobs = [];
function buildJobs() {
  jobs.forEach((j) => j.stop());
  jobs.length = 0;
  for (const n of BASE_NUDGES) {
    if (!cron.validate(n.cron)) {
      console.warn(`Skipping ${n.id}: invalid cron "${n.cron}"`);
      continue;
    }
    const job = cron.schedule(n.cron, () => {
      // Respect the Phase 1 install ramp: only fire if this nudge is active today.
      const active = getNudges().some((a) => a.id === n.id);
      if (!active) {
        console.log(`[${new Date().toISOString()}] skipping ${n.id} (not active this week)`);
        return;
      }
      console.log(`[${new Date().toISOString()}] firing ${n.id}`);
      sendToAll({ title: n.title, body: n.body, tag: n.id });
    });
    jobs.push(job);
  }
  console.log(`Scheduled ${jobs.length} nudge(s).`);
}
buildJobs();

app.listen(PORT, () => {
  const phase = getCurrentPhase();
  console.log(`Console running on :${PORT}`);
  console.log(`Current phase: ${phase ? phase.label : "off-plan"}`);
  console.log(`${subscriptions.length} device(s) subscribed.`);
});
