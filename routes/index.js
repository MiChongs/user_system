const express = require("express");
const userRouter = require("./user");
const loginRouter = require("./login");
const appRouter = require("./app");
const adminRouter = require("./admin");
const app = express()
const cros = require("cors")
const {redisClient, jwt, userPath, adminPath} = require("../global");
const {expressjwt} = require("express-jwt");
const {promisify} = require("util");
const roleRouter = require("./role");
const router = express.Router();

const getAsync = promisify(redisClient.get).bind(redisClient);
const setAsync = promisify(redisClient.set).bind(redisClient);
const delAsync = promisify(redisClient.del).bind(redisClient);
const extAsync = promisify(redisClient.exists).bind(redisClient);
const connectRedis = promisify(redisClient.connect).bind(redisClient);
const disconnectRedis = promisify(redisClient.disconnect).bind(redisClient);

appRouter.use(expressjwt({
    algorithms: ['HS256'], secret: process.env.ADMIN_TOKEN_KEY
}))

router.use("/api/user", userRouter, loginRouter); // 注入用户路由模块
router.use("/api/app", appRouter);
router.use("/api/admin", adminRouter);
router.use('/api/role', roleRouter);

module.exports = router;
