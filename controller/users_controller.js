const pool = require("../config/db");
const moment = require("moment");
exports.getMyReservations = async (req, res) => {
    const userId = req.user.user_id;
    const now = moment(); // เวลาปัจจุบัน
  
    try {
      const [rows] = await pool.query(
        `SELECT r.reservation_id, r.room_id, rm.room_name, r.date, r.start_time, r.end_time,
                r.status_id, s.status_name, r.description, r.unlock_key,
                r.created_at, r.updated_at
         FROM reservation r
         JOIN reservation_status s ON r.status_id = s.status_id
         JOIN room rm ON r.room_id = rm.room_id
         WHERE r.user_id = ?
         ORDER BY r.date DESC, r.start_time DESC`,
        [userId]
      );
  
      const active = [];
      const expired = [];
  
      for (const row of rows) {
        const reservationEnd = moment(`${row.date} ${row.end_time}`, "YYYY-MM-DD HH:mm");
        const item = {
          reservation_id: row.reservation_id,
          room_id: row.room_id,
          room_name: row.room_name,
          date: moment(row.date).format("YYYY-MM-DD"),
          start_time: row.start_time,
          end_time: row.end_time,
          description: row.description,
          status: {
            id: row.status_id,
            name: row.status_name,
          },
          created_at: moment(row.created_at).format("YYYY-MM-DD HH:mm"),
          updated_at: moment(row.updated_at).format("YYYY-MM-DD HH:mm"),
        };
  
        if (reservationEnd.isAfter(now)) {
          active.push(item);
        } else {
          expired.push(item);
        }
      }
  
      res.json({
        success: true,
        active,  // ✅ รายการยังไม่หมดเวลา
        expired, // ✅ รายการที่หมดเวลาแล้ว
      });
    } catch (error) {
      console.error("❌ Error fetching reservations:", error);
      res.status(500).json({ error: "Server error" });
    }
  };
  