const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

const { readJSON, writeJSON } = require("./db-utils");
const { requireAdmin } = require("./auth-middleware");
const { logEvent } = require("./security-log");
const { backupBeforeWrite } = require("./backup-utils");

const router = express.Router();

// Was a file path before (path.join(__dirname, "products-data.json")).
// Now it's just the Redis key db-utils.js stores/reads the product list under.
const DATA_KEY = "products-data";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Files now go to memory (a Buffer), not local disk — then get streamed
// straight to Cloudinary in the route handler below.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — client already compresses before this
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG or WEBP images are allowed."));
  },
});

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "oyibo-leggings/products" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

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
  const products = await readJSON(DATA_KEY);
  res.json(products);
});

// GET /api/products/:id — public
router.get("/:id", async (req, res) => {
  const products = await readJSON(DATA_KEY);
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  res.json(product);
});

// POST /api/products — admin, multipart/form-data with optional "image" file
router.post("/", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const products = await readJSON(DATA_KEY);
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

    let imageUrl = body.imageUrl || "";
    let imagePublicId = "";
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      imageUrl = result.secure_url;
      imagePublicId = result.public_id;
    }

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
      image: imageUrl,
      imagePublicId, // used later to clean up the Cloudinary asset on edit/delete
      inStock:
        body.inStock === undefined
          ? true
          : body.inStock === "true" || body.inStock === true,
      createdAt: new Date().toISOString(),
    };

    await backupBeforeWrite(DATA_KEY);
    products.unshift(product);
    await writeJSON(DATA_KEY, products);
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
    const products = await readJSON(DATA_KEY);
    const index = products.findIndex((p) => p.id === req.params.id);
    if (index === -1)
      return res.status(404).json({ error: "Product not found." });

    const body = req.body || {};
    const existing = products[index];

    let imageUrl = existing.image;
    let imagePublicId = existing.imagePublicId || "";
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      imageUrl = result.secure_url;
      imagePublicId = result.public_id;
    }

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
      image: imageUrl,
      imagePublicId,
    };

    await backupBeforeWrite(DATA_KEY);
    products[index] = updated;
    await writeJSON(DATA_KEY, products);
    logEvent("PRODUCT_UPDATED", {
      ip: req.ip,
      id: updated.id,
      name: updated.name,
    });

    // Clean up the replaced image on Cloudinary (only if a new one was uploaded)
    if (req.file && existing.imagePublicId) {
      cloudinary.uploader.destroy(existing.imagePublicId).catch(() => {});
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
  const products = await readJSON(DATA_KEY);
  const index = products.findIndex((p) => p.id === req.params.id);
  if (index === -1)
    return res.status(404).json({ error: "Product not found." });

  await backupBeforeWrite(DATA_KEY);
  const [removed] = products.splice(index, 1);
  await writeJSON(DATA_KEY, products);
  logEvent("PRODUCT_DELETED", {
    ip: req.ip,
    id: removed.id,
    name: removed.name,
  });

  if (removed.imagePublicId) {
    cloudinary.uploader.destroy(removed.imagePublicId).catch(() => {});
  }

  res.json({ success: true });
});

module.exports = router;
