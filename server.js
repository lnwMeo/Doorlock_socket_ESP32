const http = require("http");
const express = require("express");
const morgan = require("morgan");
const { readdirSync } = require("fs");
const cors = require("cors");
const WebSocket = require("ws");
const os = require("os");
const moment = require("moment");
const { rooms, handleCheckIn } = require("./controller/esp_controller");

const PORT = 5000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.send("Hello World");
});

readdirSync("./routes").forEach((file) => {
  app.use("/api", require(`./routes/${file}`));
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (let interfaceName in interfaces) {
    for (let iface of interfaces[interfaceName]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "Unknown IP";
}

const LOCAL_IP = getLocalIP();
console.log(`🚀 WebSocket Server running on ws://${LOCAL_IP}:${PORT}`);

// ✅ ฟังก์ชันเลือกห้องที่ใช้งานได้ ณ ขณะนี้
function getCurrentRoom(roomId) {
  if (!rooms[roomId] || !Array.isArray(rooms[roomId])) return null;

  const now = moment();
  const today = now.format("YYYY-MM-DD");

  const activeRoom = rooms[roomId].find((room) => {
    let roomDate = moment(room.date, "YYYY-MM-DD");
    let startTime = moment(`${room.date} ${room.start_time}`, "YYYY-MM-DD HH:mm");
    let endTime = moment(`${room.date} ${room.end_time}`, "YYYY-MM-DD HH:mm");

    console.log(`🔎 Checking Room: ${room.room_id}, Date: ${room.date}, Start: ${room.start_time}, End: ${room.end_time}`);
    console.log(`📆 Today: ${today}, Room Date: ${roomDate.format("YYYY-MM-DD")}`);
    console.log(`🕒 Current Time: ${now.format("HH:mm")}, Start Time: ${startTime.format("HH:mm")}, End Time: ${endTime.format("HH:mm")}`);

    return (
      roomDate.isSame(today, "day") &&  // ✅ ตรวจสอบว่าเป็นของวันนี้
      now.isSameOrAfter(startTime) &&   // ✅ ต้องเป็นเวลาที่เริ่มแล้ว
      now.isBefore(endTime)             // ✅ ต้องยังไม่หมดเวลา
    );
  });

  if (!activeRoom) {
    // console.log(`⏳ No active room for ${roomId}, waiting for start time.`);
  } else {
    console.log(`✅ Active Room Found: ${activeRoom.room_id}, User: ${activeRoom.user_name}`);
  }

  return activeRoom || null;
}



// ✅ ฟังก์ชันส่งข้อมูลห้องให้ ESP32 (แก้ไขให้เช็ควัน)
function sendRoomData(ws, roomId) {
  let activeRoom = getCurrentRoom(roomId);

  if (activeRoom) {
    if (!activeRoom.sent_data) {  
      console.log(`📤 Sending Room Data to ${roomId} (Date: ${activeRoom.date}, Time: ${activeRoom.start_time} - ${activeRoom.end_time})`);
      ws.send(JSON.stringify({ type: "room_data", data: activeRoom }));
      activeRoom.sent_data = true; // ✅ ป้องกันการส่งซ้ำ
    } else {
      console.log(`⏳ Room ${roomId} already sent. Skipping duplicate data.`);
    }
  } else {
    console.log(`⏳ No active room for ${roomId}, waiting for start time.`);
  }
}




// ✅ ปรับปรุง checkEndTime()
function checkEndTime() {
  const now = moment();
  console.log("⏳ Running checkEndTime() at", now.format("YYYY-MM-DD HH:mm"));

  Object.keys(rooms).forEach((roomId) => {
    rooms[roomId] = rooms[roomId].filter((room) => {
      let endTime = moment(`${room.date} ${room.end_time}`, "YYYY-MM-DD HH:mm");

      if (now.isSameOrAfter(endTime)) {
        if (!room.checked_in) {
          console.log(`Room ${roomId} - Not Checked-in! Setting checked_in: false.`);
          room.checked_in = false; // ✅ อัปเดตค่า checked_in เป็น false
        }
        console.log(`Room ${roomId} expired and removed.`);
        return false;  // ✅ ลบออกจาก rooms
      }
      return true;
    });

    if (rooms[roomId].length === 0) {
      delete rooms[roomId];
    } else {
      // ✅ ส่งข้อมูลใหม่ไป ESP32
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
          console.log(`📤 Sending updated Room Data to ${roomId}`);
          sendRoomData(client, roomId);
        }
      });
    }
  });
}



// ✅ ตั้งเวลาตรวจสอบทุก 10 วินาที
setInterval(() => {
  // console.log("🔄 Running checkEndTime()");
  checkEndTime();
}, 10000);

// ✅ WebSocket Event Handling
wss.on("connection", (ws) => {
  console.log("🔌 New ESP32 Connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log("📩 Received JSON:", data);

      if (data.join_room) {
        ws.roomId = data.join_room;
        sendRoomData(ws, data.join_room);
      }

      if (data.type === "check_in") {
        let room = getCurrentRoom(data.room_id);
        if (room) {
          room.checked_in = true;
          console.log(
            `✅ Room ${data.room_id} - Check-in at ${data.check_in_time}`
          );
        } else {
          console.log(`❌ Room ${data.room_id} not found`);
        }
      }
    } catch (error) {
      console.log("❌ Error parsing JSON:", error);
    }
  });

  ws.on("close", () => console.log("🔌 ESP32 Disconnected"));
});

// ✅ Start Server
server.listen(PORT, () =>
  console.log(`🚀 Server running on ws://localhost:${PORT}`)
);
