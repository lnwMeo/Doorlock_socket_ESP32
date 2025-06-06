// Required modules and setup
const pool = require("../config/db");
const bcrypt = require("bcrypt");
const moment = require("moment");
const { sendApprovalEmail } = require("../utils/mailer");
const QRCode = require("qrcode");
const Joi = require("joi");

// Schemas for validation

const createUserSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/)
    .required()
    .messages({
      "string.pattern.base": "รหัสผ่านไม่ปลอดภัยพอ",
    }),
  role: Joi.string().optional().default("user"),
});
const createAdminSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/)
    .required()
    .messages({
      "string.pattern.base": "รหัสผ่านไม่ปลอดภัยพอ",
    }),
  role: Joi.string().optional().default("admin"),
});

const resetPasswordSchema = Joi.object({
  user_id: Joi.number().integer().required(),
  new_password: Joi.string()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/)
    .required()
    .messages({
      "string.pattern.base": "รหัสผ่านไม่ปลอดภัยพอ",
    }),
});

const createRoomSchema = Joi.object({
  room_id: Joi.string().required(),
  room_name: Joi.string().required(),
  description: Joi.string().allow("", null),
});
const editRoomSchema = Joi.object({
  room_name: Joi.string().required(),
  description: Joi.string().allow("", null),
});

const statusSchema = Joi.object({ status_name: Joi.string().required() });

const updateUserSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
});

// ---- Admin Management ---
exports.listAdmin = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT user_id, username, email, role,is_deleted
FROM users
WHERE role = 'Admin' 
ORDER BY user_id;
`
    );
    res.json({ success: true, data: users });
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const { error, value } = createAdminSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { username, email, password, role } = value;
    const [existing] = await pool.query(
      "SELECT 1 FROM users WHERE username = ? OR email = ?",
      [username, email]
    );
    if (existing.length) {
      return res
        .status(409)
        .json({ error: "Username or email already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
      [username, email, hashed, role]
    );
    return res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    console.error("createUser error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.editAdmin = async (req,res)=>{
    try {
    // ดึง user_id จาก URL params
    const user_id = req.params.user_id;

    // ตรวจสอบ body ด้วย Joi (เฉพาะ username, email)
    const { error, value } = updateUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    const { username, email } = value;

    // เช็คว่าผู้ใช้นี้มีอยู่จริงหรือไม่
    const [existingUser] = await pool.query(
      "SELECT 1 FROM users WHERE user_id = ?",
      [user_id]
    );
    if (!existingUser.length) {
      return res.status(404).json({ error: "User not found" });
    }

    // ตรวจสอบความซ้ำซ้อนของ username หรือ email (ยกเว้น record ของตัวเอง)
    const [conflict] = await pool.query(
      `SELECT 1 FROM users 
       WHERE (username = ? OR email = ?) 
         AND user_id != ?`,
      [username, email, user_id]
    );
    if (conflict.length) {
      return res
        .status(409)
        .json({ error: "Username or email already in use by another user" });
    }

    // อัปเดตเฉพาะ username กับ email เท่านั้น
    await pool.query(
      "UPDATE users SET username = ?, email = ? WHERE user_id = ?",
      [username, email, user_id]
    );

    return res.json({ message: "User updated successfully" });
  } catch (err) {
    console.error("editUser error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
exports.resetAdminPassword = async (req, res) => {
  try {
    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { user_id, new_password } = value;
    const [rows] = await pool.query("SELECT 1 FROM users WHERE user_id = ?", [
      user_id,
    ]);
    if (!rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password = ? WHERE user_id = ?", [
      hashed,
      user_id,
    ]);
    return res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("resetUserPassword error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
exports.deleteAdmin = async (req,res)=>{
  // 1) ตรวจสอบสิทธิ์เฉพาะ admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Access denied. Admin only." });
  }

  const { user_id } = req.params;
  // ตรวจสอบว่าพารามิเตอร์เป็นเลขจำนวนเต็มหรือไม่
  if (!Number.isInteger(parseInt(user_id, 10))) {
    return res.status(400).json({ error: "Invalid user_id parameter" });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 2) ตรวจสอบว่าผู้ใช้มีอยู่จริงหรือไม่
    const [userRows] = await connection.query(
      "SELECT 1 FROM users WHERE user_id = ?",
      [user_id]
    );
    if (!userRows.length) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: "User not found" });
    }

    // 3) ลบ room_logs ของ user นี้ ก่อน
    await connection.query(
      `DELETE FROM room_logs
       WHERE user_id = ?`,
      [user_id]
    );

    // 4) ลบ reservation ของ user นี้ ก่อน
    //    *ถ้ามี FK อื่นๆ ที่อ้างถึง reservation (เช่น record ของ ESP32 log หรือ ตารางอื่น)
    //     ก็ต้องลบ/อัปเดตก่อนเช่นกัน*
    await connection.query(
      `DELETE FROM reservation
       WHERE user_id = ?`,
      [user_id]
    );

    // 5) สุดท้าย ลบ user เอง
    await connection.query(
      `DELETE FROM users
       WHERE user_id = ?`,
      [user_id]
    );

    // 6) commit transaction
    await connection.commit();
    connection.release();

    return res.json({ message: "User deleted permanently" });
  } catch (err) {
    console.error("deleteUser error:", err);
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}

// --- QR Code Generation ---
exports.generateAdminQRCode = async (req, res) => {
  try {
    // แทนที่จะอ่านจาก req.user.user_id เราอ่านจาก URL params เลย
    const adminIdParam = req.params.admin_id;
    
    // ตรวจสอบว่า adminIdParam เป็นจำนวนเต็มหรือไม่
    const admin_id = parseInt(adminIdParam, 10);
    if (isNaN(admin_id)) {
      return res.status(400).json({ error: "Invalid admin_id parameter" });
    }

    // (ถ้าต้องการให้แค่ผู้ที่ล็อกอินเป็น admin เท่านั้นจึงสร้าง QR ได้ ให้ตรวจสอบสิทธิ์ req.user.role === "admin" ได้ตามปกติ)
    // ถ้าไม่ต้องการตรวจสอบเพิ่ม ก็ข้ามไปสร้าง QR ได้เลย

    // ปรับ payload ตามต้องการ (ตัวอย่างนี้โค้ดเดิมใช้ { admin: true, user_id: ... })
    const payload = { admin: true, user_id: String(admin_id) };

    // สร้างเป็น Data URL ของ QR Code
    const qr_image = await QRCode.toDataURL(JSON.stringify(payload));

    return res.json({ qr_image });
  } catch (err) {
    console.error("generateAdminQRCode error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// --- User Management ---
exports.listUser = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT user_id, username, email, role,is_deleted
FROM users
WHERE role = 'user' 
ORDER BY user_id;
`
    );
    res.json({ success: true, data: users });
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { error, value } = createUserSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { username, email, password, role } = value;
    const [existing] = await pool.query(
      "SELECT 1 FROM users WHERE username = ? OR email = ?",
      [username, email]
    );
    if (existing.length) {
      return res
        .status(409)
        .json({ error: "Username or email already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
      [username, email, hashed, role]
    );
    return res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    console.error("createUser error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.resetUserPassword = async (req, res) => {
  try {
    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { user_id, new_password } = value;
    const [rows] = await pool.query("SELECT 1 FROM users WHERE user_id = ?", [
      user_id,
    ]);
    if (!rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password = ? WHERE user_id = ?", [
      hashed,
      user_id,
    ]);
    return res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("resetUserPassword error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.editUser = async (req, res) => {
  try {
    // ดึง user_id จาก URL params
    const user_id = req.params.user_id;

    // ตรวจสอบ body ด้วย Joi (เฉพาะ username, email)
    const { error, value } = updateUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    const { username, email } = value;

    // เช็คว่าผู้ใช้นี้มีอยู่จริงหรือไม่
    const [existingUser] = await pool.query(
      "SELECT 1 FROM users WHERE user_id = ?",
      [user_id]
    );
    if (!existingUser.length) {
      return res.status(404).json({ error: "User not found" });
    }

    // ตรวจสอบความซ้ำซ้อนของ username หรือ email (ยกเว้น record ของตัวเอง)
    const [conflict] = await pool.query(
      `SELECT 1 FROM users 
       WHERE (username = ? OR email = ?) 
         AND user_id != ?`,
      [username, email, user_id]
    );
    if (conflict.length) {
      return res
        .status(409)
        .json({ error: "Username or email already in use by another user" });
    }

    // อัปเดตเฉพาะ username กับ email เท่านั้น
    await pool.query(
      "UPDATE users SET username = ?, email = ? WHERE user_id = ?",
      [username, email, user_id]
    );

    return res.json({ message: "User updated successfully" });
  } catch (err) {
    console.error("editUser error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.disabledUser = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Access denied. Admin only." });
  }

  const { user_id } = req.params;

  try {
    await pool.query("UPDATE users SET is_deleted = TRUE WHERE user_id = ?", [
      user_id,
    ]);
    return res.json({ message: "User marked as deleted successfully" });
  } catch (err) {
    console.error("❌ softDeleteUser error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
exports.enabledUser = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Access denied. Admin only." });
  }

  const { user_id } = req.params;

  try {
    await pool.query("UPDATE users SET is_deleted = FALSE WHERE user_id = ?", [
      user_id,
    ]);
    return res.json({ message: "User marked as deleted successfully" });
  } catch (err) {
    console.error("❌ softDeleteUser error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteUser = async (req, res) => {
  // 1) ตรวจสอบสิทธิ์เฉพาะ admin
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Access denied. Admin only." });
  }

  const { user_id } = req.params;
  // ตรวจสอบว่าพารามิเตอร์เป็นเลขจำนวนเต็มหรือไม่
  if (!Number.isInteger(parseInt(user_id, 10))) {
    return res.status(400).json({ error: "Invalid user_id parameter" });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 2) ตรวจสอบว่าผู้ใช้มีอยู่จริงหรือไม่
    const [userRows] = await connection.query(
      "SELECT 1 FROM users WHERE user_id = ?",
      [user_id]
    );
    if (!userRows.length) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: "User not found" });
    }

    // 3) ลบ room_logs ของ user นี้ ก่อน
    await connection.query(
      `DELETE FROM room_logs
       WHERE user_id = ?`,
      [user_id]
    );

    // 4) ลบ reservation ของ user นี้ ก่อน
    //    *ถ้ามี FK อื่นๆ ที่อ้างถึง reservation (เช่น record ของ ESP32 log หรือ ตารางอื่น)
    //     ก็ต้องลบ/อัปเดตก่อนเช่นกัน*
    await connection.query(
      `DELETE FROM reservation
       WHERE user_id = ?`,
      [user_id]
    );

    // 5) สุดท้าย ลบ user เอง
    await connection.query(
      `DELETE FROM users
       WHERE user_id = ?`,
      [user_id]
    );

    // 6) commit transaction
    await connection.commit();
    connection.release();

    return res.json({ message: "User deleted permanently" });
  } catch (err) {
    console.error("deleteUser error:", err);
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

// --- Room Management ---
exports.createRoom = async (req, res) => {
  try {
    const { error, value } = createRoomSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { room_id, room_name, description } = value;
    const [exists] = await pool.query(
      "SELECT 1 FROM room WHERE room_id = ?",
      [room_id]
    );
    if (exists.length) {
      return res.status(409).json({ error: "Room ID already exists" });
    }

    await pool.query(
      "INSERT INTO room (room_id, room_name, description) VALUES (?, ?, ?)",
      [room_id, room_name, description]
    );
    return res.status(201).json({ message: "Room created successfully" });
  } catch (err) {
    console.error("createRoom error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
exports.listRoom = async (req,res) =>{
 try {
    const [rooms] = await pool.query(
      "SELECT room_id, room_name, description, is_disabled FROM room ORDER BY room_id"
    );
    return res.json({ data: rooms });
  } catch (err) {
    console.error("listRoom error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
exports.editRoom = async (req,res) =>{
  try {
    const roomIdParam = req.params.room_id;
    // แปลงให้เป็น string/ตรวจสอบว่าไม่ว่าง
    if (!roomIdParam || typeof roomIdParam !== "string") {
      return res.status(400).json({ error: "Invalid room_id parameter" });
    }

    // ตรวจสอบ body ด้วย Joi (เฉพาะ room_name, description)
    const { error, value } = editRoomSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    const { room_name, description } = value;

    // เช็คว่าห้องนี้มีอยู่จริงหรือไม่
    const [existingRoom] = await pool.query(
      "SELECT 1 FROM room WHERE room_id = ?",
      [roomIdParam]
    );
    if (!existingRoom.length) {
      return res.status(404).json({ error: "Room not found" });
    }

    // อัปเดตข้อมูล room_name กับ description
    await pool.query(
      "UPDATE room SET room_name = ?, description = ? WHERE room_id = ?",
      [room_name, description, roomIdParam]
    );

    return res.json({ message: "Room updated successfully" });
  } catch (err) {
    console.error("editRoom error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
exports.deleteRoom = async (req,res) =>{
  const roomIdParam = req.params.room_id;

  // ตรวจสอบ param ว่าไม่ว่างและเป็น string
  if (!roomIdParam || typeof roomIdParam !== "string") {
    return res.status(400).json({ error: "Invalid room_id parameter" });
  }

  let connection;
  try {
    // เปิด transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1) เช็คว่าห้องนี้มีอยู่จริงหรือไม่
    const [roomRows] = await connection.query(
      "SELECT 1 FROM room WHERE room_id = ?",
      [roomIdParam]
    );
    if (!roomRows.length) {
      // ถ้าไม่เจอห้องนี้ ให้ rollback และ return 404
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: "Room not found" });
    }

    // 2) ลบ reservation ที่อ้างถึง room นี้ก่อน
    //    สมมติว่าชื่อตารางคือ `reservation` และมีคอลัมน์ `room_id`
    await connection.query(
      `DELETE FROM reservation
       WHERE room_id = ?`,
      [roomIdParam]
    );

    // 3) (ถ้ามีตารางอื่นๆ ที่อ้างถึง room_id เช่น room_logs ก็ลบก่อนเช่นกัน)
    //    สมมติมี room_logs ด้วย เช่น:
    // await connection.query(
    //   `DELETE FROM room_logs
    //    WHERE room_id = ?`,
    //   [roomIdParam]
    // );

    // 4) จากนั้นค่อยลบห้องจริง ๆ
    await connection.query(
      `DELETE FROM room
       WHERE room_id = ?`,
      [roomIdParam]
    );

    // 5) commit transaction
    await connection.commit();
    connection.release();

    return res.json({ message: "Room deleted successfully" });
  } catch (err) {
    console.error("deleteRoom error:", err);
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    // ถ้าเป็นข้อผิดพลาดที่ไม่ใช่ foreign key หรือตรวจไม่เจอ ก็ขึ้น 500
    return res.status(500).json({ error: "Internal server error" });
  }
}
exports.disabledRoom = async (req,res) =>{
   try {
    const roomIdParam = req.params.room_id;
    if (!roomIdParam || typeof roomIdParam !== "string") {
      return res.status(400).json({ error: "Invalid room_id parameter" });
    }

    // ตรวจสอบว่ามีห้องนี้อยู่หรือไม่
    const [roomRows] = await pool.query(
      "SELECT 1 FROM room WHERE room_id = ?",
      [roomIdParam]
    );
    if (!roomRows.length) {
      return res.status(404).json({ error: "Room not found" });
    }

    // ตั้ง is_disabled = TRUE เพื่อปิดการจองห้อง
    await pool.query(
      "UPDATE room SET is_disabled = TRUE WHERE room_id = ?",
      [roomIdParam]
    );

    return res.json({ message: "Room has been disabled for booking" });
  } catch (err) {
    console.error("disabledRoom error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
exports.enabledRoom = async (req,res) =>{
   try {
    const roomIdParam = req.params.room_id;
    if (!roomIdParam || typeof roomIdParam !== "string") {
      return res.status(400).json({ error: "Invalid room_id parameter" });
    }

    // ตรวจสอบว่ามีห้องนี้อยู่หรือไม่
    const [roomRows] = await pool.query(
      "SELECT 1 FROM room WHERE room_id = ?",
      [roomIdParam]
    );
    if (!roomRows.length) {
      return res.status(404).json({ error: "Room not found" });
    }

    // ตั้ง is_disabled = FALSE เพื่อเปิดการจองห้อง
    await pool.query(
      "UPDATE room SET is_disabled = FALSE WHERE room_id = ?",
      [roomIdParam]
    );

    return res.json({ message: "Room has been enabled for booking" });
  } catch (err) {
    console.error("enabledRoom error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}








// --- Reservation Queries ---
exports.getPendingReservations = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, u.username, rs.status_name
       FROM reservation r
       JOIN users u ON r.user_id = u.user_id
       JOIN reservation_status rs ON r.status_id = rs.status_id
       WHERE r.status_id = 1
         AND (r.date > CURDATE()
           OR (r.date = CURDATE() AND r.end_time > CURTIME()))
       ORDER BY r.date, r.start_time`
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error("getPendingReservations error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAllReservation = async (req, res) => {
  try {
    const status_id = parseInt(req.query.status_id, 10);
    let sql = `SELECT r.*, rs.status_name FROM reservation r
               JOIN reservation_status rs ON r.status_id = rs.status_id`;
    const params = [];
    if (!isNaN(status_id)) {
      sql += " WHERE r.status_id = ?";
      params.push(status_id);
    }
    sql += " ORDER BY r.date DESC, r.start_time";

    const [reservations] = await pool.query(sql, params);
    const formatted = reservations.map((r) => ({
      ...r,
      date: moment(r.date).format("DD-MM-YYYY"),
    }));
    return res.json({ data: formatted });
  } catch (err) {
    console.error("getAllReservation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// --- Approval Workflow ---
async function fetchReservationDetails(reservation_id) {
  const [rows] = await pool.query(
    `SELECT r.*, u.email, u.username, rm.room_name
     FROM reservation r
     JOIN users u ON r.user_id = u.user_id
     JOIN room rm ON r.room_id = rm.room_id
     WHERE r.reservation_id = ?`,
    [reservation_id]
  );
  return rows[0];
}

// controllers/reservationController.js

exports.approveReservation = async (req, res) => {
  const { reservation_id } = req.params;
  const admin_id = req.user.user_id;
  try {
    const reservation = await fetchReservationDetails(reservation_id);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    // 1) อัปเดตสถานะก่อน
    await pool.query(
      "UPDATE reservation SET status_id = 2, approved_by = ? WHERE reservation_id = ?",
      [admin_id, reservation_id]
    );

    // 2) เตรียมข้อมูล QR และ HTML
    const qrData = JSON.stringify({ unlock_key: reservation.unlock_key });
    const qrBuffer = await QRCode.toBuffer(qrData);
    const html = generateApprovalEmailHtml(reservation);

    // 3) ตอบ HTTP ให้ client ทันที
    res.json({ message: "Reservation approved. Email will be sent shortly." });

    // 4) ส่งอีเมลใน background
    if (reservation.email) {
      (async () => {
        try {
          await sendApprovalEmail(
            reservation.email,
            "การจองห้องได้รับการอนุมัติ",
            html,
            [{ filename: "qrcode.png", content: qrBuffer, cid: "qrcodecid" }]
          );
          console.log("📧 Approval email sent to", reservation.email);
        } catch (err) {
          console.error("❌ Failed to send approval email:", err);
          // TODO: เก็บ log หรือลอง retry ที่นี่
        }
      })();
    }
  } catch (err) {
    console.error("approveReservation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.rejectReservation = async (req, res) => {
  const { reservation_id } = req.params;
  const admin_id = req.user.user_id;
  try {
    const reservation = await fetchReservationDetails(reservation_id);
    if (!reservation)
      return res.status(404).json({ error: "Reservation not found" });

    await pool.query(
      "UPDATE reservation SET status_id = 3, approved_by = ? WHERE reservation_id = ?",
      [admin_id, reservation_id]
    );
    const html = generateRejectionEmailHtml(reservation);
    if (reservation.email) {
      await sendApprovalEmail(reservation.email, "Reservation Rejected", html);
    }
    return res.json({ message: "Reservation rejected" });
  } catch (err) {
    console.error("rejectReservation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// helper ส่วน header/footer
function wrapEmailContent(innerHtml) {
  return `
  <table width="100%" style="font-family: 'Segoe UI', sans-serif; background-color: #f4f4f4; padding: 20px;">
    <tr><td align="center">
      <table width="600" style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        ${innerHtml}
      </table>
    </td></tr>
  </table>`;
}

function generateApprovalEmailHtml(reservation) {
  const date = moment(reservation.date).format("DD-MM-YYYY");
  const inner = `
    <tr><td style="text-align: center;">
      <h2 style="color: #0d6efd;">ระบบจองห้อง COS SmartLab</h2>
      <p style="color: #555;">แจ้งเตือนการอนุมัติการจองห้อง</p>
    </td></tr>
    <tr><td>
      <p><strong>เรียนคุณ</strong> ${reservation.username},</p>
      <p style="color: #198754;"><strong>การจองห้องของคุณได้รับการอนุมัติแล้ว 🎉</strong></p>
    </td></tr>
    <tr><td style="background-color: #f1f1f1; padding: 15px; border-radius: 6px;">
      <ul style="font-size: 16px;">
        <li><strong>ห้อง:</strong> ${reservation.room_name}</li>
        <li><strong>กิจกรรม:</strong> ${reservation.description}</li>
        <li><strong>วันที่:</strong> ${date}</li>
        <li><strong>เวลา:</strong> ${reservation.start_time} - ${reservation.end_time}</li>
      </ul>
    </td></tr>
    <tr><td style="text-align: center; padding: 20px 0;">
      <p>กรุณาใช้ QR Code ด้านล่างเพื่อเข้าสู่ห้อง</p>
      <img src="cid:qrcodecid" width="200" alt="QR Code" style="border-radius: 8px;" />
    </td></tr>
    <tr><td>
      <p>ขอบคุณครับ</p>
      <p style="font-size: 13px; color: #888;">NRRU COS SmartLab</p>
    </td></tr>`;

  return wrapEmailContent(inner);
}

function generateRejectionEmailHtml(reservation) {
  const date = moment(reservation.date).format("DD-MM-YYYY");
  const inner = `
    <tr><td style="text-align: center;">
      <h2 style="color: #dc3545;">ระบบจองห้อง COS SmartLab</h2>
      <p style="color: #555;">แจ้งเตือนการปฏิเสธการจองห้อง</p>
    </td></tr>
    <tr><td>
      <p><strong>เรียนคุณ</strong> ${reservation.username},</p>
      <p style="color: #dc3545;"><strong>ขออภัย การจองห้องของคุณไม่ได้รับการอนุมัติ ❌</strong></p>
    </td></tr>
    <tr><td style="background-color: #f1f1f1; padding: 15px; border-radius: 6px;">
      <ul style="font-size: 16px;">
        <li><strong>ห้อง:</strong> ${reservation.room_name}</li>
        <li><strong>กิจกรรม:</strong> ${reservation.description}</li>
        <li><strong>วันที่:</strong> ${date}</li>
        <li><strong>เวลา:</strong> ${reservation.start_time} - ${reservation.end_time}</li>
      </ul>
    </td></tr>
    <tr><td>
      <p>หากมีข้อสงสัยกรุณาติดต่อผู้ดูแลระบบ : XXXXXXXXXXXX</p>
      <p style="font-size: 13px; color: #888;">NRRU COS SmartLab</p>
    </td></tr>`;

  return wrapEmailContent(inner);
}

// --- Status Management ---
exports.createstatusReservation = async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    const { error, value } = statusSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    await pool.query(
      "INSERT INTO reservation_status (status_name) VALUES (?)",
      [value.status_name]
    );
    return res.status(201).json({ message: "Status created" });
  } catch (err) {
    console.error("createstatusReservation error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};



// --- Approved Reservations by Room ---
exports.getApprovedReservationsByRoom = async (req, res) => {
  try {
    const room_id = req.query.room_id;
    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    let sql = `SELECT r.reservation_id, r.room_id, u.username, r.description, r.date, r.start_time, r.end_time, a.username AS approved_by
               FROM reservation r
               JOIN users u ON r.user_id = u.user_id
               LEFT JOIN users a ON r.approved_by = a.user_id
               WHERE r.status_id = 2 AND CONCAT(r.date, ' ', r.end_time) >= ?`;
    const params = [now];
    if (room_id) {
      sql += " AND r.room_id = ?";
      params.push(room_id);
    }
    sql += " ORDER BY r.date, r.start_time";
    const [rows] = await pool.query(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    console.error("getApprovedReservationsByRoom error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// --- Rooms List ---
exports.getAllRoomsAdmin = async (req, res) => {
  try {
    const [rooms] = await pool.query(
      "SELECT room_id FROM room ORDER BY room_id"
    );
    return res.json({ data: rooms });
  } catch (err) {
    console.error("getAllRoomsAdmin error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
