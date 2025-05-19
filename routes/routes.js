const express = require("express");
const router = express.Router();

// 🔐 Middleware สำหรับตรวจสอบ Token และสิทธิ์ Admin
const { verifyToken, requireAdmin } = require("../middleware/auth");

// ✅ Controller: การเข้าสู่ระบบ และสมัครสมาชิก
const { login, register } = require("../controller/auth_controller");

// ✅ Controller: สำหรับ Admin
const {
  createUser,                // สร้างผู้ใช้งาน
  resetUserPassword,         // รีเซ็ตรหัสผ่านผู้ใช้
  approveReservation,        // อนุมัติการจองห้อง
  rejectReservation,         // ไม่อนุมัติการจองห้อง
  createRoom,                // สร้างห้องใหม่
  getAllReservation,         // แสดงข้อมูลการจองทั้งหมด
  createstatusReservation,   // สร้างสถานะการจองห้อง
  generateAdminQRCode        // สร้าง QR Code สำหรับ Admin
} = require("../controller/admins_controller");

// ✅ Controller: แดชบอร์ด
const {
  getDashboardStats,         // สถิติรวมบนแดชบอร์ด
  getRoomUsageStats,         // สถิติการใช้งานห้อง
  getUserUsageSummary,       // รายงานการใช้งานของผู้ใช้
  getRecentLogs              // Log ล่าสุด
} = require("../controller/dashbord_controller");

// ✅ Controller: บันทึก Log และดึงข้อมูลห้อง
const { logCheckin, getRoomData } = require("../controller/logs_controller");

// ✅ Controller: สำหรับผู้ใช้ทั่วไป
const { getMyReservations } = require("../controller/users_controller");
const { createReservation } = require("../controller/reservation_controller");

// ✅ Controller: สำหรับทดสอบการส่ง Email
const { sendmail } = require("../controller/testnomail");


// =================== 🔐 Auth Routes ===================
// เข้าสู่ระบบ
router.post("/login", login);
// สมัครสมาชิก
router.post("/register", register);


// =================== 🛠 Admin Routes ===================
// สร้างผู้ใช้ (เฉพาะ Admin)
router.post("/create-user", verifyToken, requireAdmin, createUser);
// รีเซ็ตรหัสผ่านของผู้ใช้
router.patch("/resetpassword-user", verifyToken, requireAdmin, resetUserPassword);
// อนุมัติการจองห้อง
router.patch("/approve/:reservation_id", verifyToken, requireAdmin, approveReservation);
// ไม่อนุมัติการจองห้อง
router.patch("/reject/:reservation_id", verifyToken, requireAdmin, rejectReservation);
// สร้างห้อง
router.post("/createroom", verifyToken, requireAdmin, createRoom);
// ดูข้อมูลของห้อง
router.get("/getroomdata/:roomId", verifyToken, requireAdmin, getRoomData);
// สร้างสถานะการจองห้อง
router.post("/createstatusreservation", verifyToken, requireAdmin, createstatusReservation);
// ดูข้อมูลการจองทั้งหมด
router.get("/allreservation", verifyToken, requireAdmin, getAllReservation);

// =================== 📊 Dashboard Routes ===================
// ดึงสถิติการจอง/ใช้งาน
router.get("/dashbord-status", verifyToken, requireAdmin, getDashboardStats);
// ยอดการใช้งานแต่ละห้อง
router.get("/getroomusagestats", verifyToken, requireAdmin, getRoomUsageStats);
// รายงานการใช้งานของผู้ใช้
router.get("/getuserusagesummary", verifyToken, requireAdmin, getUserUsageSummary);
// สร้าง QR Code สำหรับ Admin
router.get("/generateadminqrcode", verifyToken, requireAdmin, generateAdminQRCode);
// Log ล่าสุด
router.get("/getrecentlogs", verifyToken, requireAdmin, getRecentLogs);


// =================== 👤 User Routes ===================
// ผู้ใช้จองห้อง
router.post("/createreservation", verifyToken, createReservation);
// ผู้ใช้ดูการจองของตนเอง
router.get("/getmyreservations", verifyToken, getMyReservations);


// =================== 📋 Log Routes ===================
// บันทึก log check-in
router.post("/log-check-in", logCheckin);


// =================== 🧪 ทดสอบส่ง Email ===================
router.post("/sendmail", sendmail);

module.exports = router;
