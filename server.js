require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");

const { ensureFile } = require("./db-utils");

const authRoutes = require("./auth-routes");
const productRoutes = require("./products-routes");
const settingsRoutes = require("./settings-routes");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- sanity checks on required env vars ----
if (!process.env.JWT_SECRET) {
  console.error(
    "\n❌ Missing JWT_SECRET in .env — copy .env.example to .env and fill it in before starting the server.\n"
  );
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD_HASH && !process.env.ADMIN_PASSWORD) {
  console.warn(
    "\n⚠️  No ADMIN_PASSWORD or ADMIN_PASSWORD_HASH set. Admin login will not work until you set one as an environment variable.\n"
  );
}

// ---- middleware ----
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json());

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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

// ---- make sure data files + seed images exist, then start listening ----
async function start() {
  await ensureFile(path.join(__dirname, "products-data.json"), []);
  await ensureFile(path.join(__dirname, "settings-data.json"), { businessName: "Oyibo Leggings" });
  await copySeedImages();

  app.listen(PORT, () => {
    console.log(`Oyibo Leggings API running on http://localhost:${PORT}`);
  });
}

start();
