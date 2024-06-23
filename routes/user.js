const express = require("express");
const userController = require("../controllers/userController");
const { body, check } = require("express-validator");
const userRouter = express.Router();
const globals = require("../global/index");

const normalBodyValidator = [
    body('appid').notEmpty().withMessage("隶属于应用id不得为空").isInt().withMessage("应用id不符合要求"), body('account').notEmpty().withMessage("账号不得为空").isAscii().withMessage("账号不符合要求"),
    body('username').notEmpty().withMessage("用户名不得为空"), body('markcode').notEmpty().withMessage("设备码不得为空"),
    body('password').notEmpty().withMessage("密码不得为空").isLength({
        min: 8,
        max: 24
    }).withMessage("密码最少8位，最多24位")
]

const userBodyValidator = [
    body('appid').notEmpty().withMessage("隶属于应用id不得为空").isInt().withMessage("应用id不符合要求"), body('markcode').notEmpty().withMessage("设备码不得为空"), body('token').notEmpty().withMessage("token不得为空"),
]

userRouter.get("/list", userController.list);

userRouter.post("/register", normalBodyValidator, userController.register);
userRouter.post("/devices", [
    body('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), body('account').not().notEmpty().withMessage('账号不得为空')
], userController.devices);
userRouter.delete('/logout', userBodyValidator, userController.logout)
userRouter.delete('/logoutDevice', userBodyValidator, userController.deleteDevice)
userRouter.post('/uploadAvatar', userController.uploadAvatar)
module.exports = userRouter;
