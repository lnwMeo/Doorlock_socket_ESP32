const pool = require("../config/db");
const bcrypt = require("bcrypt");
exports.createUsers = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Missing required fields!" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(`INSERT INTO Users (username,password) VALUES (?,?)`, [
      username,
      hashedPassword,
    ]);
    res.json({ success: true, message: "Create User successfully!" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
};
