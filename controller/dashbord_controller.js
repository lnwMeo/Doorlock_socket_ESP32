const pool = require("../config/db");
exports.getDashboardStats = async (req, res) => {
    try {
      const [
        [pending],      // รออนุมัติ
        [approved],     // อนุมัติแล้ว
        [rooms],        // ห้องทั้งหมด
        [users],        // User ทั้งหมด
        [admins]        // Admin ทั้งหมด
      ] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS total FROM reservation WHERE status_id = 1`),  // 1 = pending
        pool.query(`SELECT COUNT(*) AS total FROM reservation WHERE status_id = 2`),  // 2 = approved
        pool.query(`SELECT COUNT(*) AS total FROM room`),
        pool.query(`SELECT COUNT(*) AS total FROM users WHERE role = 'user'`),
        pool.query(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin'`)
      ]);
  
      res.json({
        success: true,
        data: {
          pending_reservations: pending[0].total,
          approved_reservations: approved[0].total,
          total_rooms: rooms[0].total,
          total_users: users[0].total,
          total_admins: admins[0].total,
        }
      });
    } catch (error) {
      console.error("❌ Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Server error" });
    }
  };

  exports.getRoomUsageStats = async (req, res) => {
    const { year, month } = req.query;

    try {
      const [rows] = await pool.query(
        `
        SELECT 
          r.room_id,
          r.room_name,
          COALESCE(YEAR(l.check_in_date), ?) AS year,
          COALESCE(MONTH(l.check_in_date), ?) AS month,
          COUNT(l.log_id) AS checkins
        FROM 
          room r
        LEFT JOIN 
          room_logs l ON r.room_id = l.room_id AND l.action = 'check_in'
          AND (? IS NULL OR YEAR(l.check_in_date) = ?)
          AND (? IS NULL OR MONTH(l.check_in_date) = ?)
        GROUP BY 
          r.room_id, r.room_name, year, month
        ORDER BY 
          r.room_id
        `,
        [year || null, month || null, year || null, year || null, month || null, month || null]
      );
  
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("❌ Error fetching room usage:", err);
      res.status(500).json({ error: "Server error" });
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
  
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  
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
         GROUP BY u.user_id`
        , values
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
  
      const formatted = logs.map(log => ({
        username: log.username,
        room_id: log.room_id,
        action: log.action,
        role: log.role,
        time: `${log.check_in_date} ${log.check_in_time}`
      }));
  
      res.json({ success: true, data: formatted });
    } catch (error) {
      console.error("❌ Failed to get recent logs:", error);
      res.status(500).json({ error: "Server error" });
    }
  };
  
  
  