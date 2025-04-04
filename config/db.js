const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'localhost',  // หรือ IP ของเซิร์ฟเวอร์
  user: 'root',       // ชื่อผู้ใช้ MySQL
  password: '',       // รหัสผ่าน MySQL
  database: 'doorlock' // ชื่อฐานข้อมูลที่ใช้งาน
});

module.exports = pool.promise();
