const express = require("express");
const router = express.Router();
const { createUsers } = require("../controller/users_controller");

router.post("/createusers", createUsers);

module.exports = router;
