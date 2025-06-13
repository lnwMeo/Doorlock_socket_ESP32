// controllers/reservationController.js

const pool = require("../config/db");
const moment = require("moment");
const QRCode = require("qrcode");
const Joi = require("joi");
const { sendTelegramMessage } = require("../utils/sendtotelegram");

// Schema สำหรับ validate params
const idParamSchema = Joi.object({
  reservation_id: Joi.number().integer().positive().required(),
});

// ดึงรายการจองของผู้ใช้ (เฉพาะยังไม่หมดเวลา)
exports.getMyReservations = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const now = moment();

    const [rows] = await pool.query(
      `SELECT r.reservation_id, r.room_id, rm.room_name,
              r.date, r.start_time, r.end_time,
              r.status_id, s.status_name,
              r.description, r.unlock_key,
              r.created_at, r.updated_at
       FROM reservation r
       JOIN reservation_status s ON r.status_id = s.status_id
       JOIN room rm ON r.room_id = rm.room_id
       WHERE r.user_id = ?
       ORDER BY r.date DESC, r.start_time DESC`,
      [userId]
    );

    const activeReservations = rows
      .filter((row) => {
        // รวม date+end_time แล้วตรวจสอบยังไม่ผ่าน
        const endDateTime = moment(
          row.date + " " + row.end_time,
          "YYYY-MM-DD HH:mm"
        );
        return endDateTime.isAfter(now);
      })
      .map((row) => ({
        reservation_id: row.reservation_id,
        room_id: row.room_id,
        room_name: row.room_name,
        date: moment(row.date).format("YYYY-MM-DD"),
        start_time: row.start_time,
        end_time: row.end_time,
        description: row.description,
        unlock_key: row.unlock_key,
        status: {
          id: row.status_id,
          name: row.status_name,
        },
        created_at: moment(row.created_at).format("YYYY-MM-DD HH:mm"),
        updated_at: moment(row.updated_at).format("YYYY-MM-DD HH:mm"),
      }));

    return res.json({ success: true, active: activeReservations });
  } catch (err) {
    console.error("❌ getMyReservations error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// สร้าง QR Code สำหรับ reservation ที่อนุมัติแล้ว
exports.generateQRCodeForReservation = async (req, res) => {
  // Validate param
  const { error, value } = idParamSchema.validate(req.params);
  if (error) {
    return res.status(400).json({ error: "Invalid reservation_id parameter" });
  }
  const reservationId = value.reservation_id;
  const userId = req.user.user_id;

  try {
    const [rows] = await pool.query(
      `SELECT unlock_key FROM reservation
       WHERE reservation_id = ?
         AND user_id = ?
         AND status_id = 2`,
      [reservationId, userId]
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ error: "Reservation not found or not approved." });
    }

    const unlock_key = rows[0].unlock_key;
    const qrPayload = JSON.stringify({ unlock_key });

    // สร้าง QR Code แบบ Data URL
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "H",
    });

    return res.json({ success: true, qrcode_base64: qrDataUrl });
  } catch (err) {
    console.error("❌ generateQRCodeForReservation error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// controller/reservation.controller.js (หรือไฟล์ที่คุณเก็บ controller เอาไว้)

exports.cancelReservation = async (req, res) => {
  const reservationId = req.params.reservation_id;
  const userId = req.user.user_id;

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1) ตรวจว่าเป็น pending และเป็นของ user จริง
    const [rows] = await connection.query(
      `SELECT r.*, u.username
       FROM reservation r
       JOIN users u ON r.user_id = u.user_id
       WHERE r.reservation_id = ? AND r.user_id = ? AND r.status_id = 1`,
      [reservationId, userId]
    );
    const reservation = rows[0];
    if (!reservation) {
      throw { status: 404, message: "ไม่พบการจอง หรือไม่สามารถยกเลิกได้" };
    }

    // 2) สร้างสถานะ cancelled_by_user ถ้ายังไม่มี
    await connection.query(
      `INSERT IGNORE INTO reservation_status (status_id, status_name)
       VALUES (4, 'cancelled_by_user')`
    );

    // 3) อัปเดตสถานะใน reservation
    await connection.query(
      `UPDATE reservation
       SET status_id = 4,
       updated_by  = ?
       WHERE reservation_id = ?`,
      [userId,  reservationId]
    );

    await connection.commit();

    // 4) ตอบ client ทันที
    res.json({
      success: true,
      message: "ยกเลิกรายการจองเรียบร้อยแล้ว",
    });

    // 5) ส่ง Telegram แจ้งแอดมิน (fire-and-forget)
    const text = `
        "❌ <b>ยกเลิการจองห้อง</b>",
📌 ผู้ใช้ ${reservation.username}  ยกเลิกรายการจอง
🏠 ห้อง: ${reservation.room_id}
📅 วันที่: ${reservation.date}
⏰ เวลา: ${reservation.start_time} - ${reservation.end_time}

    `.trim();
    sendTelegramMessage(text).catch((e) =>
      console.warn("⚠️ Telegram failed:", e)
    );
  } catch (err) {
    console.error("❌ cancelReservation error:", err);
    if (connection) await connection.rollback();
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(500).json({ error: "Server error" });
  } finally {
    if (connection) connection.release();
  }
};


