// Tiny JSON-file "database" helper.
// Good enough for a single-shop admin panel with light traffic.
// Writes are queued per-file so two quick saves can't corrupt the file.

const fs = require("fs/promises");
const path = require("path");

const queues = new Map();

function withQueue(filePath, task) {
  const prev = queues.get(filePath) || Promise.resolve();
  const next = prev.then(task, task);
  queues.set(filePath, next.catch(() => {}));
  return next;
}

async function readJSON(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function writeJSON(filePath, data) {
  return withQueue(filePath, async () => {
    const tmpPath = filePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmpPath, filePath);
  });
}

async function ensureFile(filePath, defaultValue) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), "utf-8");
  }
}

module.exports = { readJSON, writeJSON, ensureFile };
