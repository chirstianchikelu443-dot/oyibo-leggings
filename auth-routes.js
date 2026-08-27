const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ADMIN_PASSWORD_PLAIN = process.env.ADMIN_PASSWORD;

// POST /api/auth/login  { password }  -> { token }
router.post("/login", async (req, res) => {
  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ error: "Password is required." });
  }

  if (!ADMIN_PASSWORD_HASH && !ADMIN_PASSWORD_PLAIN) {
    return res.status(500).json({
      error:
        "Admin password is not set up yet. Add ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH) as an environment variable on your host.",
    });
  }

  let ok = false;
  if (ADMIN_PASSWORD_HASH) {
    ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  } else if (ADMIN_PASSWORD_PLAIN) {
    ok = password === ADMIN_PASSWORD_PLAIN;
  }

  if (!ok) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "14d" });
  res.json({ token });
});

// GET /api/auth/verify  -> confirms a token is still valid
router.get("/verify", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ valid: false });

  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ valid: true });
  } catch {
    res.status(401).json({ valid: false });
  }
});

module.exports = router;
