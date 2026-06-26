// app.js — wiring for the console.

const els = {
  enable: document.getElementById("enableBtn"),
  test: document.getElementById("testBtn"),
  dot: document.getElementById("dot"),
  status: document.getElementById("statusLabel"),
  hint: document.getElementById("hint"),
  phase: document.getElementById("phase"),
  levels: document.getElementById("levels"),
  devices: document.getElementById("deviceCount"),
};

// iOS only allows push for a Home-Screen PWA opened in standalone mode.
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;
const pushSupported = "serviceWorker" in navigator && "PushManager" in window;

function setStatus(on) {
  els.dot.dataset.on = String(on);
  els.status.textContent = on ? "Notifications on" : "Notifications off";
  els.enable.hidden = on;
  els.test.hidden = !on;
}

function setHint(text, kind = "") {
  els.hint.textContent = text;
  els.hint.className = "hint" + (kind ? " " + kind : "");
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function loadStatus() {
  try {
    const r = await fetch("/status");
    const s = await r.json();
    els.phase.textContent = `Phase ${s.phaseId ?? "—"} · ${s.phase}`;
    els.devices.textContent = s.devices === 1 ? "1 device" : `${s.devices} devices`;
    els.levels.innerHTML = "";
    for (const n of s.nudges) {
      const li = document.createElement("li");
      li.className = "level";
      li.innerHTML = `<span class="time">${n.time}</span><span class="title">${n.title}</span>`;
      els.levels.appendChild(li);
    }
  } catch {
    els.phase.textContent = "Server unreachable";
  }
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function enable() {
  try {
    setHint("Requesting permission…");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setHint("Permission denied. On iOS you must remove the app from the Home Screen and re-add it to ask again.", "warn");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const key = await (await fetch("/vapidPublicKey")).text();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    await fetch("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
    setStatus(true);
    setHint("You're armed. Nudges will arrive on schedule.");
    loadStatus();
  } catch (err) {
    setHint("Couldn't enable: " + err.message, "err");
  }
}

async function sendTest() {
  setHint("Sending…");
  await fetch("/test", { method: "POST" });
  setHint("Test sent. It should land in a second or two.");
}

async function init() {
  loadStatus();

  if (!pushSupported) {
    els.enable.disabled = true;
    setHint("This browser doesn't support push.", "warn");
    return;
  }
  if (isIOS && !isStandalone) {
    els.enable.disabled = true;
    setHint("On iPhone: tap Share → Add to Home Screen, then open the app from your Home Screen and come back here to enable.", "warn");
    return;
  }

  await navigator.serviceWorker.register("/sw.js");
  const existing = await currentSubscription();
  setStatus(!!existing);
  if (existing) setHint("You're armed. Nudges will arrive on schedule.");

  els.enable.addEventListener("click", enable);
  els.test.addEventListener("click", sendTest);
}

init();
