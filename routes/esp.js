const express = require("express");
const router = express.Router();
const { logCheckin, getroomdata } = require("../controller/esp_controller");

router.post("/log-check-in", logCheckin);
router.get("/get-room-data", getroomdata);

module.exports = router;
