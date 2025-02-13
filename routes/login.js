const express = require("express");
const loginController = require('../controllers/loginController');
const {body, check} = require("express-validator");
const {expressjwt} = require("express-jwt");
const {userPath} = require("../global");
const userJwt = require("../middleware/userJwt");
const router = express.Router(); //模块化路由
router.use(userJwt)
// 常规登录
router.post("/login", [
    body('appid').notEmpty().withMessage("隶属于应用id不得为空").isInt().withMessage("应用id不符合要求"),
    body('account').notEmpty().withMessage("账号不得为空").isAscii().withMessage("账号不符合要求"),
    body('password').notEmpty().withMessage("密码不得为空").isLength({
        min: 8, max: 24
    }).withMessage("密码最少8位，最多24位"),
    body('markcode').notEmpty().withMessage("设备码不得为空"),
    check('device').notEmpty().withMessage("设备名称不得为空"),
], loginController.login);

// QQ登录
router.post('/login_qq', [
    check('appid').notEmpty().withMessage('隶属于应用id不得为空'),
    check('access_token').notEmpty().withMessage('Access Token 不得为空'),
    check('openid').notEmpty().withMessage('openid 不得为空'),
    check('qqappid').notEmpty().withMessage('qqappid 不得为空'),
    check('markcode').notEmpty().withMessage('设备码不得为空'),
    check('device').notEmpty().withMessage("设备名称不得为空")
], loginController.QQLogin);

// 二维码登录相关路由
router.post('/generate-qr-code', [
    body('appid').notEmpty().withMessage("应用ID不得为空").isInt().withMessage("应用ID必须为数字"),
], loginController.generateQRCode);

router.post('/check-qr-status', [
    body('qrId').notEmpty().withMessage("二维码ID不得为空"),
], loginController.checkQRStatus);

router.post('/scan-qr-code', [
    body('qrId').notEmpty().withMessage("二维码ID不得为空"),
    body('userId').notEmpty().withMessage("用户ID不得为空"),
    body('appid').notEmpty().withMessage("应用ID不得为空").isInt().withMessage("应用ID必须为数字"),
    body('device').notEmpty().withMessage("设备名称不得为空"),
], loginController.scanQRCode);

module.exports = router;
