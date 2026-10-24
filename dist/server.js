"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
// Load .env without requiring an additional package. Existing process environment wins.
const envPath = path_1.default.resolve(process.cwd(), ".env");
if (fs_1.default.existsSync(envPath)) {
    for (const raw of fs_1.default.readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#"))
            continue;
        const pos = line.indexOf("=");
        if (pos < 1)
            continue;
        const key = line.slice(0, pos).trim();
        let value = line.slice(pos + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
            value = value.slice(1, -1);
        if (process.env[key] === undefined)
            process.env[key] = value;
    }
}
const app_1 = require("./app");
const dbconnect_1 = require("./dbconnect");
const port = Number(process.env.PORT) || 3000;
const server = http_1.default.createServer(app_1.app);
(0, dbconnect_1.ensureSchema)()
    .then(() => console.log("Database schema ready"))
    .catch((err) => console.error("ensureSchema failed (ตรวจสอบ DB_* ใน .env และสถานะ MySQL):", err))
    .finally(() => server.listen(port, () => console.log(`Server is started on port ${port}`)));
//# sourceMappingURL=server.js.map