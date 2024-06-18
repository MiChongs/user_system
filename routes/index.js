const express = require("express");
const userRouter = require("./user");
const loginRouter = require("./login");
const app = express()
const cros = require("cors")
const router = express.Router();

app.use(cros());
router.use("/api", userRouter); // 注入用户路由模块
router.use("/api", loginRouter); // 注入登录路由模块

module.exports = router;
