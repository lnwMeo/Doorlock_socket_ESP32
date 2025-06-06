const Joi = require("joi");

// ✅ Schema: สำหรับ register โดย user (ไม่ให้เลือก role เป็น admin)
exports.registerSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/)
    .required()
    .messages({
      "string.pattern.base": "รหัสผ่านไม่ปลอดภัยพอ",
    }),
    role: Joi.string().optional().default("user")
});

// ✅ Schema: Login
exports.loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });



// ✅ Schema: สำหรับสร้าง user โดย admin (เลือก user หรือ admin ได้)
exports.createUserSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/)
    .required()
    .messages({
      "string.pattern.base": "รหัสผ่านไม่ปลอดภัยพอ",
    }),
  role: Joi.string().valid("user", "admin").required(),
});

// ✅ Schema: Reset Password
exports.resetPasswordSchema = Joi.object({
  user_id: Joi.number().integer().required(),
  new_password: Joi.string()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/)
    .required()
    .messages({
      "string.pattern.base": "รหัสผ่านใหม่ไม่ปลอดภัยพอ",
    }),
  confirm_password: Joi.ref("new_password"),
}).with("new_password", "confirm_password");
