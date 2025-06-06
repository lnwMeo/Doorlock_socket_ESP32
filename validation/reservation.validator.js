const Joi = require("joi");

exports.reservationSchema = Joi.object({
  user_id: Joi.number().integer().required(),
  room_id: Joi.string().required(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(), // YYYY-MM-DD
  start_time: Joi.string().pattern(/^\d{2}:\d{2}$/).required(), // ✅ HH:mm
  end_time: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),   // ✅ HH:mm
  description: Joi.string().allow("").default(""),
});