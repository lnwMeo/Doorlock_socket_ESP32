const http = require("http");
const express = require("express");
const morgan = require("morgan");
const { readdirSync } = require("fs");
const cors = require("cors");
const WebSocket = require("ws");
const os = require("os");

const { rooms, handleCheckIn } = require("./controller/esp_controller"); // ✅ นำเข้า rooms และ handleCheckIn

const PORT = 5000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

// ✅ ฟังก์ชันดึง IP Address ของเครื่อง
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

// โหลด router
readdirSync("./routes").map((c) => app.use("/api", require("./routes/" + c)));

// ✅ ฟังก์ชันส่งข้อมูลห้องให้ ESP32
function sendRoomData(ws, roomId) {
  const room = rooms[roomId];
  if (room) {
    console.log(`📤 Sending Room Data to ${roomId}`);
    ws.send(JSON.stringify({ type: "room_data", data: room }));
  } else {
    console.log(`❌ Room ${roomId} not found!`);
    ws.send(JSON.stringify({ error: "Room not found" }));
  }
}

// ✅ WebSocket Handling
wss.on("connection", (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  console.log(`📡 ESP32 Connected from ${clientIP}`);

  ws.on("message", (message) => {
    try {
      let cleanMessage = message.toString().trim();
      cleanMessage = cleanMessage.replace(/\0/g, ""); // ✅ ลบอักขระ null (หากมี)

      const data = JSON.parse(cleanMessage);
      console.log("📩 Received JSON:", data);

      if (data.join_room) {
        sendRoomData(ws, data.join_room);
      }

      if (data.type === "check_in") {
        handleCheckIn(data);
      }
    } catch (error) {
      console.log("❌ Invalid JSON:", message.toString());
      ws.send(JSON.stringify({ error: "Invalid JSON format" }));
    }
  });

  ws.on("close", () => {
    console.log("🔌 ESP32 Disconnected");
  });
});

// ✅ เริ่ม Server
server.listen(PORT, () => {
  console.log(`🚀 WebSocket & API Server running on http://${LOCAL_IP}:${PORT}`);
});
