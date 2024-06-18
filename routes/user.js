const express = require("express");
const userController = require("../controllers/userController");

const router = express.Router();

router.get("/list", userController.list);

router.delete("/user", userController.deleteUser);

module.exports = router;
