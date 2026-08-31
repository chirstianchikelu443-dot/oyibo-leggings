const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs/promises");

const { readJSON, writeJSON } = require("./db-utils");
const { requireAdmin } = require("./auth-middleware");
const { logEvent } = require("./security-log");
const { backupBeforeWrite } = require("./backup-utils");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "products-data.json");
const UPLOAD_DIR = path.join(__dirname, "uploads", "products");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — client already compresses before this
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG or WEBP images are allowed."));
  },
});

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || crypto.randomUUID()
  );
}

function parseListField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

// GET /api/products — public
router.get("/", async (req, res) => {
  const products = await readJSON(DATA_FILE);
  res.json(products);
});

// GET /api/products/:id — public
router.get("/:id", async (req, res) => {
  const products = await readJSON(DATA_FILE);
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  res.json(product);
});

// POST /api/products — admin, multipart/form-data with optional "image" file
router.post("/", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const products = await readJSON(DATA_FILE);
    const body = req.body || {};

    if (!body.name || !body.price) {
      return res.status(400).json({ error: "Name and price are required." });
    }
    if (body.name.length > 150) {
      return res.status(400).json({ error: "Product name is too long." });
    }
    if (body.description && body.description.length > 2000) {
      return res.status(400).json({ error: "Description is too long." });
    }
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0 || price > 100000000) {
      return res
        .status(400)
        .json({ error: "Price must be a valid positive number." });
    }

    const id = slugify(body.name) + "-" + Date.now().toString(36);

    const product = {
      id,
      name: body.name,
      price,
      category: body.category || "Tops",
      colors: parseListField(body.colors),
      sizes: parseListField(body.sizes).length
        ? parseListField(body.sizes)
        : ["S", "M", "L", "XL"],
      badge: body.badge || "",
      description: body.description || "",
      image: req.file
        ? `/uploads/products/${req.file.filename}`
        : body.imageUrl || "",
      inStock:
        body.inStock === undefined
          ? true
          : body.inStock === "true" || body.inStock === true,
      createdAt: new Date().toISOString(),
    };

    await backupBeforeWrite(DATA_FILE);
    products.unshift(product);
    await writeJSON(DATA_FILE, products);
    logEvent("PRODUCT_CREATED", {
      ip: req.ip,
      id: product.id,
      name: product.name,
    });
    res.status(201).json(product);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Could not save the product. " + err.message });
  }
});

// PUT /api/products/:id — admin, multipart/form-data, image optional (replaces old one)
router.put("/:id", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const products = await readJSON(DATA_FILE);
    const index = products.findIndex((p) => p.id === req.params.id);
    if (index === -1)
      return res.status(404).json({ error: "Product not found." });

    const body = req.body || {};
    const existing = products[index];
    const oldImage = existing.image;

    const updated = {
      ...existing,
      name: body.name ?? existing.name,
      price: body.price !== undefined ? Number(body.price) : existing.price,
      category: body.category ?? existing.category,
      colors:
        body.colors !== undefined
          ? parseListField(body.colors)
          : existing.colors,
      sizes:
        body.sizes !== undefined ? parseListField(body.sizes) : existing.sizes,
      badge: body.badge ?? existing.badge,
      description: body.description ?? existing.description,
      inStock:
        body.inStock === undefined
          ? existing.inStock
          : body.inStock === "true" || body.inStock === true,
      image: req.file
        ? `/uploads/products/${req.file.filename}`
        : existing.image,
    };

    await backupBeforeWrite(DATA_FILE);
    products[index] = updated;
    await writeJSON(DATA_FILE, products);
    logEvent("PRODUCT_UPDATED", {
      ip: req.ip,
      id: updated.id,
      name: updated.name,
    });

    // Clean up the replaced image file (only if it was a locally-uploaded one, not a seed image)
    if (req.file && oldImage && oldImage.startsWith("/uploads/products/")) {
      const oldPath = path.join(__dirname, oldImage);
      fs.unlink(oldPath).catch(() => {});
    }

    res.json(updated);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Could not update the product. " + err.message });
  }
});

// DELETE /api/products/:id — admin
router.delete("/:id", requireAdmin, async (req, res) => {
  const products = await readJSON(DATA_FILE);
  const index = products.findIndex((p) => p.id === req.params.id);
  if (index === -1)
    return res.status(404).json({ error: "Product not found." });

  await backupBeforeWrite(DATA_FILE);
  const [removed] = products.splice(index, 1);
  await writeJSON(DATA_FILE, products);
  logEvent("PRODUCT_DELETED", {
    ip: req.ip,
    id: removed.id,
    name: removed.name,
  });

  if (removed.image && removed.image.startsWith("/uploads/products/")) {
    const imgPath = path.join(__dirname, removed.image);
    fs.unlink(imgPath).catch(() => {});
  }

  res.json({ success: true });
});

module.exports = router;
