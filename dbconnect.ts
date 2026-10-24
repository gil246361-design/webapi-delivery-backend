import { createPool } from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

let caCert: string | undefined;
try {
  const certPath = path.join(__dirname, 'ca.pem');
  const certPathUp = path.join(__dirname, '..', 'ca.pem'); // กรณีรันจากโฟลเดอร์ dist
  const found = [certPath, certPathUp].find((p) => fs.existsSync(p));
  if (found) caCert = fs.readFileSync(found, 'utf-8');
} catch { /* ignore */ }

// ค่าเชื่อมต่อฐานข้อมูลอ่านจาก Environment Variables เท่านั้น (ห้ามเขียนรหัสผ่านลงในโค้ด)
// ตั้งค่า DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME ที่ Render > Environment
const useSsl = process.env.DB_SSL !== 'false'; // ตั้ง DB_SSL=false เฉพาะตอนรัน MySQL ในเครื่องที่ไม่มี SSL
export const conn = createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER ?? '',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'defaultdb',
  ...(useSsl ? { ssl: caCert ? { ca: caCert, rejectUnauthorized: false } : { rejectUnauthorized: false } } : {}),
});

/** สร้างตารางที่ต้องใช้ถ้ายังไม่มี (ถ้ามีอยู่แล้วจะไม่แตะต้องข้อมูลเดิม) */
export async function ensureSchema(): Promise<void> {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS customers (
      customer_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      latitude DOUBLE NOT NULL,
      longitude DOUBLE NOT NULL
    )`);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      order_date TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_orders_customer (customer_id)
    )`);
  // แผนจัดเส้นทางล่าสุด (ไรเดอร์ใช้เลขใบงานในแผนนี้เปิดดูจากมือถือเครื่องไหนก็ได้)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS route_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      plan_json LONGTEXT NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    )`);
}
