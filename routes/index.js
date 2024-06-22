const express = require("express");
const userRouter = require("./user");
const loginRouter = require("./login");
const appRouter = require("./app");
const adminRouter = require("./admin");
const app = express()
const cros = require("cors")
const router = express.Router();

app.use(cros());
router.use("/api/user", userRouter,loginRouter); // 注入用户路由模块
router.use("/api/app", appRouter);
router.use("/api/admin", adminRouter);

module.exports = router;
