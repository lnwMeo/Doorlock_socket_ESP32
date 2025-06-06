// server.js
const http = require('http');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const { readdirSync } = require('fs');
const os = require('os');
const moment = require('moment');
const WebSocket = require('ws');
const pool = require('./config/db');
require('dotenv').config();

const APP_PORT = process.env.PORT || 5000;
const HEARTBEAT_INTERVAL = 30000; // 30s
const CHECK_INTERVAL = 30000;   // 30s

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

// mount API routes
readdirSync('./routes').forEach(file => {
  app.use('/api', require(`./routes/${file}`));
});

app.get('/', (req, res) => res.send('Hello World'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// store clients: roomId -> Set of ws
const clients = new Map();

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name in ifaces) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}
console.log(`🚀 WS Server on ws://${getLocalIP()}:${APP_PORT}`);

// heartbeat to detect dead clients
function heartbeat() { this.isAlive = true; }

// send pending room data to ws
async function sendRoomData(ws, roomId) {
  const now = moment();
  const today = now.format('YYYY-MM-DD');
  try {
    const [rows] = await pool.query(
      `SELECT r.reservation_id, r.user_id, r.room_id, r.description,
              r.date, r.start_time, r.end_time, r.unlock_key,
              r.sent_to_esp32, r.status_id, r.approved_by,
              r.created_at, r.updated_at, u.username
       FROM reservation r
       JOIN users u ON r.user_id = u.user_id
       WHERE r.room_id = ? AND r.date = ? AND r.status_id = 2
         AND r.sent_to_esp32 = 0
       ORDER BY r.start_time ASC
       LIMIT 1`,
      [roomId, today]
    );
    if (!rows.length) return;
    const r = rows[0];
    const start = moment(`${r.date} ${r.start_time}`, 'YYYY-MM-DD HH:mm');
    const end = moment(`${r.date} ${r.end_time}`, 'YYYY-MM-DD HH:mm');
    if (now.isBetween(start, end, null, '[)')) {
      const payload = {
        type: 'room_data',
        data: {
          reservation_id: r.reservation_id,
          user_id: r.user_id,
          room_id: r.room_id,
          description: r.description,
          date: r.date,
          start_time: r.start_time,
          end_time: r.end_time,
          unlock_key: r.unlock_key,
          sent_to_esp32: r.sent_to_esp32,
          status_id: r.status_id,
          approved_by: r.approved_by,
          created_at: moment(r.created_at).format('YYYY-MM-DD HH:mm:ss'),
          updated_at: moment(r.updated_at).format('YYYY-MM-DD HH:mm:ss'),
          username: r.username,
        }
      };
      ws.send(JSON.stringify(payload));
      console.log(`Sent room_data to room ${roomId}`);
      await pool.query(
        'UPDATE reservation SET sent_to_esp32 = 1 WHERE reservation_id = ?',
        [r.reservation_id]
      );
    }
  } catch (err) {
    console.error(`Error sending room data for room ${roomId}:`, err);
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  console.log('🔌 New client connected');

  ws.on('message', async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (err) {
      return console.error('Invalid WS message:', err);
    }

    // client joins a room
    if (data.join_room) {
      const roomId = data.join_room;
      ws.roomId = roomId;
      if (!clients.has(roomId)) clients.set(roomId, new Set());
      clients.get(roomId).add(ws);
      console.log(`Client joined room ${roomId}`);
      await sendRoomData(ws, roomId);
    }

    // handle check-in / room_log messages
    if (data.type === 'room_log' || data.type === 'check_in') {
      let { reservation_id, user_id, room_id, role = 'user', action = 'check_in', check_in_date, check_in_time } = data;
      // fetch reservation_id if missing
      if (!reservation_id) {
        try {
          const [[row]] = await pool.query(
            `SELECT reservation_id FROM reservation
             WHERE room_id = ? AND user_id = ? AND date = ?
             ORDER BY start_time DESC LIMIT 1`,
            [room_id, user_id, check_in_date]
          );
          reservation_id = row && row.reservation_id;
        } catch (e) {
          console.warn('Cannot fetch reservation_id:', e);
        }
      }
      // insert log with reservation_id
      try {
        await pool.query(
          `INSERT INTO room_logs (reservation_id, user_id, room_id, role, action, check_in_date, check_in_time)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [reservation_id || null, user_id, room_id, role, action, check_in_date, check_in_time]
        );
        console.log(`Saved log: reservation_id=${reservation_id} ${role} ${action} for room ${room_id}`);
      } catch (err) {
        console.error('Error saving log:', err);
      }
    }
  });

  ws.on('close', () => {
    console.log('🛑 Client disconnected');
    const rid = ws.roomId;
    if (rid && clients.has(rid)) {
      clients.get(rid).delete(ws);
      if (!clients.get(rid).size) clients.delete(rid);
    }
  });
});

// heartbeat to keep alive
const hbInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// periodically push room data
const chkInterval = setInterval(async () => {
  for (const [roomId, conns] of clients) {
    for (const ws of conns) {
      if (ws.readyState === WebSocket.OPEN) {
        await sendRoomData(ws, roomId);
      }
    }
  }
}, CHECK_INTERVAL);

wss.on('close', () => clearInterval(hbInterval));
server.listen(APP_PORT, () => console.log(`Server running on port ${APP_PORT}`));
