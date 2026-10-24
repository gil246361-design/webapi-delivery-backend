export declare const conn: import("mysql2/promise").Pool;
/** สร้างตารางที่ต้องใช้ถ้ายังไม่มี (ถ้ามีอยู่แล้วจะไม่แตะต้องข้อมูลเดิม) */
export declare function ensureSchema(): Promise<void>;
//# sourceMappingURL=dbconnect.d.ts.map