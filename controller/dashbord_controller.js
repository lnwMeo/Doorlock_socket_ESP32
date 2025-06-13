const { json } = require("express");
const pool = require("../config/db");
exports.getDashboardStats = async (req, res) => {
  try {
    const [
      [pending], // รออนุมัติ
      [approved], // อนุมัติแล้ว
      [rooms], // ห้องทั้งหมด
      [users], // User ทั้งหมด
      [admins], // Admin ทั้งหมด
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total 
         FROM reservation 
         WHERE status_id = 1
           AND (date > CURDATE() OR (date = CURDATE() AND end_time > CURTIME()))`
      ),
      pool.query(
        `SELECT COUNT(*) AS total 
         FROM reservation 
         WHERE status_id = 2
           AND (date > CURDATE() OR (date = CURDATE() AND end_time > CURTIME()))`
      ),
      // pool.query(
      //   `SELECT COUNT(*) AS total FROM reservation WHERE status_id = 1`
      // ), // 1 = pending
      // pool.query(
      //   `SELECT COUNT(*) AS total FROM reservation WHERE status_id = 2`
      // ), // 2 = approved
      pool.query(`SELECT COUNT(*) AS total FROM room`),
      pool.query(`SELECT COUNT(*) AS total FROM users WHERE role = 'user'AND is_deleted = FALSE`),
      pool.query(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin'AND is_deleted = FALSE`),
    ]);

    res.json({
      success: true,
      data: {
        pending_reservations: pending[0].total,
        approved_reservations: approved[0].total,
        total_rooms: rooms[0].total,
        total_users: users[0].total,
        total_admins: admins[0].total,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Server error" });
  }
};

exports.getRoomUsageStats = async (req, res) => {
  const { year, month } = req.query;

  // แปลงเป็นตัวเลขหรือ null
  const yParam = year ? parseInt(year, 10) : null;
  const mParam = month ? parseInt(month, 10) : null;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        r.room_id,
        r.room_name,
        ? AS year,
        ? AS month,
        COUNT(l.log_id) AS checkins
      FROM room r
      LEFT JOIN room_logs l 
        ON r.room_id = l.room_id 
       AND l.action = 'check_in'
       AND ( ? IS NULL OR YEAR(l.check_date) = ? )
       AND ( ? IS NULL OR MONTH(l.check_date) = ? )
      GROUP BY 
        r.room_id, r.room_name
      ORDER BY 
        r.room_id
      `,
      [
        yParam,
        mParam,
        yParam, yParam,
        mParam, mParam,
      ]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("❌ Error fetching room usage:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.getUserUsageSummary = async (req, res) => {
  const { month, year, user_id } = req.query;

  try {
    const conditions = [];
    const values = [];

    if (user_id) {
      conditions.push("u.user_id = ?");
      values.push(user_id);
    }

    if (month) {
      conditions.push("MONTH(r.date) = ?");
      values.push(month);
    }

    if (year) {
      conditions.push("YEAR(r.date) = ?");
      values.push(year);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT 
           u.user_id,
           u.username,
           COUNT(r.reservation_id) AS total_reservations,
           COUNT(CASE WHEN EXISTS (
             SELECT 1 FROM room_logs l 
             WHERE l.reservation_id = r.reservation_id AND l.action = 'check_in'
           ) THEN 1 END) AS attended,
           COUNT(CASE WHEN NOT EXISTS (
             SELECT 1 FROM room_logs l 
             WHERE l.reservation_id = r.reservation_id AND l.action = 'check_in'
           ) THEN 1 END) AS missed
         FROM reservation r
         JOIN users u ON r.user_id = u.user_id
         ${whereClause}
         GROUP BY u.user_id`,
      values
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("❌ Error fetching user usage summary:", error);
    res.status(500).json({ error: "Server error" });
  }
};

exports.getRecentLogs = async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT rl.*, u.username 
         FROM room_logs rl 
         JOIN users u ON rl.user_id = u.user_id 
         ORDER BY rl.created_at DESC 
         LIMIT 10`
    );

    const formatted = logs.map((log) => ({
      username: log.username,
      room_id: log.room_id,
      action: log.action,
      role: log.role,
      time: `${log.check_in_date} ${log.check_in_time}`,
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error("❌ Failed to get recent logs:", error);
    res.status(500).json({ error: "Server error" });
  }
};

exports.getUserName = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT user_id, username FROM users WHERE role = 'user' ORDER BY user_id`
    );
    res.json({ success: true, data: users });
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.gettotalSummary = async (req, res) => {
  const { month, year } = req.query;
  const conditions = [];
  const values = [];

  if (month) {
    conditions.push("MONTH(r.date) = ?");
    values.push(month);
  }
  if (year) {
    conditions.push("YEAR(r.date) = ?");
    values.push(year);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const [rows] = await pool.query(
      `
      SELECT
        COUNT(r.reservation_id) AS total_reservations,

        -- เช็กอินแล้ว
        SUM(
          CASE WHEN EXISTS (
            SELECT 1 FROM room_logs l
            WHERE l.reservation_id = r.reservation_id
              AND l.action = 'check_in'
          ) THEN 1 ELSE 0 END
        ) AS attended,

        -- ไม่เช็กอิน
        SUM(
          CASE WHEN NOT EXISTS (
            SELECT 1 FROM room_logs l
            WHERE l.reservation_id = r.reservation_id
              AND l.action = 'check_in'
          ) THEN 1 ELSE 0 END
        ) AS missed,

        ROUND(
          SUM(
            CASE WHEN EXISTS (
              SELECT 1 FROM room_logs l
              WHERE l.reservation_id = r.reservation_id
                AND l.action = 'check_in'
            ) THEN 1 ELSE 0 END
          ) / COUNT(r.reservation_id) * 100, 2
        ) AS attended_percent,

        ROUND(
          SUM(
            CASE WHEN NOT EXISTS (
              SELECT 1 FROM room_logs l
              WHERE l.reservation_id = r.reservation_id
                AND l.action = 'check_in'
            ) THEN 1 ELSE 0 END
          ) / COUNT(r.reservation_id) * 100, 2
        ) AS missed_percent,

        -- นับตาม status_id
        SUM(CASE WHEN r.status_id = 2 THEN 1 ELSE 0 END) AS status_2_count,
        SUM(CASE WHEN r.status_id = 3 THEN 1 ELSE 0 END) AS status_3_count,
        SUM(CASE WHEN r.status_id = 4 THEN 1 ELSE 0 END) AS status_4_count,
        SUM(CASE WHEN r.status_id = 5 THEN 1 ELSE 0 END) AS status_5_count

      FROM reservation r
      ${whereClause}
      `,
      values
    );

    const summary = rows[0] || {
      total_reservations:    0,
      attended:              0,
      missed:                0,
      attended_percent:      0,
      missed_percent:        0,
      status_2_count:        0,
      status_3_count:        0,
      status_4_count:        0,
      status_5_count:        0,
    };

    return res.json({ success: true, data: summary });
  } catch (err) {
    console.error("❌ Error fetching usage summary:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.getroomLogs = async (req,res)=>{
   try {
    const [rows] = await pool.query(
      `SELECT 
         rl.log_id,
         rl.reservation_id,
         rl.user_id,
         u.username,            
         rl.room_id,
         rl.role,
         rl.action,
         rl.check_date,
         rl.check_time,
         rl.created_at
       FROM room_logs rl
       JOIN users u ON rl.user_id = u.user_id
       ORDER BY rl.created_at DESC`
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("❌ Error fetching room_logs:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

exports.activeCountRoom = async (req,res) =>{
   try {
    const [rows] = await pool.query(
      `
      SELECT COUNT(DISTINCT r.room_id) AS active_count
      FROM room_logs l
      JOIN reservation r ON l.reservation_id = r.reservation_id
      WHERE l.action = 'check_in'
        AND r.status_id = 2
        AND CONCAT(r.date, ' ', r.end_time) >= NOW()
      `
    );

    // rows[0].active_count จะเก็บจำนวนห้องที่กำลังใช้งาน
    const count = rows[0]?.active_count || 0;
    return res.json({ success: true, data: { active_rooms: count } });
  } catch (err) {
    console.error("❌ Error fetching active rooms count:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}