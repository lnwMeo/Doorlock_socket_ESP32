const pool = require("../config/db");
// const moment = require("moment"); // ✅ ใช้ moment ในการจัดการวันที่
// 27/3/2025


exports.logCheckin = async (req, res) => {
  const { room_id, unlock_key } = req.body;

  if (!room_id || !unlock_key) {
      return res.status(400).json({ error: 'Missing required fields!' });
  }

  try {
      const [result] = await pool.query(
          `UPDATE Reservation SET checked_in = 1 WHERE room_id = ? AND unlock_key = ? AND checked_in = 0`,
          [room_id, unlock_key]
      );

      if (result.affectedRows > 0) {
          console.log(`✅ Room ${room_id} - Successfully Checked In!`);
          res.json({ success: true, message: 'Check-in recorded successfully!' });
      } else {
          res.status(404).json({ error: 'Reservation not found or already checked in.' });
      }
  } catch (error) {
      console.error('❌ Error logging check-in:', error);
      res.status(500).json({ error: 'Server error' });
  }
};

// ✅ ฟังก์ชันดึงข้อมูลห้องจากฐานข้อมูล
exports.getRoomData = async (req, res) => {
  try {
      const roomId = req.params.roomId;

      const [roomData] = await pool.query(
          `SELECT * FROM Room WHERE room_id = ?`,
          [roomId]
      );

      const [reservations] = await pool.query(
          `SELECT * FROM Reservation WHERE room_id = ?`,
          [roomId]
      );

      if (roomData.length > 0) {
          res.json({ success: true, data: { room: roomData[0], reservations } });
      } else {
          res.status(404).json({ error: 'Room not found' });
      }
  } catch (error) {
      console.error('❌ Error fetching room data:', error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
};







