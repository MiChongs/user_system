const express = require("express")
const adminController = require('../controllers/adminController')
const {body, check} = require("express-validator")
const {expressjwt} = require("express-jwt");
const {redisClient, adminPath} = require("../global");
const indexJwt = require("../middleware/indexJwt");

const router = express.Router(); //模块化路由

router.use(indexJwt)
router.post("/login", [body("account").not().isEmpty().withMessage("账号参数不能为空"), body("password").not().isEmpty().withMessage("密码参数不能为空"), body("markcode").optional().trim().not().isEmpty().withMessage("设备码参数不能为空"),], adminController.login);

router.post("/register", [body("account").not().isEmpty().withMessage("账号参数不能为空"), body("password").not().isEmpty().withMessage("密码参数不能为空"), body("name").not().isEmpty().withMessage("昵称是必须的"),], adminController.register);

router.post("/sendMail", [body("account").optional().trim().not().isEmpty().withMessage("账号是必须的"), body("token").optional().trim().not().isEmpty().withMessage("token是必须的").bail().isJWT(), body("email").optional().trim().not().isEmpty().withMessage("邮箱是必须的").bail().isEmail(),], adminController.sendMail);

router.post("/logout", adminController.logout)

router.get("/:code", adminController.resetPassword);

module.exports = router;
