const express = require("express");
const router = express.Router();
// middleware
const { verifyToken, requireAdmin } = require("../middleware/auth");
// import_AuthControlller
const { login, register } = require("../controller/auth_controller");
// import_AdminController
const {
  createUser,
  resetUserPassword,
  approveReservation,
  rejectReservation,
  createRoom,
  getAllReservation,
  createstatusReservation,
} = require("../controller/admins_controller");

const { logCheckin, getRoomData } = require("../controller/logs_controller");
const { createReservation } = require("../controller/reservation_controller");

// Login_register_routes
router.post("/login", login);
router.post("/register", register);

// Admin_routes
// create_user_by_admin
router.post("/create-user", verifyToken, requireAdmin, createUser);
// resetpassword_user_by_admin
router.patch(
  "/resetpassword-user",
  verifyToken,
  requireAdmin,
  resetUserPassword
);
// approve_reservation_by_admin
router.patch(
  "/approve/:reservation_id",
  verifyToken,
  requireAdmin,
  approveReservation
);
// reject_reservation_by_admin
router.patch(
  "/reject/:reservation_id",
  verifyToken,
  requireAdmin,
  rejectReservation
);
// createroom_by_admin
router.post("/createroom", verifyToken, requireAdmin, createRoom);
// roomdata_by_admin
router.get("/getroomdata/:roomId", verifyToken, requireAdmin, getRoomData);
// createStatusReservation_by_admin
router.post(
  "/createstatusreservation",
  verifyToken,
  requireAdmin,
  createstatusReservation
);
// filterReservation_by_admin
router.get("/allreservation", verifyToken, requireAdmin, getAllReservation);

// User_routes
// createreservation_by_user
router.post("/createreservation", createReservation, verifyToken);

// logs_routes
router.post("/log-check-in", logCheckin);

module.exports = router;
