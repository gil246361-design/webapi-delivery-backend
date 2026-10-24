import fs from "fs";
import path from "path";
import http from "http";
// Load .env without requiring an additional package. Existing process environment wins.
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const pos = line.indexOf("=");
    if (pos < 1) continue;
    const key = line.slice(0, pos).trim();
    let value = line.slice(pos + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
import { app } from "./app";
import { ensureSchema } from "./dbconnect";
const port = Number(process.env.PORT) || 3000;
const server = http.createServer(app);
ensureSchema()
  .then(() => console.log("Database schema ready"))
  .catch((err) => console.error("ensureSchema failed (ตรวจสอบ DB_* ใน .env และสถานะ MySQL):", err))
  .finally(() => server.listen(port, () => console.log(`Server is started on port ${port}`)));
