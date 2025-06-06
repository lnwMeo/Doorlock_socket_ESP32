const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { loginSchema, registerSchema } = require("../validation/auth.validator");

// ✅ Login
exports.login = async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { email, password } = value;

  try {
    const [users] = await pool.query(  "SELECT * FROM users WHERE email = ? AND is_deleted = FALSE",
  [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const payload = {
      user_id: user.user_id,
      username: user.username,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "3h" });

    res.json({
      message: "Login successful",
      token,
      user: payload,
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ Register
exports.register = async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const { username, email, password } = value;

  try {
    const [existing] = await pool.query(
      "SELECT * FROM users WHERE username = ? OR email = ?",
      [username, email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: "Username or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = "user";

    await pool.query(
      "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
      [username, email, hashedPassword, role]
    );

    res.json({ message: "User registered successfully" });
  } catch (error) {
    console.error("❌ Register error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
