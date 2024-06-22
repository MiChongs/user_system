const express = require("express");
const loginController = require('../controllers/loginController');
const {body} = require("express-validator");

const router = express.Router(); //模块化路由

router.post("/login", [
    body('appid').notEmpty().withMessage("隶属于应用id不得为空").isInt().withMessage("应用id不符合要求"),
    body('account').notEmpty().withMessage("账号不得为空").isAscii().withMessage("账号不符合要求"),
    body('password').notEmpty().withMessage("密码不得为空").isLength({
        min: 8,
        max: 24
    }).withMessage("密码最少8位，最多24位")
], loginController.login);

module.exports = router;
