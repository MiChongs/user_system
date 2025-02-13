const express = require("express");
const userController = require("../controllers/userController");
const {body, check, validationResult, param, query} = require("express-validator");
const userRouter = express.Router();
const globals = require("../global/index");
const {expressjwt} = require("express-jwt");
const checkWhitelist = require('../function/checkWhiteList');
const {App} = require("../models/app");
const userJwt = require("../middleware/userJwt");
const sanitizeInput = require("../middleware/sanitizeInput");

const normalBodyValidator = [body('appid').notEmpty().withMessage("隶属于应用id不得为空").isInt().withMessage("应用id不符合要求"), body('account').notEmpty().withMessage("账号不得为空").isAscii().withMessage("账号不符合要求"), body('username').notEmpty().withMessage("用户名不得为空"), body('markcode').notEmpty().withMessage("设备码不得为空"), body('password').notEmpty().withMessage("密码不得为空").isLength({
    min: 8, max: 24
}).withMessage("密码最少8位，最多24位")]

userRouter.use(async (req, res, next) => {
    // 例如，对 /test 的 GET 请求将打印 GET /test
    const app = await App.findByPk(req.body.appid || req.query.appid)
    if (!app) {
        return res.json({
            code: "404",
            message: "未找到应用"
        })
    }
    if (app.encrypt && !req.body.data) {
        return res.json({
            code: "404",
            message: "应用已开启加密，请更新新版尝试解决"
        })
    }
    console.log(`${req.method} ${req.url}`)
    next()
})

userRouter.use(userJwt)
const userBodyValidator = [body('appid').notEmpty().withMessage("隶属于应用id不得为空").isInt().withMessage("应用id不符合要求"), body('markcode').notEmpty().withMessage("设备码不得为空"),]

userRouter.post("/register", [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('account').notEmpty().withMessage('账号不能为空'),
    body('password').notEmpty().withMessage('密码不能为空')
], userController.register);
userRouter.post("/devices", [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.devices);
userRouter.post("/daily", userController.daily);
userRouter.post("/card/use", [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), body('card_code').not().notEmpty().withMessage('卡密 不得为空')], userController.useCard);
userRouter.delete('/logout', userBodyValidator, userController.logout)
userRouter.delete('/logoutDevice', [body('appid').notEmpty().withMessage("隶属于应用id不得为空").isInt().withMessage("应用id不符合要求"), body('markcode').notEmpty().withMessage("设备码不得为空"), body('token').not().notEmpty().withMessage('Token 不得为空')], userController.deleteDevice)
userRouter.post('/my', [body('appid').notEmpty().withMessage("隶属于应用id不得为空").isInt().withMessage("应用id不符合要求"), body('markcode').notEmpty().withMessage("设备码不得为空")], userController.my)
userRouter.post('/uploadAvatar', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.uploadAvatar)
userRouter.post('/sendMail', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), body('token').not().notEmpty().withMessage('Token 不得为空'), body('email').not().notEmpty().withMessage('邮箱不得为空'), body('mail_type').not().notEmpty().withMessage('邮件类型不得为空')], userController.sendMail)
userRouter.post('/forgotPassword', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), body('token').not().notEmpty().withMessage('Token 不得为空'), body('email').not().notEmpty().withMessage('邮箱不得为空'), body('verify_code').not().notEmpty().withMessage('验证码不得为空'), body('new_password').not().notEmpty().withMessage('新密码不得为空').isLength({
    min: 8, max: 24
}).withMessage("密码最少8位，最多24位")], userController.forgotPassword)
userRouter.get('/', function (req, res) {
    res.boom.serverUnavailable('未知服务路由')
})
userRouter.post('/captcha', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.getCaptcha)
userRouter.post('/dailyRank', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.dailyRank)
userRouter.post('/integralRank', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.integralRank)
userRouter.post('/verifyVip', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.verifyVip)
userRouter.get('/', function (req, res) {

})

userRouter.get('/banner', [check('appid').notEmpty().withMessage("隶属于应用ID不能为空")], userController.banner)

userRouter.put('/set-up-user', [check('appid').notEmpty().withMessage('隶属于应用id不得为空'), check('account').isLength({
    min: 5, max: 18
}).withMessage("账号最少5位，最多18位").isAlphanumeric().withMessage('账号只能包含字母和数字'), check('password').isAlphanumeric().withMessage('密码只能包含字母和数字').isLength({
    min: 8, max: 24
}).withMessage('密码最少8位，最多24位')], userController.setUpdateUser)

userRouter.post('/update-custom-id', [body('appid').notEmpty().withMessage('隶属于应用id不得为空'), body('customId')
    .notEmpty().withMessage('自定义id不得为空')
    .isLength({min: 5, max: 11}).withMessage('自定义ID长度必须在5到11位之间')
    .isAlphanumeric().withMessage('自定义ID只能包含字母和数字')], userController.updateCustomId)

userRouter.post('/search-user', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), body('keyword').not().notEmpty().withMessage('搜索关键词不得为空')], userController.searchUser)

userRouter.post('/analyze', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('link').notEmpty().withMessage('链接不能为空')], userController.analyzer)

userRouter.post('/search-site', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), body('keyword').not().notEmpty().withMessage('搜索关键词不得为空')], userController.searchSite)

userRouter.post('/create-site', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), body('name').not().notEmpty().withMessage('网站名称不得为空'), body('url').not().notEmpty().withMessage('网站链接不得为空'), body('description').not().notEmpty().withMessage('网站描述不得为空'), body('type').not().notEmpty().withMessage('网站类型不得为空')], userController.createSite)

userRouter.get('/site-list', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.siteList)

userRouter.delete('/delete-site', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('id').not().notEmpty().withMessage('网站ID不得为空').isNumeric().withMessage('网站ID须为数字')], userController.deleteSite)

userRouter.put('/update-site', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('id').not().notEmpty().withMessage('网站ID不得为空').isNumeric().withMessage('网站ID须为数字')], userController.updateSite)

userRouter.get('/site-detail', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('id').not().notEmpty().withMessage('网站ID不得为空')], userController.getSiteById)

userRouter.post('/my-site', [body('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.mySites)

userRouter.get('/check-version', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('versionCode').not().notEmpty().withMessage('版本号不得为空')], userController.checkVersion)

userRouter.post('/devices-by-password', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('account').not().notEmpty().withMessage("账号不能为空"), check('password').not().notEmpty().withMessage('密码不得为空')], userController.devicesByPassword)

userRouter.delete('/logout-device-by-password', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('account').not().notEmpty().withMessage("账号不能为空"), check('password').not().notEmpty().withMessage('密码不得为空'), check('token').not().notEmpty().withMessage('用户授权码不能为空')], userController.logoutDeviceByPassword)

userRouter.post('/modify-password', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('oldPassword').not().notEmpty().withMessage('密码不得为空'), check('newPassword').not().notEmpty().withMessage('新密码不得为空')], userController.modifyPassword)

userRouter.post('/modify-username', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('name').not().notEmpty().withMessage('昵称不得为空')], userController.modifyName)

userRouter.post('/goods-list', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.getGoods)

userRouter.post('/exchange-goods', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('goodsId').not().notEmpty().withMessage('商品ID不得为空')], userController.order)

userRouter.post('/bonus-integral', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('account').not().notEmpty().withMessage('目标账号不能为空'), check('integral').not().notEmpty().withMessage('积分不能为空').isNumeric().withMessage('积分必须为数字')], userController.bonusIntegral)

userRouter.post('/account-info', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('account').not().notEmpty().withMessage('目标账号不能为空')], userController.accountInfoByCustomId)

userRouter.get('/ban-list', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.banList)
userRouter.post('/ban-list', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.banList)

userRouter.post('/notice', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.notice)

userRouter.post('/splash', [
    body('appid').notEmpty().withMessage('应用ID不能为空')
], userController.getActiveSplash);

userRouter.get('/splash', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.splash)

userRouter.get('/notice', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], userController.notice)

userRouter.get('/online-status', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('userId').notEmpty().withMessage('用户ID不能为空')
], userJwt, userController.getUserOnlineStatus);

userRouter.get('/app-online-users', [
    body('appid').notEmpty().withMessage('应用ID不能为空')
], userJwt, userController.getAppOnlineUsers);

userRouter.post('/set-online-status', [
    check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'),
    check('targetUserId').not().notEmpty().withMessage('目标用户ID不能为空'),
    check('status').isIn(['online', 'offline']).withMessage('状态必须为online或offline')
], userController.setUserOnlineStatus);

userRouter.get('/get_qq_info', [
    check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'),
    check('qq').not().notEmpty().withMessage('QQ号不能为空'),
    check('qq').isNumeric().withMessage('QQ号必须为数字')
], userController.getQQInfo);

// 快递查询
userRouter.get('/query-express', [
    check('appid').notEmpty().withMessage('隶属于应用id不得为空'),
    check('dh').notEmpty().withMessage('快递单号不能为空')
        .isString().withMessage('快递单号格式错误')
], userController.queryExpress);

// 音乐解析接口
userRouter.get('/parse-music', [
    check('appid').notEmpty().withMessage('隶属于应用id不得为空'),
    check('url').notEmpty().withMessage('音乐链接不能为空')
        .matches(/^https?:\/\/(y\.)?qq\.com/)
        .withMessage('请输入有效的QQ音乐链接'),
    check('quality').optional().isString()
        .withMessage('音质参数格式错误')
], userController.parseMusicUrl);

// 获取音乐支持的音质列表
userRouter.get('/music-qualities', [
    check('appid').notEmpty().withMessage('隶属于应用id不得为空'),
    check('url').notEmpty().withMessage('音乐链接不能为空')
        .matches(/^https?:\/\/(y\.)?qq\.com/)
        .withMessage('请输入有效的QQ音乐链接')
], userController.getMusicQualities);

// 下载QQ音乐
userRouter.get('/download-music', [
    check('appid').notEmpty().withMessage('隶属于应用id不得为空'),
    check('url').notEmpty().withMessage('音乐链接不能为空')
        .matches(/^https?:\/\/(y\.)?qq\.com/)
        .withMessage('请输入有效的QQ音乐链接'),
    check('quality').optional().isString()
        .withMessage('音质参数格式错误')
], userController.downloadMusic);

userRouter.use(sanitizeInput);

// Socket.IO 用户状态路由
const {socketUserStatus} = require("../controllers/userController");
/**
 * 用户在线状态相关路由
 */

// 心跳检测
userRouter.post('/heartbeat', [
    body('appid').notEmpty().withMessage('应用ID不能为空')
], userJwt, userController.heartbeat);
// 获取在线用户统计

// 获取用户在线状态
userRouter.get('/online-status', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('userId').notEmpty().withMessage('用户ID不能为空')
], userJwt, userController.getUserOnlineStatus);

// 获取应用在线用户列表
userRouter.get('/online-users/:appid', userJwt, userController.getAppOnlineUsers);

// 获取抽奖结果
userRouter.get('/lottery/result/:lotteryId', [
    param('lotteryId').notEmpty().withMessage('抽奖ID不能为空')
        .matches(/^LT[a-f0-9]{16}$/).withMessage('无效的抽奖ID格式'),
    query('appid').notEmpty().withMessage('应用ID不能为空')
], userController.getLotteryResult);

// 获取指定抽奖结果
userRouter.get('/lottery/result/id/:lotteryId', [
    param('lotteryId').notEmpty().withMessage('抽奖ID不能为空')
        .matches(/^LT[a-f0-9]{16}$/).withMessage('无效的抽奖ID格式'),
    query('appid').notEmpty().withMessage('应用ID不能为空')
], userJwt, userController.getLotteryResultById);

// 发送邮箱验证码
userRouter.post('/email/send-code', [
    body('email').isEmail().withMessage('邮箱格式不正确'),
    body('appid').notEmpty().withMessage('应用ID不能为空')
], userJwt, userController.sendEmailVerificationCode);

// 绑定邮箱
userRouter.post('/email/bind', [
    body('email').isEmail().withMessage('邮箱格式不正确'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('验证码格式不正确'),
    body('appid').notEmpty().withMessage('应用ID不能为空')
], userJwt, userController.bindEmail);

exports.userRouter = userRouter