const express = require("express");
const appController = require('../controllers/appControllers');
const {body} = require("express-validator");
const {jwt, redisClient, adminPath} = require("../global");
const {expressjwt} = require("express-jwt");
const indexJwt = require("../middleware/indexJwt");
const appJwt = require("../middleware/appJwt");

const router = express.Router(); //模块化路由
router.use(appJwt)
router.post("/create", [body("name").not().isEmpty().withMessage("应用名称是必须的"), body("id").not().isEmpty().withMessage("应用ID是必须的"),], appController.create);

router.delete("/delete", [body("appid").not().isEmpty().withMessage("应用ID是必须的"),], appController.deleteApp);

router.post("/config", [body('appid').not().isEmpty().withMessage("应用ID是必须的"),], appController.appConfig)

router.post("/updateConfig", [body('appid').not().isEmpty().withMessage("应用ID是必须的"),], appController.updateAppConfig)

router.post('/user/list', [body('appid').not().isEmpty().withMessage("应用ID是必须的")], appController.userList)

router.post("/list", appController.apps);

router.post('/notification/create', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("title").not().isEmpty().withMessage("通知标题是必须的"), body("content").not().isEmpty().withMessage("通知内容是必须的"),], appController.createNotification)

router.post('/notification/list', [body("appid").not().isEmpty().withMessage("应用ID是必须的"),], appController.notifications)

router.post('/user/update', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("用户账号是必须的"),], appController.updateUser)

router.post('/card/generate', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("num").not().isEmpty().withMessage("卡密数量是必须的"), body("length").not().isEmpty().withMessage("卡密长度是必须的"), body("card_type").not().isEmpty().withMessage("卡密类型是必须的"), body("card_award_num").not().isEmpty().withMessage("卡密奖励数量是必须的"), body("card_code_expire").not().isEmpty().withMessage("卡密到期时间是必须的"), body("card_memo").not().isEmpty().withMessage("卡密备注是必须的"),], appController.generateCard)

router.post('/card/list', [body("appid").not().isEmpty().withMessage("应用ID是必须的"),], appController.cards)

router.post('/card/delete', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("卡密是必须的"),], appController.deleteCard)

router.post('/user/delete', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("用户ID是必须的"),], appController.deleteUser)

router.post('/user/info', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("用户ID是必须的"),], appController.userInfo)

router.post('/banner/create', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("title").not().isEmpty().withMessage("广告标题是必须的"), body("content").not().isEmpty().withMessage("广告内容是必须的"), body("type").not().isEmpty().withMessage("广告类型是必须的"), body("header").not().isEmpty().withMessage("广告头部是必须的"),body("url").not().isEmpty().withMessage("广告链接是必须的"),], appController.addBanner)

router.post('/banner/list', [body("appid").not().isEmpty().withMessage("应用ID是必须的"),], appController.bannerList)

router.post('/banner/delete', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("广告ID是必须的"),], appController.deleteBanner)

router.post('/card/info', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("卡密ID是必须的"),], appController.cardInfo)

module.exports = router;
