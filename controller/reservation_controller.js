const pool = require("../config/db");
const { sendTelegramMessage } = require("../utils/sendtotelegram");

// จองห้อง
// ✅ createReservation.js
exports.createReservation = async (req, res) => {
  const data = req.body;
  const reservations = Array.isArray(data) ? data : [data];

  if (reservations.length === 0) {
    return res.status(400).json({ error: "No reservation data provided." });
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction(); // 🔄 ใช้ Transaction

  try {
    const results = [];

    for (const reservation of reservations) {
      const {
        user_id,
        room_id,
        date,
        start_time,
        end_time,
        description = "",
      } = reservation;

      if (
        !user_id ||
        !room_id ||
        !date ||
        !start_time ||
        !end_time ||
        !description
      ) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ error: "Missing required fields!" });
      }

      // 🔍 ตรวจสอบการจองซ้ำในช่วงเวลาเดียวกัน (ห้องเดียวกันเท่านั้น)
      const [existing] = await connection.query(
        `SELECT * FROM reservation
           WHERE room_id = ? AND date = ?
           AND (
             (start_time < ? AND end_time > ?) -- ทับกลาง
             OR (start_time >= ? AND start_time < ?) -- เริ่มในช่วง
             OR (end_time > ? AND end_time <= ?) -- จบในช่วง
           )`,
        [
          room_id,
          date,
          end_time,
          start_time,
          start_time,
          end_time,
          start_time,
          end_time,
        ]
      );

      if (existing.length > 0) {
        console.warn(
          `❌ Conflict: Room ${room_id} already reserved on ${date} ${start_time}-${end_time}`
        );
        await connection.rollback();
        connection.release();
        return res.status(409).json({
          error: "Reservation conflict!",
          conflict: { room_id, date, start_time, end_time },
        });
      }

      const unlock_key = generateRandomKey();

      const [insertResult] = await connection.query(
        `INSERT INTO reservation 
           (user_id, room_id, date, start_time, end_time, unlock_key, sent_to_esp32, description, status_id)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1)`, // 1 = รออนุมัติ
        [user_id, room_id, date, start_time, end_time, unlock_key, description]
      );

      results.push({
        reservation_id: insertResult.insertId,
        user_id,
        room_id,
        date,
        start_time,
        end_time,
        unlock_key,
        status: "pending",
      });

      console.log(
        `✅ Reservation created: ${room_id} on ${date} ${start_time}-${end_time}`
      );
      
      const [[userRow]] = await connection.query(
        "SELECT username FROM users WHERE user_id = ?",
        [user_id]
      );
      const username = userRow?.username || "ไม่ทราบชื่อ";
      
      const telegramText = `
      📢 <b>คำขอจองห้องใหม่</b>
      👤 <b>ชื่อผู้ใช้:</b> ${username}
      🏫 <b>ห้อง:</b> ${room_id}
      📅 <b>วันที่:</b> ${date}
      🕒 <b>เวลา:</b> ${start_time} - ${end_time}
      📝 <b>กิจกรรม:</b> ${description}
      📌 <i>กรุณาเข้าสู่ระบบเพื่อตรวจสอบและอนุมัติ</i>
      `.trim();
      
      await sendTelegramMessage(telegramText);
    }

    return res.json({
      success: true,
      message: "Reservations created successfully! Waiting for admin approval.",
      data: results,
    });
  } catch (error) {
    console.error("❌ Error creating reservations:", error);
    await connection.rollback();
    connection.release();
    return res.status(500).json({ error: "Server Error!" });
  }
};

// ✅ ฟังก์ชันสร้าง Key แบบสุ่ม (6 ตัวอักษร: พิมพ์เล็ก, พิมพ์ใหญ่, ตัวเลข)
function generateRandomKey() {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < 6; i++) {
    key += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return key;
}
