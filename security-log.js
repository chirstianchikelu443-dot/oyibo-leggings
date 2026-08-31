// Simple security event log — never log passwords or tokens.
// These show up in Render's log viewer (Logs tab on the service).

function logEvent(type, details = {}) {
  console.log(`[SECURITY] ${new Date().toISOString()} ${type}`, JSON.stringify(details));
}

module.exports = { logEvent };
