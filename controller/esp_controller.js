const pool = require("../config/db");
const moment = require("moment"); // ✅ ใช้ moment ในการจัดการวันที่
// 27/3/2025

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

// จองห้อง
exports.createReservation = async (req, res) => {
  const { user_id, room_id, date, start_time, end_time } = req.body;

  if (!user_id || !room_id || !date || !start_time || !end_time) {
    return res.status(400).json({ error: "Missing required fields!" });
  }

  try {
    const unlock_key = generateRandomKey();

    const [result] = await pool.query(
      `INSERT INTO Reservation (user_id, room_id , date, start_time, end_time, unlock_key, checked_in, sent_to_esp32)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
      [user_id, room_id, date, start_time, end_time, unlock_key]
    );

    console.log(
      `✅ New reservation created for Room: ${room_id}, Key: ${unlock_key}`
    );

    res.json({
      success: true,
      message: "Reservation created successfully!",
      unlock_key,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error!" });
  }
};

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


exports.getAllReservation = async (req, res) => {
  try {
      const [reservations] = await pool.query(`SELECT * FROM Reservation`);

      const formattedReservations = reservations.map((reservation) => ({
          reservation_id: reservation.reservation_id,
          room_id: reservation.room_id,
          user_id: reservation.user_id,
          date: moment(reservation.date).format('DD-MM-YYYY'),
          start_time: reservation.start_time,
          end_time: reservation.end_time,
          checked_in: reservation.checked_in,
          unlock_key: reservation.unlock_key
      }));

      res.json({ success: true, data: formattedReservations });

  } catch (error) {
      console.error('❌ Server error:', error);
      res.status(500).json({ error: 'Server error' });
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

//แสดงข้อมูลการจอง

