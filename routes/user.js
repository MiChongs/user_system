const express = require("express");
const userController = require("../controllers/userController");
const {body} = require("express-validator");

const userRouter = express.Router();

userRouter.get("/list", userController.list);

userRouter.delete("/user", userController.deleteUser);
userRouter.post("/register", [
    body('appid').notEmpty().withMessage("隶属于应用id不得为空").isInt().withMessage("应用id不符合要求"), body('account').notEmpty().withMessage("账号不得为空").isAscii().withMessage("账号不符合要求"),
    body('username').notEmpty().withMessage("用户名不得为空"),body('markcode').notEmpty().withMessage("设备码不得为空"),
    body('password').notEmpty().withMessage("密码不得为空").isLength({
        min: 8,
        max: 24
    }).withMessage("密码最少8位，最多24位")
], userController.register);
module.exports = userRouter;
