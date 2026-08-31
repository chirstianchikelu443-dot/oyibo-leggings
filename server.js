require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");

const { ensureFile, readJSON } = require("./db-utils");
const { requireAdmin } = require("./auth-middleware");
const { logEvent } = require("./security-log");

const authRoutes = require("./auth-routes");
const productRoutes = require("./products-routes");
const settingsRoutes = require("./settings-routes");

const app = express();
const PORT = process.env.PORT || 3000;

// Render sits behind a proxy — this makes req.ip show the real visitor IP,
// which the login rate limiter depends on.
app.set("trust proxy", true);

// ---- sanity checks on required env vars ----
if (!process.env.JWT_SECRET) {
  console.error(
    "\n❌ Missing JWT_SECRET in .env — copy .env.example to .env and fill it in before starting the server.\n"
  );
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD_HASH && !process.env.ADMIN_PASSWORD) {
  console.warn(
    "\n⚠️ No ADMIN_PASSWORD or ADMIN_PASSWORD_HASH set. Admin login will not work until you set one as an environment variable.\n"
  );
}

// ---- security headers (applies to API responses from this server) ----
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()"
  );
  next();
});

// ---- middleware ----
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json({ limit: "1mb" }));

const uploadDir = path.join(__dirname, "uploads", "products");
fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// The 5 starter product photos ship flat in this folder (next to server.js) so they
// survive simple drag-and-drop uploads to GitHub. On first boot we copy them into the
// live "uploads/products" folder that the site actually serves images from.
const SEED_IMAGES = [
  "tropic-skirt.jpg",
  "butterfly-set.jpg",
  "collar-top.jpg",
  "ny-tee.jpg",
  "varsity-sweater.jpg",
];

async function copySeedImages() {
  for (const filename of SEED_IMAGES) {
    const src = path.join(__dirname, filename);
    const dest = path.join(uploadDir, filename);
    try {
      await fsp.access(dest);
    } catch {
      try {
        await fsp.copyFile(src, dest);
      } catch {
        // seed photo missing — not fatal, product will just show a broken image until re-uploaded
      }
    }
  }
}

// ---- routes ----
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// GET /api/admin/backup — admin only. Returns everything as one JSON file to save.
app.get("/api/admin/backup", requireAdmin, async (req, res) => {
  try {
    const products = await readJSON(path.join(__dirname, "products-data.json"));
    const settings = await readJSON(path.join(__dirname, "settings-data.json"));
    logEvent("BACKUP_DOWNLOADED", { ip: req.ip });
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="oyibo-backup-${new Date() .toISOString() .slice(0, 10)}.json"`
    );
    res.json({ exportedAt: new Date().toISOString(), products, settings });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Could not generate backup. " + err.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

// ---- make sure data files + seed images exist, then start listening ----
async function start() {
  await ensureFile(path.join(__dirname, "products-data.json"), []);
  await ensureFile(path.join(__dirname, "settings-data.json"), {
    businessName: "Oyibo Leggings",
  });
  await copySeedImages();

  app.listen(PORT, () => {
    console.log(`Oyibo Leggings API running on http://localhost:${PORT}`);
  });
}

start();
