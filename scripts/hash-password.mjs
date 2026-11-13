#!/usr/bin/env node
// Hash the super-admin password for ADMIN_PASSWORD_HASH (bcrypt, cost 12).
//
//   node scripts/hash-password.mjs "my long passphrase"      # hash printed on stdout
//   node scripts/hash-password.mjs                           # prompts (input hidden) — keeps it out of shell history
//   printf %s "my passphrase" | node scripts/hash-password.mjs
//
// stdout = the raw bcrypt hash only (so `HASH=$(node scripts/hash-password.mjs ...)` works).
// stderr = ready-to-paste variants: the base64 form ("base64:…", recommended for .env / docker compose because bcrypt
// hashes contain `$`, which compose would try to interpolate) and the `$$`-escaped form.
import bcrypt from "bcryptjs";
import readline from "node:readline";

async function readHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    const write = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = (s) => {
      if (s.includes(prompt)) write?.(s);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stderr.write("\n");
      resolve(answer);
    });
  });
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
  let password = process.argv[2];
  if (password === "-h" || password === "--help") {
    process.stderr.write('Usage: node scripts/hash-password.mjs "password"   (or no argument to be prompted)\n');
    process.exit(0);
  }
  if (password == null) {
    if (process.stdin.isTTY) {
      password = await readHidden("Admin password: ");
      const again = await readHidden("Repeat password: ");
      if (again !== password) {
        process.stderr.write("Passwords do not match.\n");
        process.exit(1);
      }
    } else {
      password = await readStdin();
    }
  }
  if (!password) {
    process.stderr.write("No password given.\n");
    process.exit(1);
  }
  if (password.length < 12) process.stderr.write("Warning: use at least 12 characters for the admin password.\n");
  if (Buffer.byteLength(password) > 72) process.stderr.write("Note: bcrypt only uses the first 72 bytes of the password.\n");

  const hash = await bcrypt.hash(password, 12);
  process.stdout.write(hash + "\n");
  process.stderr.write(
    [
      "",
      "Put ONE of these in your .env:",
      `  ADMIN_PASSWORD_HASH=base64:${Buffer.from(hash).toString("base64")}   # recommended (no $ to escape)`,
      `  ADMIN_PASSWORD_HASH=${hash.replace(/\$/g, "$$$$")}   # docker compose with $$ escaping`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  process.stderr.write(`hash-password failed: ${err?.message ?? err}\n`);
  process.exit(1);
});
