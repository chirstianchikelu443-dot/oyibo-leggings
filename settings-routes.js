const express = require("express");
const path = require("path");

const { readJSON, writeJSON } = require("./db-utils");
const { requireAdmin } = require("./auth-middleware");

const router = express.Router();
const DATA_FILE = path.join(__dirname, "settings-data.json");

// GET /api/settings — public
router.get("/", async (req, res) => {
  const settings = await readJSON(DATA_FILE);
  res.json(settings);
});

// PUT /api/settings — admin, JSON body. Merges into existing settings.
router.put("/", requireAdmin, async (req, res) => {
  try {
    const current = await readJSON(DATA_FILE);
    const updated = { ...current, ...req.body };
    await writeJSON(DATA_FILE, updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Could not save settings. " + err.message });
  }
});

module.exports = router;
