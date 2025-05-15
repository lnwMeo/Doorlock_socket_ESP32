const pool = require("../config/db");
const bcrypt = require("bcrypt");
const moment = require("moment");

// สร้าง user โดย admin
exports.createUser = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res
        .status(400)
        .json({ error: "Password does not meet security requirements" });
    }

    const [existing] = await pool.query(
      "SELECT * FROM users WHERE username = ? OR email = ?",
      [username, email]
    );
    if (existing.length > 0) {
      return res
        .status(409)
        .json({ error: "Username or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
      [username, email, hashedPassword, role]
    );

    res.json({ message: "User created by admin successfully" });
  } catch (err) {
    console.error("❌ Admin create user error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
// รีเซ็ตรหัสผ่านให้ user โดย admin
exports.resetUserPassword = async (req, res) => {
  const { user_id, new_password, confirm_password } = req.body;

  // เช็คว่าทุกฟิลด์ถูกส่งมาหรือไม่
  if (!user_id || !new_password || !confirm_password) {
    return res.status(400).json({ error: "All fields are required." });
  }

  // ตรวจสอบความแข็งแรงของรหัสผ่าน
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!passwordRegex.test(new_password)) {
    return res.status(400).json({
      error:
        "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
    });
  }

  if (new_password !== confirm_password) {
    return res.status(400).json({ error: "Passwords do not match." });
  }

  try {
    // ตรวจสอบว่า user_id มีอยู่ในระบบหรือไม่
    const [user] = await pool.query("SELECT * FROM users WHERE user_id = ?", [
      user_id,
    ]);
    if (user.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    // แฮชรหัสผ่านใหม่
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // อัปเดตรหัสผ่านในฐานข้อมูล
    await pool.query("UPDATE users SET password = ? WHERE user_id = ?", [
      hashedPassword,
      user_id,
    ]);

    res.json({ success: true, message: "Password reset successfully." });
  } catch (err) {
    console.error("❌ Reset password error:", err);
    res.status(500).json({ error: "Server error." });
  }
};
// อนุมัติการจอง
exports.approveReservation = async (req, res) => {
  const { reservation_id } = req.params;
  const admin_id = req.user.user_id; // รับจาก JWT token

  try {
    const [reservation] = await pool.query(
      "SELECT * FROM reservation WHERE reservation_id = ?",
      [reservation_id]
    );

    if (reservation.length === 0) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    await pool.query(
      `UPDATE reservation
         SET status_id = 2, approved_by = ?
         WHERE reservation_id = ?`,
      [admin_id, reservation_id]
    );

    res.json({ message: "Reservation approved successfully" });
  } catch (err) {
    console.error("❌ Approve reservation error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
// ปฎิเสธการจอง
exports.rejectReservation = async (req, res) => {
  const { reservation_id } = req.params;
  const admin_id = req.user.user_id;

  try {
    const [reservation] = await pool.query(
      "SELECT * FROM reservation WHERE reservation_id = ?",
      [reservation_id]
    );

    if (reservation.length === 0) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    // 3 = รหัสของสถานะ 'rejected' (คุณอาจต้องตรวจสอบว่าใน DB เป็น id อะไร)
    await pool.query(
      `UPDATE reservation
         SET status_id = 3, approved_by = ?
         WHERE reservation_id = ?`,
      [admin_id, reservation_id]
    );

    res.json({ message: "Reservation rejected successfully" });
  } catch (err) {
    console.error("❌ Reject reservation error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
// สร้างห้อง
exports.createRoom = async (req, res) => {
  const { room_id, room_name, description } = req.body;

  if (!room_id || !room_name) {
    return res.status(400).json({ error: "Missing required fields!" });
  }

  try {
    await pool.query(
      `INSERT INTO Room (room_id, room_name,description) VALUES (?,?,?)`,
      [room_id, room_name, description]
    );
    res.json({ success: true, message: "Create Room successfully!" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error!" });
  }
};
// ฟิลเตอร์และเรียกข้อมูลห้องทั้งหมด
exports.getAllReservation = async (req, res) => {
  const { status_id } = req.query;

  try {
    // ✅ หากมี status_id ให้ฟิลเตอร์เฉพาะสถานะนั้น
    const query = status_id
      ? `SELECT r.*, rs.status_name FROM reservation r 
         JOIN reservation_status rs ON r.status_id = rs.status_id
         WHERE r.status_id = ?`
      : `SELECT r.*, rs.status_name FROM reservation r 
         JOIN reservation_status rs ON r.status_id = rs.status_id`;

    const [reservations] = status_id
      ? await pool.query(query, [status_id])
      : await pool.query(query);

    const formattedReservations = reservations.map((reservation) => ({
      reservation_id: reservation.reservation_id,
      room_id: reservation.room_id,
      user_id: reservation.user_id,
      date: moment(reservation.date).format("DD-MM-YYYY"),
      start_time: reservation.start_time,
      end_time: reservation.end_time,
      unlock_key: reservation.unlock_key,
      description: reservation.description,
      status_name: reservation.status_name,
    }));

    res.json({ success: true, data: formattedReservations });
  } catch (error) {
    console.error("❌ Server error:", error);
    res.status(500).json({ error: "Server error" });
  }
};
// สร้างสถานะของการจอง
exports.createstatusReservation = async (req, res) => {
const { status_name } = req.body;

// ✅ ตรวจสอบว่าเป็น admin หรือไม่
if (req.user?.role !== "admin") {
  return res.status(403).json({ error: "Access denied. Admin only." });
}

if (!status_name) {
  return res.status(400).json({ error: "Status name is required" });
}

try {
  await pool.query(
    "INSERT INTO reservation_status (status_name) VALUES (?)",
    [status_name]
  );
  res.json({ message: "Status created successfully" });
} catch (error) {
  console.error("❌ Server error:", error);
  res.status(500).json({ error: "Server error" });
}
};