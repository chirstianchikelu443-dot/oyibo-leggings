const jwt = require("jsonwebtoken");
const { logEvent } = require("./security-log");

const JWT_SECRET = process.env.JWT_SECRET;

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    logEvent("ADMIN_ACTION_BLOCKED_NO_TOKEN", {
      ip: req.ip,
      path: req.originalUrl,
    });
    return res
      .status(401)
      .json({ error: "Missing login token. Please log in again." });
  }

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    logEvent("ADMIN_ACTION_BLOCKED_BAD_TOKEN", {
      ip: req.ip,
      path: req.originalUrl,
    });
    return res
      .status(401)
      .json({ error: "Your session has expired. Please log in again." });
  }
}

module.exports = { requireAdmin };
