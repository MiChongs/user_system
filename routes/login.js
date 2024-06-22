const express = require("express");
const loginController = require('../controllers/loginController');
const {body} = require("express-validator");

const router = express.Router(); //模块化路由

router.post("/login", loginController.login);

module.exports = router;
