// server.js
const http = require("http");
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const { readdirSync } = require("fs");
const os = require("os");
const moment = require("moment");
const WebSocket = require("ws");
const pool = require("./config/db");
require("dotenv").config();

const APP_PORT = process.env.PORT || 5000;
const HEARTBEAT_INTERVAL = 30000; // 30s
const CHECK_INTERVAL = 30000; // 30s

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

// mount API routes
readdirSync("./routes").forEach((file) => {
  app.use("/api", require(`./routes/${file}`));
});
app.get("/", (req, res) => res.send("Hello World"));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// แยกเก็บ WebSocket clients ตามประเภท
const espClients = new Set(); // ESP32 clients
const webClients = new Set(); // Frontend (เว็บ) clients

// helper: หา IP เครื่อง
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name in ifaces) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}
console.log(`🚀 WS Server on ws://${getLocalIP()}:${APP_PORT}`);

// heartbeat เพื่อเช็ค client ที่ตายไปแล้ว
function heartbeat() {
  this.isAlive = true;
}

// ส่งข้อมูลห้องให้ ESP32 ตัวใดตัวหนึ่ง (เมื่อ request join_room หรือ polling)
async function sendRoomDataToESPSingle(ws, roomId) {
  const now = moment();
  const today = now.format("YYYY-MM-DD");
  try {
    const [rows] = await pool.query(
      `SELECT r.reservation_id, r.user_id, r.room_id, r.description,
              r.date, r.start_time, r.end_time, r.unlock_key,
              r.sent_to_esp32, u.username
       FROM reservation r
       JOIN users u ON r.user_id = u.user_id
       WHERE r.room_id = ? 
         AND r.date = ? 
         AND r.status_id = 2
         -- เลือกเฉพาะแถวที่ยังไม่ส่ง
         AND r.sent_to_esp32 = 0
       ORDER BY r.start_time ASC
       LIMIT 1`,
      [roomId, today]
    );
    if (!rows.length) return;
    const r = rows[0];
    const start = moment(`${r.date} ${r.start_time}`, "YYYY-MM-DD HH:mm");
    const end = moment(`${r.date} ${r.end_time}`, "YYYY-MM-DD HH:mm");
    if (now.isBetween(start, end, null, "[)")) {
      // 1) ส่ง payload ให้ ESP32
      const payload = {
        type: "room_data",
        data: {
          reservation_id: r.reservation_id,
          user_id: r.user_id,
          room_id: r.room_id,
          description: r.description,
          date: r.date,
          start_time: r.start_time,
          end_time: r.end_time,
          unlock_key: r.unlock_key,
          username: r.username,
        },
      };
      ws.send(JSON.stringify(payload));
      console.log(`📤 Sent room_data to ESP32 for room ${roomId}`);

      // 2) อัปเดต flag sent_to_esp32 = 1
      await pool.query(
        `UPDATE reservation 
           SET sent_to_esp32 = 1, 
               updated_at    = NOW() 
         WHERE reservation_id = ?`,
        [r.reservation_id]
      );
      console.log(`✅ Marked reservation ${r.reservation_id} as sent_to_esp32`);
    }
  } catch (err) {
    console.error(`❌ Error in sendRoomDataToESPSingle:`, err);
  }
}

// broadcast เหตุการณ์เช็กอินไปยังเว็บ UI เท่านั้น
async function broadcastCheckInToWeb(data) {
  // data ควรเป็นอ็อบเจ็กต์ที่มี { reservation_id, room_id, check_in_date, check_in_time }
  const { reservation_id, room_id, check_date, check_time } = data;

  try {
    // 1) ดึงชื่อผู้จอง (reserved_by) และ end_time จากตาราง reservation JOIN users
    const [[row]] = await pool.query(
      `SELECT u.username AS reserved_by, r.end_time
         FROM reservation r
         JOIN users u ON r.user_id = u.user_id
        WHERE r.reservation_id = ?
        LIMIT 1`,
      [reservation_id]
    );
    const reserved_by = row ? row.reserved_by : "";
    const end_time = row ? row.end_time : null; // จะได้ค่าเป็น string "HH:mm:ss" หรือ null

    // 2) สร้าง payload พร้อมส่วนนามผู้จอง และ end_time
    const payload = {
      type: "room_checked_in",
      data: {
        reservation_id,
        room_id,
        username: reserved_by, // ชื่อผู้จอง
        check_date, // YYYY-MM-DD
        check_time, // HH:mm:ss
        end_time, // จาก DB
      },
    };

    // 3) ส่ง payload ไปยังทุก WebUI client
    webClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });
  } catch (err) {
    console.error("❌ Error in broadcastCheckInToWeb:", err);
  }
}

// broadcast เหตุการณ์เช็กเอาท์ไปยังเว็บ UI เท่านั้น
async function broadcastCheckOutToWeb(data) {
  const { reservation_id, room_id, check_date, check_time } = data;
  try {
    // ดึงชื่อผู้จอง และ start_time (ถ้าต้องการ)
    const [[row]] = await pool.query(
      `SELECT u.username AS reserved_by
         FROM reservation r
         JOIN users u ON r.user_id = u.user_id
        WHERE r.reservation_id = ?
        LIMIT 1`,
      [reservation_id]
    );
    const reserved_by = row ? row.reserved_by : "";

    const payload = {
      type: "room_checked_out",
      data: {
        reservation_id,
        room_id,
        username: reserved_by,
        check_date,
        check_time,
      },
    };

    webClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    });
  } catch (err) {
    console.error("❌ Error in broadcastCheckOutToWeb:", err);
  }
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  ws.on("message", async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (err) {
      return console.error("Invalid WS message:", err);
    }

    // 1) Identify client ว่าเป็น esp32 หรือ web
    if (data.type === "identify") {
      if (data.client === "esp32") {
        ws.isESP = true;
        ws.roomId = data.room_id;
        espClients.add(ws);
        console.log("➡️ Registered ESP32 client");
      } else if (data.client === "web") {
        ws.isWebUI = true;
        webClients.add(ws);
        console.log("➡️ Registered WebUI client");
      }
      return;
    }

    // 2) ESP32 ขอ join_room
    if (ws.isESP && data.join_room) {
      const roomId = data.join_room;
      ws.roomId = roomId;
      await sendRoomDataToESPSingle(ws, roomId);
      console.log(`🔄 ESP32 re-joined room ${data.join_room}`);
      return;
    }

    // 3) รวมกรณี room_log, check_in, check_out และ admin lock/unlock
    if (ws.isESP && (data.type === "room_log" || data.type === "check_out")) {
      // กำหนด action ให้ถูกต้อง
      const action = data.type === "check_out" ? "check_out" : data.action;

      let {
        reservation_id,
        user_id,
        room_id,
        role = "user",
        check_date,
        check_time,
      } = data;

      // lookup reservation_id ถ้าไม่มี
      if (!reservation_id && role === "user") {
        const [[row]] = await pool.query(
          `SELECT reservation_id
             FROM reservation
            WHERE room_id = ? AND user_id = ? AND date = ?
            ORDER BY ${action === "check_in" ? "start_time" : "end_time"} DESC
            LIMIT 1`,
          [room_id, user_id, check_date]
        );
        reservation_id = row?.reservation_id || null;
      }

      try {
        // บันทึกเข้า room_logs
        await pool.query(
          `INSERT INTO room_logs
             (reservation_id, user_id, room_id, role, action, check_date, check_time)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            reservation_id,
            user_id,
            room_id,
            role,
            action,
            check_date,
            check_time,
          ]
        );
        console.log(
          `✅ Saved ${action} by ${role} (res=${reservation_id}, room=${room_id})`
        );

        // กระจายเหตุการณ์ไป WebUI
        if (action === "check_in") {
          await broadcastCheckInToWeb({
            reservation_id,
            room_id,
            check_date,
            check_time,
          });
        } else if(action === "check_out"){
          await broadcastCheckOutToWeb({
            reservation_id,
            room_id,
            check_date,
            check_time,
          });
        }
      } catch (e) {
        console.error("❌ Error saving room_log:", e);
      }
      return;
    }

    // 4) ข้อความอื่น ๆ … (ถ้ามี)
  });

  ws.on("close", () => {
    console.log("🛑 Client disconnected");
    if (ws.isESP) {
      espClients.delete(ws);
      console.log("❌ ESP32 client removed");
    }
    if (ws.isWebUI) {
      webClients.delete(ws);
      console.log("❌ WebUI client removed");
    }
  });
});

// heartbeat เพื่อตรวจสอบว่า client ยังคงเชื่อมต่ออยู่
const hbInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// polling เพื่อส่ง room_data ให้ ESP32 ทุก 30 วินาที (ถ้ายังไม่ได้ส่ง)
const chkInterval = setInterval(async () => {
  for (const ws of espClients) {
    if (ws.readyState === WebSocket.OPEN && ws.roomId) {
      await sendRoomDataToESPSingle(ws, ws.roomId);
    }
  }
}, CHECK_INTERVAL);

wss.on("close", () => {
  clearInterval(hbInterval);
  clearInterval(chkInterval);
});

server.listen(APP_PORT, () =>
  console.log(`Server running on port ${APP_PORT}`)
);
