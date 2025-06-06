const express = require("express");
const router = express.Router();

// 🔐 Middleware สำหรับตรวจสอบ Token และสิทธิ์ Admin
const { verifyToken, requireAdmin } = require("../middleware/auth");

// ✅ Controller: การเข้าสู่ระบบ และสมัครสมาชิก
const { login, register } = require("../controller/auth_controller");

// ✅ Controller: สำหรับ Admin
const {
  listUser,
  createUser, // สร้างผู้ใช้งาน
  resetUserPassword, // รีเซ็ตรหัสผ่านผู้ใช้
  editUser,
  disabledUser,
  enabledUser,
  deleteUser, //
  listAdmin,
  createAdmin,
  editAdmin,
  resetAdminPassword,
  deleteAdmin, //
  getPendingReservations, //คำขอจองใหม่ทั้งหมด
  approveReservation, // อนุมัติการจองห้อง
  rejectReservation, // ไม่อนุมัติการจองห้อง
  createRoom, // สร้างห้องใหม่
  listRoom,
  editRoom,
  deleteRoom,
  disabledRoom,
  enabledRoom,
  getAllReservation, // แสดงข้อมูลการจองทั้งหมด
  createstatusReservation, // สร้างสถานะการจองห้อง
  generateAdminQRCode, // สร้าง QR Code สำหรับ Admin
  getApprovedReservationsByRoom, // รายการห้องที่ใช้งาน ฟิวเตอร์โดย room_id
  getAllRoomsAdmin, // แสดง room_id ทั้งหมด
} = require("../controller/admins_controller");

// ✅ Controller: แดชบอร์ด
const {
  getDashboardStats, // สถิติรวมบนแดชบอร์ด
  getRoomUsageStats, // สถิติการใช้งานห้อง
  getUserUsageSummary, // รายงานการใช้งานของผู้ใช้
  getRecentLogs, // Log ล่าสุด
  getUserName, //แสดงชื่อผู้ใช้ทั้งหมด
  gettotalSummary,
} = require("../controller/dashbord_controller");

// ✅ Controller: บันทึก Log และดึงข้อมูลห้อง
const { logCheckin, getRoomData } = require("../controller/logs_controller");

// ✅ Controller: สำหรับผู้ใช้ทั่วไป
const {
  getMyReservations,
  generateQRCodeForReservation,
} = require("../controller/users_controller");
const {
  createReservation,
  getApprovedReservations,
  getAllRooms,
  getApprovedReservationsaction,
} = require("../controller/reservation_controller");

// ✅ Controller: สำหรับทดสอบการส่ง Email
const { sendmail } = require("../controller/testnomail");

// =================== 🔐 Auth Routes ===================
// เข้าสู่ระบบ
router.post("/login", login);
// สมัครสมาชิก
router.post("/register", register);

// =================== 🛠 Admin Routes ===================
router.get("/listuser", verifyToken, requireAdmin, listUser);
// สร้างผู้ใช้ (เฉพาะ Admin)
router.post("/create-user", verifyToken, requireAdmin, createUser);
// รีเซ็ตรหัสผ่านของผู้ใช้
router.patch(
  "/resetpassword-user",
  verifyToken,
  requireAdmin,
  resetUserPassword
);
router.patch("/edituser/:user_id", verifyToken, requireAdmin, editUser);
router.patch("/disabledUser/:user_id", verifyToken, requireAdmin, disabledUser);
router.patch("/enabledUser/:user_id", verifyToken, requireAdmin, enabledUser);
router.delete("/deleteUser/:user_id", verifyToken, requireAdmin, deleteUser);

// จัดการ admin
router.get("/listadmin", verifyToken, requireAdmin, listAdmin);
router.post("/createadmin", verifyToken, requireAdmin, createAdmin);
router.patch("/editadmin/:user_id", verifyToken, requireAdmin, editAdmin);
router.patch(
  "/resetadminpassword",
  verifyToken,
  requireAdmin,
  resetAdminPassword
);
router.delete("/deleteadmin/:user_id", verifyToken, requireAdmin, deleteAdmin);

// คำขอจองใหม่ทั้งหมด
router.get(
  "/getpendingreservations",
  verifyToken,
  requireAdmin,
  getPendingReservations
);
// รายการห้องที่ใช้งาน ฟิวเตอร์โดย room_id
router.get(
  "/getApprovedReservationsbyroom",
  verifyToken,
  requireAdmin,
  getApprovedReservationsByRoom
);

// อนุมัติการจองห้อง
router.patch(
  "/approve/:reservation_id",
  verifyToken,
  requireAdmin,
  approveReservation
);
// ไม่อนุมัติการจองห้อง
router.patch(
  "/reject/:reservation_id",
  verifyToken,
  requireAdmin,
  rejectReservation
);

// สร้างห้อง
router.post("/createroom", verifyToken, requireAdmin, createRoom);
router.get("/listroom", verifyToken, requireAdmin, listRoom);
router.patch("/editroom/:room_id", verifyToken, requireAdmin, editRoom);
router.delete("/deleteroom/:room_id", verifyToken, requireAdmin, deleteRoom);
router.patch("/disabledroom/:room_id", verifyToken, requireAdmin, disabledRoom);
router.patch("/enabledroom/:room_id", verifyToken, requireAdmin, enabledRoom);

// ดูข้อมูลของห้อง
router.get("/getroomdata/:roomId", verifyToken, requireAdmin, getRoomData);
// สร้างสถานะการจองห้อง
router.post(
  "/createstatusreservation",
  verifyToken,
  requireAdmin,
  createstatusReservation
);
// ดูข้อมูลการจองทั้งหมด
router.get("/allreservation", verifyToken, requireAdmin, getAllReservation);
router.get("/getallroomsadmin", verifyToken, requireAdmin, getAllRoomsAdmin);

// =================== 📊 Dashboard Routes ===================
// ดึงสถิติการจอง/ใช้งาน
router.get("/dashbord-status", verifyToken, requireAdmin, getDashboardStats);
// ยอดการใช้งานแต่ละห้อง
router.get("/getroomusagestats", verifyToken, requireAdmin, getRoomUsageStats);
router.get("/getusername", verifyToken, requireAdmin, getUserName);
// รายงานการใช้งานของผู้ใช้
router.get(
  "/getuserusagesummary",
  verifyToken,
  requireAdmin,
  getUserUsageSummary
);
// รายงานการใช้งานของผู้ใช้
router.get("/gettotalsummary", verifyToken, requireAdmin, gettotalSummary);
// สร้าง QR Code สำหรับ Admin
router.get(
  "/generateadminqrcode/:admin_id",
  verifyToken,
  requireAdmin,
  generateAdminQRCode
);
// Log ล่าสุด
router.get("/getrecentlogs", verifyToken, requireAdmin, getRecentLogs);

// =================== 👤 User Routes ===================
// ผู้ใช้จองห้อง
router.post("/createreservation", verifyToken, createReservation);
// ผู้ใช้ดูการจองของตนเอง
router.get("/getmyreservations", verifyToken, getMyReservations);
router.get("/getallrooms", verifyToken, getAllRooms);
router.get(
  "/generateqrcode/:reservation_id",
  verifyToken,
  generateQRCodeForReservation
);

// =================== 📋 Log Routes ===================
// บันทึก log check-in
router.post("/log-check-in", logCheckin);

// =================== 🧪 ทดสอบส่ง Email ===================
router.post("/sendmail", sendmail);

// =================== 📊 Home Dashboard Routes ===================
router.get("/getapprovedreservationsHome", getApprovedReservations);
router.get("/getApprovedReservationsaction", getApprovedReservationsaction);

module.exports = router;
