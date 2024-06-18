const express = require("express");
const loginController = require('../controllers/loginController');

const router = express.Router(); //模块化路由

router.post("/register", loginController.register);

module.exports = router;
