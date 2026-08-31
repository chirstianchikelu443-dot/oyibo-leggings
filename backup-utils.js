// Keeps a few rolling backups of a JSON data file, made right before each write.
// Note: on Render's free tier, disk isn't persistent across restarts, so these
// backups only protect against a *bad edit*, not a server restart. For real
// crash protection, upgrade to a paid instance + persistent disk (see README).

const fs = require("fs/promises");
const path = require("path");

const MAX_BACKUPS_PER_FILE = 5;

async function backupBeforeWrite(filePath) {
  try {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, ".json");
    const backupDir = path.join(dir, "backups");
    await fs.mkdir(backupDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `${base}-${stamp}.json`);

    const current = await fs.readFile(filePath, "utf-8").catch(() => null);
    if (current === null) return; // nothing to back up yet

    await fs.writeFile(backupPath, current, "utf-8");

    // trim to the most recent MAX_BACKUPS_PER_FILE for this file
    const files = (await fs.readdir(backupDir)).filter((f) => f.startsWith(base + "-"));
    if (files.length > MAX_BACKUPS_PER_FILE) {
      files.sort();
      const toDelete = files.slice(0, files.length - MAX_BACKUPS_PER_FILE);
      await Promise.all(toDelete.map((f) => fs.unlink(path.join(backupDir, f)).catch(() => {})));
    }
  } catch {
    // backups are best-effort — never block a real save because of a backup failure
  }
}

module.exports = { backupBeforeWrite };
