const express = require("express")
const adminController = require('../controllers/adminController')
const {body} = require("express-validator")

const router = express.Router(); //模块化路由

router.post("/login", [
    body("account").not().isEmpty().withMessage("账号是必须的"),
    body("password").not().isEmpty().withMessage("密码是必须的"),
], adminController.login);

module.exports = router;
