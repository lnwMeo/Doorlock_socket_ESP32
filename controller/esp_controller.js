// ✅ จำลองข้อมูลห้อง
let rooms = {
  "27.03.04": [
    {
      room_id: "27.03.04",
      user_name: "Somsamai Kaihumlax",
      date: "2025-03-07",
      start_time: "14:30",
      end_time: "14:35",
      checked_in: false,
    },
    {
      room_id: "27.03.04",
      user_name: "Tony Stark",
      date: "2025-03-18",
      start_time: "11:14",
      end_time: "11:16",
      checked_in: false,
    },
    {
      room_id: "27.03.04",
      user_name: "Dr.Stak Avanger",
      date: "2025-03-08",
      start_time: "14:42",
      end_time: "14:45",
      checked_in: false,
    },
  ],
  "27.03.05": [
    {
      room_id: "27.03.05",
      user_name: "Mr.Maithai Jaitawan",
      date: "2025-03-11",
      start_time: "14:28",
      end_time: "14:30",
      checked_in: false,
    },
    {
      room_id: "27.03.05",
      user_name: "Sman Kongking",
      date: "2025-03-12",
      start_time: "08:46",
      end_time: "08:52",
      checked_in: false,
    },
    {
      room_id: "27.03.05",
      user_name: "Sman Kongking",
      date: "2025-03-07",
      start_time: "13:54",
      end_time: "13:56",
      checked_in: false,
    },
  ],
};

// ✅ ฟังก์ชันบันทึก Check-in
function handleCheckIn(data) {
  if (rooms[data.room_id]) {
    rooms[data.room_id].checked_in = true; // ✅ ใช้ `checked_in`
    console.log(
      `✅ Check-in received for Room ${data.room_id} at ${data.check_in_time}`
    );
  } else {
    console.log(`❌ Room ${data.room_id} not found for check-in`);
  }
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
