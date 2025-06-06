// controllers/reservationController.js

const pool = require("../config/db");
const moment = require("moment");
const { sendTelegramMessage } = require("../utils/sendtotelegram");
const { reservationSchema } = require("../validation/reservation.validator");

// สร้าง key สุ่ม (6 ตัวอักษร)
function generateRandomKey() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < 6; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// สร้างการจอง (รองรับหลายรายการ)
exports.createReservation = async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : [req.body];
  if (payload.length === 0) {
    return res.status(400).json({ error: "No reservation data provided." });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const results = [];
    const now = moment();

    for (const item of payload) {
      // 1. Validate input
      const { error, value } = reservationSchema.validate(item);
      if (error) {
        throw { status: 400, message: error.details[0].message };
      }
      const { user_id, room_id, date, start_time, end_time, description } =
        value;

      // 2. Prevent past reservations
      const endDateTime = moment(`${date} ${end_time}`, "YYYY-MM-DD HH:mm");
      if (endDateTime.isBefore(now)) {
        throw { status: 400, message: "ไม่สามารถจองเวลาที่ผ่านมาแล้วได้" };
      }

      // 3. Check for conflicts (overlap)
      const [conflicts] = await connection.query(
        `SELECT 1 FROM reservation
         WHERE room_id = ? AND date = ?
           AND start_time < ?
           AND end_time > ?
         LIMIT 1`,
        [room_id, date, end_time, start_time]
      );
      if (conflicts.length) {
        throw {
          status: 409,
          message: "Reservation conflict!",
          conflict: { room_id, date, start_time, end_time },
        };
      }

      // 4. Insert reservation
      const unlock_key = generateRandomKey();
      const [insertResult] = await connection.query(
        `INSERT INTO reservation
         (user_id, room_id, date, start_time, end_time, unlock_key, sent_to_esp32, description, status_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1)`,
        [user_id, room_id, date, start_time, end_time, unlock_key, description]
      );

      const formattedDate = moment(date).format("YYYY-MM-DD");
      results.push({
        reservation_id: insertResult.insertId,
        user_id,
        room_id,
        date: formattedDate,
        start_time,
        end_time,
        unlock_key,
        status: "pending",
      });

      // 5. Notify via Telegram (errors won't abort transaction)
      try {
        const [users] = await connection.query(
          "SELECT username FROM users WHERE user_id = ?",
          [user_id]
        );
        const username = users[0]?.username || "ไม่ทราบชื่อ";
        const text = [
          "📢 <b>คำขอจองห้องใหม่</b>",
          `👤 <b>ชื่อผู้ใช้:</b> ${username}`,
          `🏫 <b>ห้อง:</b> ${room_id}`,
          `📅 <b>วันที่:</b> ${formattedDate}`,
          `🕒 <b>เวลา:</b> ${start_time} - ${end_time}`,
          `📝 <b>กิจกรรม:</b> ${description}`,
          "<i>กรุณาเข้าสู่ระบบเพื่อตรวจสอบและอนุมัติ</i>",
        ].join("\n");
        await sendTelegramMessage(text);
      } catch (tgErr) {
        console.warn("Telegram notification failed:", tgErr);
      }
    }

    await connection.commit();
    return res.status(201).json({
      success: true,
      message: "Reservations created successfully! Waiting for admin approval.",
      data: results,
    });
  } catch (err) {
    console.error("❌ createReservation error:", err);
    if (connection) {
      await connection.rollback();
    }
    if (err.status) {
      return res
        .status(err.status)
        .json({
          error: err.message,
          ...(err.conflict && { conflict: err.conflict }),
        });
    }
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (connection) connection.release();
  }
};

// ดึงการจองที่อนุมัติแล้ว ในปฎิทิน
exports.getApprovedReservations = async (req, res) => {
  try {
    // SQL: ดึงทุกการจองที่อนุมัติ (status_id = 2) ไม่กรองวันเวลาใดๆ
    const [rows] = await pool.query(
      `
      SELECT 
        r.reservation_id,
        r.room_id,
        rm.room_name,
        u.username AS reserved_by,
        r.description,
        r.date,
        r.start_time,
        r.end_time,
        -- หาค่า checked_in: 1 ถ้ามี log 'check_in' ของ reservation_id นี้, 0 ถ้าไม่มี
        EXISTS (
          SELECT 1 
          FROM room_logs l
          WHERE l.reservation_id = r.reservation_id
            AND l.action = 'check_in'
        ) AS checked_in
      FROM reservation r
      JOIN users u ON r.user_id = u.user_id
      JOIN room rm ON r.room_id = rm.room_id
      WHERE r.status_id = 2
      ORDER BY r.date ASC, r.start_time ASC
      `
    );

    // แปลง checked_in จาก 1/0 เป็น boolean
    const formatted = rows.map((row) => ({
      reservation_id: row.reservation_id,
      room_id: row.room_id,
      room_name: row.room_name,
      username: row.reserved_by,
      description: row.description,
      date: moment(row.date).format("YYYY-MM-DD"),
      start_time: row.start_time,
      end_time: row.end_time,
      checked_in: row.checked_in === 1,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err) {
    console.error("❌ getApprovedReservations error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.getApprovedReservationsaction = async (req, res) => {
  try {
    const now = moment().format("YYYY-MM-DD HH:mm:ss");

    const [rows] = await pool.query(
      `
     SELECT 
        r.reservation_id,
        r.room_id,
        rm.room_name,
        u.username AS reserved_by,
        r.description,
        r.date,
        r.start_time,
        r.end_time,
        /* ตรวจสอบว่า user เช็กอินหรือไม่ (1 = เช็กอินแล้ว, 0 = ยังไม่เช็กอิน) */
        EXISTS (
          SELECT 1 
          FROM room_logs l
          WHERE l.reservation_id = r.reservation_id
            AND l.action = 'check_in'
        ) AS checked_in,
        /* ดึง check_in_time ล่าสุด (ถ้ามี log หลายอัน อ่านแถวล่าสุด) */
        (
          SELECT l2.check_in_time
          FROM room_logs l2
          WHERE l2.reservation_id = r.reservation_id
            AND l2.action = 'check_in'
          ORDER BY l2.check_in_time DESC
          LIMIT 1
        ) AS check_in_time
      FROM reservation r
      JOIN users u ON r.user_id = u.user_id
      JOIN room rm ON r.room_id = rm.room_id
      WHERE r.status_id = 2
        AND CONCAT(r.date, ' ', r.end_time) >= ?
      ORDER BY r.date ASC, r.start_time ASC
      `,
      [now]
    );

    // map ผลลัพธ์แล้ว convert checked_in เป็น boolean
    const formatted = rows.map((row) => ({
      reservation_id: row.reservation_id,
      room_id: row.room_id,
      room_name: row.room_name,
      reserved_by: row.reserved_by,
      description: row.description,
      date: moment(row.date).format("YYYY-MM-DD"),
      start_time: row.start_time,
      end_time: row.end_time,
      checked_in: row.checked_in === 1, // เปลี่ยน 1/0 เป็น true/false
       check_in_time: row.check_in_time,
    }));

    return res.json({ success: true, data: formatted });
  } catch (err) {
    console.error("❌ getApprovedReservationsaction error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ดึงรายการห้องทั้งหมด
exports.getAllRooms = async (req, res) => {
  try {
    const [rooms] = await pool.query(
      `SELECT room_id, room_name, description
       FROM room
       WHERE is_disabled = FALSE
       ORDER BY room_id`
    );
    return res.json({ success: true, data: rooms });
  } catch (error) {
    console.error("❌ getAllRooms error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};
