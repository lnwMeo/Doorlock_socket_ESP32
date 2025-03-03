
// ✅ จำลองข้อมูลห้อง
let rooms = {
  "27.03.04": {
    room_id: "27.03.04",
    user_name: "John Doe",
    date: "2025-02-26",
    start_time: "13:00",
    end_time: "20:00",
  },
  "27.03.05": {
    room_id: "27.03.05",
    user_name: "Somsi",
    date: "2025-03-04",
    start_time: "10:00",
    end_time: "20:00",
  },
};

// ✅ ฟังก์ชันบันทึก Check-in
function handleCheckIn(data) {
  console.log(`✅ Check-in received for Room ${data.room_id} at ${data.check_in_time}`);
  // 🔴 **TODO: บันทึกลงฐานข้อมูล**
}

// ✅ ฟังก์ชันดึงข้อมูลห้อง
exports.getroomdata = (req, res) => {
  const roomId = req.params.roomId;
  if (rooms[roomId]) {
    res.json({ success: true, data: rooms[roomId] });
  } else {
    res.status(404).json({ error: "Room not found" });
  }
};

// ✅ ฟังก์ชันบันทึก Check-in ผ่าน API
exports.logCheckin = (req, res) => {
  const { room_id, user_name, date, check_in_time } = req.body;

  if (!room_id || !user_name || !date || !check_in_time) {
    return res.status(400).json({ error: "Missing required fields!" });
  }

  handleCheckIn(req.body);
  res.json({ success: true, message: "✅ Check-in recorded successfully!" });
};

// ✅ ส่งออกตัวแปร rooms และฟังก์ชัน handleCheckIn()
exports.rooms = rooms;
exports.handleCheckIn = handleCheckIn;
