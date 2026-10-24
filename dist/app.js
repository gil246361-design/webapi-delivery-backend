"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const dbconnect_1 = require("./dbconnect");
const routing_1 = require("./routing");
exports.app = (0, express_1.default)();
// Middleware จัดการ CORS สำหรับทุก Request
exports.app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});
exports.app.use(express_1.default.json());
// ---------------------------------------------------------------
// ตัวช่วย
// ---------------------------------------------------------------
const MAX_BOXES_PER_ORDER = 3; // โจทย์: แต่ละรายการสั่งไม่เกิน 3 กล่อง
const round2 = (n) => Math.round(n * 100) / 100;
const num = (v, fallback) => {
    const n = parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : fallback;
};
const validLatLng = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const validQty = (q) => Number.isInteger(q) && q >= 1 && q <= MAX_BOXES_PER_ORDER;
/** ครอบ async handler ให้ error ทุกอย่างกลายเป็น JSON 500 */
const wrap = (fn) => (req, res, next) => {
    fn(req, res).catch(next);
};
/** ออเดอร์เปลี่ยนแล้ว แผนเส้นทางเดิมใช้ไม่ได้ → ลบทิ้งเพื่อไม่ให้ไรเดอร์เปิดใบงานเก่า */
async function invalidatePlan() {
    await dbconnect_1.conn.query("DELETE FROM route_plans");
}
const toCustomer = (c, lat, lng) => {
    const latitude = Number(c.latitude);
    const longitude = Number(c.longitude);
    return {
        customer_id: c.customer_id,
        name: c.name,
        phone: c.phone,
        latitude,
        longitude,
        ...(lat !== undefined && lng !== undefined ? { distance_km: round2((0, routing_1.haversineKm)(lat, lng, latitude, longitude)) } : {}),
    };
};
async function fetchOrders(lat, lng) {
    const [rows] = await dbconnect_1.conn.query(`
    SELECT o.order_id, o.customer_id, o.quantity, o.status, o.order_date,
           c.name, c.phone, c.latitude, c.longitude
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.customer_id
    ORDER BY o.order_id
  `);
    return rows.map((r) => {
        const latitude = Number(r["latitude"]);
        const longitude = Number(r["longitude"]);
        return {
            order_id: r["order_id"],
            customer_id: r["customer_id"],
            quantity: r["quantity"],
            status: r["status"],
            order_date: r["order_date"],
            name: r["name"],
            phone: r["phone"],
            latitude,
            longitude,
            distance_km: Number.isFinite(latitude) ? round2((0, routing_1.haversineKm)(lat, lng, latitude, longitude)) : null,
        };
    });
}
// ==========================================
// 1. Web API สำหรับจัดการข้อมูลลูกค้า (Customer)
// ==========================================
// 1.1 แสดงข้อมูลลูกค้าทุกคน
exports.app.get("/api/customers", wrap(async (req, res) => {
    const [rows] = await dbconnect_1.conn.query("SELECT * FROM customers ORDER BY customer_id");
    res.json({ success: true, data: rows.map((c) => toCustomer(c)) });
}));
// 1.2 ค้นหาจากส่วนหนึ่งของชื่อ หรือนามสกุล
exports.app.get("/api/customers/search", wrap(async (req, res) => {
    const keyword = String(req.query["keyword"] ?? "").trim();
    const [rows] = keyword
        ? await dbconnect_1.conn.query("SELECT * FROM customers WHERE name LIKE ? ORDER BY customer_id", [`%${keyword}%`])
        : await dbconnect_1.conn.query("SELECT * FROM customers ORDER BY customer_id");
    res.json({ success: true, data: rows.map((c) => toCustomer(c)) });
}));
// 1.3 ค้นลูกค้าทั้งหมดในระยะ 1 กิโลเมตรจากพิกัดที่กำหนด (ไม่ส่งพิกัดมา = ใช้พิกัดร้าน)
exports.app.get("/api/customers/nearby-1km", wrap(async (req, res) => {
    const lat = num(req.query["lat"], routing_1.SHOP.lat);
    const lng = num(req.query["lng"], routing_1.SHOP.lng);
    const [rows] = await dbconnect_1.conn.query("SELECT * FROM customers");
    const data = rows
        .map((c) => toCustomer(c, lat, lng))
        .filter((c) => (c.distance_km ?? Infinity) <= 1.0)
        .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
    res.json({ success: true, data });
}));
// เพิ่มข้อมูลลูกค้า
exports.app.post("/api/customers", wrap(async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    if (!name || !phone)
        return res.status(400).json({ success: false, message: "กรุณาระบุชื่อและเบอร์โทร" });
    if (!validLatLng(latitude, longitude))
        return res.status(400).json({ success: false, message: "พิกัดไม่ถูกต้อง" });
    const [result] = await dbconnect_1.conn.query("INSERT INTO customers (name, phone, latitude, longitude) VALUES (?, ?, ?, ?)", [name, phone, latitude, longitude]);
    res.status(201).json({
        success: true,
        message: "เพิ่มข้อมูลลูกค้าสำเร็จ",
        data: { customer_id: result.insertId, name, phone, latitude, longitude },
    });
}));
// แก้ไขข้อมูลลูกค้า
exports.app.put("/api/customers/:customer_id", wrap(async (req, res) => {
    const id = Number(req.params["customer_id"]);
    const name = String(req.body?.name ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    if (!name || !phone)
        return res.status(400).json({ success: false, message: "กรุณาระบุชื่อและเบอร์โทร" });
    if (!validLatLng(latitude, longitude))
        return res.status(400).json({ success: false, message: "พิกัดไม่ถูกต้อง" });
    const [result] = await dbconnect_1.conn.query("UPDATE customers SET name = ?, phone = ?, latitude = ?, longitude = ? WHERE customer_id = ?", [name, phone, latitude, longitude, id]);
    if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "ไม่พบข้อมูลลูกค้านี้" });
    res.json({ success: true, message: "แก้ไขข้อมูลลูกค้าสำเร็จ", data: { customer_id: id, name, phone, latitude, longitude } });
}));
// ลบข้อมูลลูกค้า (ลบออเดอร์ของลูกค้าคนนั้นด้วย)
exports.app.delete("/api/customers/:customer_id", wrap(async (req, res) => {
    const id = Number(req.params["customer_id"]);
    await dbconnect_1.conn.query("DELETE FROM orders WHERE customer_id = ?", [id]);
    const [result] = await dbconnect_1.conn.query("DELETE FROM customers WHERE customer_id = ?", [id]);
    if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "ไม่พบข้อมูลลูกค้านี้" });
    await invalidatePlan();
    res.json({ success: true, message: "ลบข้อมูลลูกค้าสำเร็จ" });
}));
// ==========================================
// 2. Web API สำหรับจัดการรายการสั่งซื้อ (Order)
// ==========================================
// แสดงรายการสั่งซื้อทั้งหมด (พร้อมชื่อลูกค้าและระยะทางจากร้าน)
exports.app.get("/api/orders", wrap(async (req, res) => {
    const lat = num(req.query["lat"], routing_1.SHOP.lat);
    const lng = num(req.query["lng"], routing_1.SHOP.lng);
    res.json({ success: true, data: await fetchOrders(lat, lng) });
}));
// 2.3 แสดงรายการสั่งซื้อทั้งหมดในระยะ 2 กิโลเมตรจากพิกัดที่กำหนด
exports.app.get("/api/orders/nearby-2km", wrap(async (req, res) => {
    const lat = num(req.query["lat"], routing_1.SHOP.lat);
    const lng = num(req.query["lng"], routing_1.SHOP.lng);
    const data = (await fetchOrders(lat, lng))
        .filter((o) => o.distance_km !== null && o.distance_km <= 2.0)
        .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
    res.json({ success: true, data });
}));
// 2.1 จำลองรายการสั่งซื้อ 20-30 รายการ
//     ถ้าลูกค้าในระบบมีไม่พอ จะสุ่มสร้างลูกค้าเพิ่มในรัศมี 3 กม. จากร้าน (ตามโจทย์) ให้ครบ
exports.app.post("/api/orders/seed", wrap(async (req, res) => {
    const total = 20 + Math.floor(Math.random() * 11); // 20-30
    const [custRows] = await dbconnect_1.conn.query("SELECT * FROM customers");
    let ids = custRows.filter((c) => (0, routing_1.haversineKm)(routing_1.SHOP.lat, routing_1.SHOP.lng, Number(c.latitude), Number(c.longitude)) <= 3).map((c) => c.customer_id);
    if (ids.length < total) {
        const FIRST = ["สมชาย", "มาลี", "วิชัย", "สุดา", "ธนา", "กนก", "อนุชา", "พิมพ์", "นภา", "สมศักดิ์",
            "จันทร์", "ปรีชา", "ศิริพร", "วรรณา", "ชาติชาย", "รัตนา", "ณัฐพล", "ขวัญ", "อารีย์", "สุรชัย",
            "เพ็ญศรี", "ธีระ", "กัญญา", "พิชัย", "ลดา", "อนันต์", "ฟ้า", "บุญเรือน", "ประยุทธ", "อดิศักดิ์"];
        const LAST = ["ใจดี", "รักเรียน", "สุขสันต์", "แสงทอง", "มั่นคง", "บุญมา", "ศรีสุข", "จันทร์เพ็ง", "วงศ์ใหญ่", "พรมมา"];
        const extra = [];
        for (let i = ids.length; i < total; i++) {
            const angle = Math.random() * Math.PI * 2;
            const km = Math.sqrt(Math.random()) * 3; // กระจายในรัศมี 3 กม.
            extra.push([
                `${FIRST[Math.floor(Math.random() * FIRST.length)]} ${LAST[Math.floor(Math.random() * LAST.length)]}`,
                "08" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
                +(routing_1.SHOP.lat + (km * Math.sin(angle)) / 111).toFixed(6),
                +(routing_1.SHOP.lng + (km * Math.cos(angle)) / (111 * Math.cos((routing_1.SHOP.lat * Math.PI) / 180))).toFixed(6),
            ]);
        }
        await dbconnect_1.conn.query("INSERT INTO customers (name, phone, latitude, longitude) VALUES ?", [extra]);
        const [again] = await dbconnect_1.conn.query("SELECT customer_id FROM customers");
        ids = again.filter((c) => (0, routing_1.haversineKm)(routing_1.SHOP.lat, routing_1.SHOP.lng, Number(c.latitude), Number(c.longitude)) <= 3).map((c) => c.customer_id);
    }
    // สุ่มเลือกลูกค้า total คน (คนละ 1 ออเดอร์) กล่องละ 1-3
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const values = ids.slice(0, total).map((cid) => [cid, 1 + Math.floor(Math.random() * MAX_BOXES_PER_ORDER), "PENDING"]);
    await dbconnect_1.conn.query("DELETE FROM orders");
    await dbconnect_1.conn.query("INSERT INTO orders (customer_id, quantity, status) VALUES ?", [values]);
    await invalidatePlan();
    const data = await fetchOrders(routing_1.SHOP.lat, routing_1.SHOP.lng);
    res.json({ success: true, message: `จำลองออเดอร์สำเร็จ ${data.length} รายการ`, data });
}));
// 2.2 ล้าง (ลบทั้งหมด) รายการสั่งซื้อที่จำลอง  (ต้องอยู่ก่อน /:order_id)
exports.app.delete("/api/orders/clear", wrap(async (req, res) => {
    await dbconnect_1.conn.query("DELETE FROM orders");
    await invalidatePlan();
    res.json({ success: true, message: "ล้างรายการสั่งซื้อทั้งหมดเรียบร้อยแล้ว" });
}));
// เพิ่มออเดอร์ใหม่แบบระบุลูกค้าและจำนวนกล่อง
exports.app.post("/api/orders", wrap(async (req, res) => {
    const customer_id = Number(req.body?.customer_id);
    const quantity = Number(req.body?.quantity ?? 1);
    if (!validQty(quantity)) {
        return res.status(400).json({ success: false, message: `จำนวนกล่องต้องเป็น 1-${MAX_BOXES_PER_ORDER} กล่อง` });
    }
    const [found] = await dbconnect_1.conn.query("SELECT customer_id FROM customers WHERE customer_id = ?", [customer_id]);
    if (found.length === 0)
        return res.status(404).json({ success: false, message: "ไม่พบลูกค้านี้" });
    const [result] = await dbconnect_1.conn.query("INSERT INTO orders (customer_id, quantity, status) VALUES (?, ?, 'PENDING')", [customer_id, quantity]);
    await invalidatePlan();
    res.status(201).json({
        success: true,
        message: "เพิ่มออเดอร์สำเร็จ",
        data: { order_id: result.insertId, customer_id, quantity, status: "PENDING" },
    });
}));
// แก้ไขออเดอร์ (จำนวนกล่อง และ/หรือ ลูกค้า)
exports.app.put("/api/orders/:order_id", wrap(async (req, res) => {
    const id = Number(req.params["order_id"]);
    const sets = [];
    const args = [];
    if (req.body?.quantity !== undefined) {
        const q = Number(req.body.quantity);
        if (!validQty(q)) {
            return res.status(400).json({ success: false, message: `จำนวนกล่องต้องเป็น 1-${MAX_BOXES_PER_ORDER} กล่อง` });
        }
        sets.push("quantity = ?");
        args.push(q);
    }
    if (req.body?.customer_id !== undefined) {
        const cid = Number(req.body.customer_id);
        const [found] = await dbconnect_1.conn.query("SELECT customer_id FROM customers WHERE customer_id = ?", [cid]);
        if (found.length === 0)
            return res.status(404).json({ success: false, message: "ไม่พบลูกค้านี้" });
        sets.push("customer_id = ?");
        args.push(cid);
    }
    if (sets.length === 0)
        return res.status(400).json({ success: false, message: "ไม่มีข้อมูลที่ต้องแก้ไข" });
    const [result] = await dbconnect_1.conn.query(`UPDATE orders SET ${sets.join(", ")} WHERE order_id = ?`, [...args, id]);
    if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "ไม่พบออเดอร์นี้" });
    await invalidatePlan();
    const data = (await fetchOrders(routing_1.SHOP.lat, routing_1.SHOP.lng)).find((o) => o.order_id === id);
    res.json({ success: true, message: "อัปเดตออเดอร์สำเร็จ", data });
}));
// ลบออเดอร์รายรายการตาม order_id
exports.app.delete("/api/orders/:order_id", wrap(async (req, res) => {
    const id = Number(req.params["order_id"]);
    const [result] = await dbconnect_1.conn.query("DELETE FROM orders WHERE order_id = ?", [id]);
    if (result.affectedRows === 0)
        return res.status(404).json({ success: false, message: "ไม่พบออเดอร์นี้" });
    await invalidatePlan();
    res.json({ success: true, message: "ลบออเดอร์สำเร็จ" });
}));
// ==========================================
// 3. จัดเส้นทางและแบ่งงานไรเดอร์ (หัวใจของโจทย์)
// ==========================================
// เจ้าของร้านกดปุ่มเดียว → คำนวณแผน แล้วบันทึกเป็นแผนล่าสุด
// body: { attempt: 1 } = แผนที่ดีที่สุด, attempt 2,3,... = แผนทางเลือกถัดไป (ปุ่ม "คำนวณใหม่")
exports.app.post("/api/routes/plan", wrap(async (req, res) => {
    const attempt = Math.max(1, Math.floor(Number(req.body?.attempt) || 1));
    const [rows] = await dbconnect_1.conn.query(`
    SELECT o.order_id, o.quantity, c.name, c.phone, c.latitude, c.longitude
    FROM orders o JOIN customers c ON o.customer_id = c.customer_id
    ORDER BY o.order_id
  `);
    const items = rows.map((r) => ({
        order_id: r["order_id"],
        customer: r["name"],
        phone: r["phone"],
        boxes: Number(r["quantity"]),
        lat: Number(r["latitude"]),
        lng: Number(r["longitude"]),
    }));
    if (items.length === 0) {
        return res.status(400).json({ success: false, message: "ยังไม่มีออเดอร์ให้จัดเส้นทาง (กรุณาสร้างหรือจำลองออเดอร์ก่อน)" });
    }
    const plan = await (0, routing_1.buildPlan)(items, attempt);
    await dbconnect_1.conn.query("DELETE FROM route_plans");
    await dbconnect_1.conn.query("INSERT INTO route_plans (plan_json) VALUES (?)", [JSON.stringify(plan)]);
    res.json({ success: true, message: "จัดเส้นทางสำเร็จ", data: plan });
}));
async function latestPlan() {
    const [rows] = await dbconnect_1.conn.query("SELECT plan_json FROM route_plans ORDER BY id DESC LIMIT 1");
    const first = rows[0];
    return first ? JSON.parse(String(first["plan_json"])) : null;
}
// แผนล่าสุดที่เจ้าของร้านจัดไว้ (ไม่มี = data เป็น null)
exports.app.get("/api/routes/latest", wrap(async (req, res) => {
    res.json({ success: true, data: await latestPlan() });
}));
// ไรเดอร์กรอกเลขใบงานเพื่อดูงานของตัวเอง (เปิดจากมือถือเครื่องไหนก็ได้)
exports.app.get("/api/jobs/:code", wrap(async (req, res) => {
    const code = String(req.params["code"] ?? "").trim().toUpperCase();
    const plan = await latestPlan();
    const route = plan?.routes?.find((r) => r.job_code === code);
    if (!route)
        return res.status(404).json({ success: false, message: "ไม่พบเลขใบงานนี้" });
    res.json({ success: true, data: route });
}));
// JSON error handler (เช่น DB ล่ม) — ส่งเป็น JSON แทนหน้า HTML
exports.app.use((err, req, res, next) => {
    console.error(`${req.method} ${req.path} failed:`, err);
    if (res.headersSent)
        return next(err);
    res.status(500).json({ success: false, message: err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์/ฐานข้อมูล" });
});
//# sourceMappingURL=app.js.map