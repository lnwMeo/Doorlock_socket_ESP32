const express = require("express");
const router = express.Router();
const {
  createRoom,
  createReservation,
  logCheckin,
  getAllReservation,
  getRoomData,
} = require("../controller/esp_controller");

router.post("/createroom", createRoom);
router.post("/createreservation", createReservation);
router.post("/log-check-in", logCheckin);
router.get("/allreservation", getAllReservation);
router.get("/getroomdata/:roomId", getRoomData);

module.exports = router;
