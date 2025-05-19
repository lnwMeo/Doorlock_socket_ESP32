const pool = require("../config/db");
const bcrypt = require("bcrypt");
const moment = require("moment");
const { sendApprovalEmail } = require("../utils/mailer");
const QRCode = require("qrcode");

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
  const admin_id = req.user.user_id;

  try {
    const [rows] = await pool.query(
      `SELECT r.*, u.email, u.username, rm.room_name 
       FROM reservation r
       JOIN users u ON r.user_id = u.user_id
       JOIN room rm ON r.room_id = rm.room_id
       WHERE r.reservation_id = ?`,
      [reservation_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    const reservation = rows[0];

    // ✅ อัปเดตสถานะ
    await pool.query(
      `UPDATE reservation
       SET status_id = 2, approved_by = ?
       WHERE reservation_id = ?`,
      [admin_id, reservation_id]
    );

    // ✅ สร้างข้อมูล JSON ที่ต้องการใส่ใน QR Code
    const qrData = JSON.stringify({
      unlock_key: reservation.unlock_key,
    });

    // ✅ สร้าง QR Code เป็น buffer base64 PNG
    const qrImage = await QRCode.toBuffer(qrData, { type: "png" });

    // ✅ สร้าง HTML Email
    const html = `
    <table width="100%" style="font-family: 'Segoe UI', sans-serif; background-color: #f4f4f4; padding: 20px;">
      <tr>
        <td align="center">
          <table width="600" style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <tr><td style="text-align: center;">
              <h2 style="color: #0d6efd;">ระบบจองห้อง DoorLock</h2>
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
                <li><strong>วันที่:</strong> ${reservation.date}</li>
                <li><strong>เวลา:</strong> ${reservation.start_time} - ${reservation.end_time}</li>
              </ul>
            </td></tr>
            <tr><td style="text-align: center; padding: 20px 0;">
              <p>กรุณาใช้ QR Code ด้านล่างเพื่อเข้าสู่ห้อง</p>
              <img src="cid:qrcodecid" width="200" alt="QR Code" style="border-radius: 8px;" />
            </td></tr>
            <tr><td>
              <p>ขอบคุณครับ</p>
              <p style="font-size: 13px; color: #888;">NRRU Smart Access</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>`;

    // ✅ ส่งอีเมล พร้อม QR Code แนบใน cid
    if (reservation.email) {
      await sendApprovalEmail(
        reservation.email,
        "การจองห้องได้รับการอนุมัติ",
        html,
        [
          {
            filename: "qrcode.png",
            content: qrImage,
            cid: "qrcodecid", // ต้องตรงกับใน src="cid:qrcodecid"
          },
        ]
      );
      console.log("📧 Email sent to", reservation.email);
    } else {
      console.warn("⚠️ No email found for user:", reservation.username);
    }

    res.json({ message: "Reservation approved and email sent." });
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
    const [rows] = await pool.query(
      `SELECT r.*, u.email, u.username, rm.room_name 
       FROM reservation r
       JOIN users u ON r.user_id = u.user_id
       JOIN room rm ON r.room_id = rm.room_id
       WHERE r.reservation_id = ?`,
      [reservation_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    const reservation = rows[0];

    // 🔁 อัปเดตสถานะเป็น "rejected"
    await pool.query(
      `UPDATE reservation
       SET status_id = 3, approved_by = ?
       WHERE reservation_id = ?`,
      [admin_id, reservation_id]
    );

    // ✅ เตรียมข้อความอีเมล
    const html = `
 <table width="100%" style="font-family: 'Segoe UI', sans-serif; background-color: #f4f4f4; padding: 20px;">
  <tr>
    <td align="center">
      <table width="600" style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <tr>
          <td style="text-align: center;">
            <h2 style="color: #dc3545;">ระบบจองห้อง DoorLock</h2>
            <p style="color: #555;">แจ้งเตือนการปฏิเสธการจองห้อง</p>
          </td>
        </tr>
        <tr>
          <td>
            <p><strong>เรียนคุณ</strong> ${reservation.username},</p>
            <p style="color: #dc3545;"><strong>ขออภัย การจองห้องของคุณไม่ได้รับการอนุมัติ ❌</strong></p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #f1f1f1; padding: 15px; border-radius: 6px;">
            <ul style="font-size: 16px;">
              <li><strong>ห้อง:</strong> ${reservation.room_name}</li>
              <li><strong>กิจกรรม:</strong> ${reservation.description}</li>
              <li><strong>วันที่:</strong> ${reservation.date}</li>
              <li><strong>เวลา:</strong> ${reservation.start_time} - ${reservation.end_time}</li>
            </ul>
          </td>
        </tr>
        <tr>
          <td>
            <p>หากมีข้อสงสัยกรุณาติดต่อผู้ดูแลระบบ : XXXXXXXXXXXX</p>
            <p style="font-size: 13px; color: #888;">NRRU Smart Access</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;

    // ✅ ส่งอีเมล
    if (reservation.email) {
      await sendApprovalEmail(
        reservation.email,
        "การจองห้องได้รับการอนุมัติ",
        html
      );
      console.log("📧 Rejection email sent to", reservation.email);
    } else {
      console.warn("⚠️ No email found for user:", reservation.username);
    }

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
// สร้าง QRcode ของแอดมิน
exports.generateAdminQRCode = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    const qrPayload = JSON.stringify({
      admin: true,
      user_id: String(user_id),
    });

    const qrImage = await QRCode.toDataURL(qrPayload); // ✅ สร้าง QR Code เป็น base64

    res.json({
      success: true,
      qr_image: qrImage,
    });
  } catch (err) {
    console.error("❌ Error generating admin QR code:", err);
    res.status(500).json({ error: "Failed to generate admin QR code." });
  }
};

