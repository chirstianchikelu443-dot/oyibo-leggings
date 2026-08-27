// Usage: node hash-password.js "yourNewPassword"
// Copy the printed hash into .env as ADMIN_PASSWORD_HASH

const bcrypt = require("bcryptjs");

const password = process.argv[2];

if (!password) {
  console.log("Usage: node hash-password.js \"yourNewPassword\"");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log("\nAdd this line to your .env file:\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
