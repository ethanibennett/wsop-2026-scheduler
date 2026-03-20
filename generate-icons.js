#!/usr/bin/env node
// Run: node generate-icons.js
// Generates PWA icons at public/icon-192.png and public/icon-512.png
// Requires: npm install canvas (if not already installed)

const fs = require('fs');
const path = require('path');

let createCanvas;
try {
  createCanvas = require('canvas').createCanvas;
} catch (e) {
  console.error('canvas module not found. Install it with: npm install canvas');
  console.error('Alternatively, the app will use icon.svg as a fallback.');
  process.exit(1);
}

function generateIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const s = size / 512;

  // Background with rounded corners
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  roundRect(ctx, 0, 0, size, size, 64 * s);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  roundRect(ctx, 24 * s, 24 * s, 464 * s, 464 * s, 48 * s);
  ctx.stroke();

  // Spade symbol
  ctx.fillStyle = '#e8e8e8';
  ctx.beginPath();
  const cx = 256 * s, top = 120 * s;
  ctx.moveTo(cx, top);
  ctx.bezierCurveTo(cx, top, 160 * s, 210 * s, 160 * s, 270 * s);
  ctx.bezierCurveTo(160 * s, 310 * s, 190 * s, 340 * s, 230 * s, 340 * s);
  ctx.bezierCurveTo(245 * s, 340 * s, 255 * s, 335 * s, cx, 330 * s);
  ctx.bezierCurveTo(257 * s, 335 * s, 267 * s, 340 * s, 282 * s, 340 * s);
  ctx.bezierCurveTo(322 * s, 340 * s, 352 * s, 310 * s, 352 * s, 270 * s);
  ctx.bezierCurveTo(352 * s, 210 * s, cx, top, cx, top);
  ctx.fill();

  // Stem
  ctx.fillRect(cx - 4 * s, 310 * s, 8 * s, 70 * s);

  // WSOP text
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold ' + Math.round(72 * s) + 'px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WSOP', cx, 440 * s);

  return c.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

const publicDir = path.join(__dirname, 'public');
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), generateIcon(192));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), generateIcon(512));
console.log('Generated public/icon-192.png (192x192)');
console.log('Generated public/icon-512.png (512x512)');
