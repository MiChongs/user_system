const express = require("express");
const appController = require('../controllers/appControllers');
const {body, check, query} = require("express-validator");
const {jwt, redisClient, adminPath} = require("../global");
const {expressjwt} = require("express-jwt");
const indexJwt = require("../middleware/indexJwt");
const appJwt = require("../middleware/appJwt");
const { userJwt } = require('../middleware/userJwt');
const { param } = require("express-validator");

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

router.get('/cards/:appid', [
    param('appid').optional().isInt().withMessage('应用ID必须是数字'),
    query('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
    query('status').optional().isBoolean().withMessage('状态必须是布尔值'),
    query('type').optional().isString().withMessage('类型必须是字符串'),
    query('search').optional().isString().withMessage('搜索关键词必须是字符串')
], appController.cards);

router.post('/card/delete', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("卡密是必须的"),], appController.deleteCard)

router.post('/user/delete', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("用户ID是必须的"),], appController.deleteUser)

router.post('/user/info', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("用户ID是必须的"),], appController.userInfo)

router.post('/banner/create', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("title").not().isEmpty().withMessage("广告标题是必须的"), body("content").not().isEmpty().withMessage("广告内容是必须的"), body("type").not().isEmpty().withMessage("广告类型是必须的"), body("header").not().isEmpty().withMessage("广告头部是必须的"), body("url").not().isEmpty().withMessage("广告链接是必须的"),], appController.addBanner)

router.post('/banner/list', [body("appid").not().isEmpty().withMessage("应用ID是必须的"),], appController.bannerList)

router.post('/banner/delete', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("广告ID是必须的"),], appController.deleteBanner)

router.post('/card/info', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("卡密ID是必须的"),], appController.cardInfo)

router.post('/user/searchUser', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("keyword").not().isEmpty().withMessage("关键字是必须的")], appController.searchUser)

router.post('/user/freezer', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("用户ID是必须的")], appController.freezer)

router.post('/user/unfreezer', [body("appid").not().isEmpty().withMessage("应用ID是必须的"), body("id").not().isEmpty().withMessage("用户ID是必须的")], appController.unFreezer)

/**
 * 心跳检测相关路由
 */

router.get('/online-stats', [
    body('appid').not().isEmpty().withMessage('应用ID是必须的')
], appController.getOnlineStats);

// 获取用户详细信息
router.post('/user/details', [
    body('userId').not().isEmpty().withMessage('用户ID是必须的'),
    body('appid').not().isEmpty().withMessage('应用ID是必须的')
], appController.getUserDetails);

// 删除用户设备
router.post('/user/device/delete', [
    body('userId').not().isEmpty().withMessage('用户ID是必须的'),
    body('appid').not().isEmpty().withMessage('应用ID是必须的'),
    body('markcode').not().isEmpty().withMessage('设备标识是必须的'),
    body('token').not().isEmpty().withMessage('设备token是必须的')
], appController.deleteUserDevice);

// Banner routes
router.post('/banner/update', [
    body().custom((value, { req }) => {
        if (Array.isArray(value)) {
            // 验证批量更新格式
            const isValid = value.every(item => 
                typeof item === 'object' &&
                Number.isInteger(item.id) &&
                Number.isInteger(item.position)
            );
            if (!isValid) {
                throw new Error('批量更新格式无效，每个项目必须包含id和position字段');
            }
        } else {
            // 验证单个banner更新格式
            if (!value.id) throw new Error('Banner ID是必须的');
            if (!value.appid) throw new Error('应用ID是必须的');
            if (!value.title) throw new Error('标题是必须的');
            if (!value.header) throw new Error('头部是必须的');
            if (!value.content) throw new Error('内容是必须的');
        }
        return true;
    })
], appController.updateBanner);

// 心跳检测和在线用户统计路由
// router.post('/heartbeat', appController.heartbeat);
// router.post('/offline', appController.userOffline);
// router.get('/online-stats', appController.getOnlineStats);

// 白名单管理路由
// 添加白名单
router.post('/whitelist', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('value').notEmpty().withMessage('白名单值不能为空'),
    body('type').isIn(['user', 'ip', 'device', 'email', 'phone']).withMessage('无效的白名单类型'),
    body('tags').optional().isArray().withMessage('标签必须是数组'),
    body('expireAt').optional().isISO8601().withMessage('无效的过期时间格式')
], appController.addToWhitelist);

// 删除白名单
router.delete('/whitelist/:id', appController.removeFromWhitelist);

// 更新白名单
router.put('/whitelist/:id', [
    body('tags').optional().isArray().withMessage('标签必须是数组'),
    body('enabled').optional().isBoolean().withMessage('enabled必须是布尔值'),
    body('expireAt').optional().isISO8601().withMessage('无效的过期时间格式')
], appController.updateWhitelist);

// 查询白名单列表
router.get('/whitelist', [
    check('appid').notEmpty().withMessage('应用ID不能为空'),
    check('type').optional().isIn(['user', 'ip', 'device', 'email', 'phone']).withMessage('无效的白名单类型'),
    check('page').optional().isInt({ min: 1 }).withMessage('页码必须是大于0的整数'),
    check('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间')
], appController.getWhitelist);

//更新用户密码 
router.post('/user/updatePassword', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('id').notEmpty().withMessage('用户ID不能为空'),
    body('password').notEmpty().withMessage('密码不能为空')
], appController.updatePassword);

// 公告相关路由
router.post('/notice/add', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('title').notEmpty().withMessage('公告标题不能为空'),
    body('content').notEmpty().withMessage('公告内容不能为空'),
    body('startDate').optional().isISO8601().withMessage('开始时间格式不正确'),
    body('endDate').optional().isISO8601().withMessage('结束时间格式不正确')
], appController.addNotice);

router.post('/notice/list', [
    check('appid').notEmpty().withMessage('应用ID不能为空')
], appController.getNotices);

router.post('/notice/delete', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('noticeId').notEmpty().withMessage('公告ID不能为空')
], appController.deleteNotice);

router.post('/notice/update', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('noticeId').notEmpty().withMessage('公告ID不能为空'),
    body('title').optional(),
    body('content').optional(),
    body('startDate').optional().isISO8601().withMessage('开始时间格式不正确'),
    body('endDate').optional().isISO8601().withMessage('结束时间格式不正确')
], appController.updateNotice);

// 临时用户统计路由
router.post('/temp-users/stats', [
    check('appid').notEmpty().withMessage('应用ID不能为空')
], appController.getTempUserStats);

// 获取临时用户列表
router.post('/temp-users/list', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
    body('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
    body('timeRange').optional().matches(/^[0-9]+d$/).withMessage('时间范围格式错误'),
    body('loginType').optional().isIn(['qq', 'wechat', 'account']).withMessage('登录类型无效'),
    body('region').optional().isString().withMessage('地区格式错误')
], appController.getTempUserList);

// 获取登录类型统计
router.post('/login-type/stats', [
    body('appid').notEmpty().withMessage('应用ID不能为空')
], appController.getLoginTypeStats);

// 获取用户绑定统计
router.post('/binding/stats', [
    body('appid').notEmpty().withMessage('应用ID不能为空')
], appController.getBindingStats);

// 开屏页面相关路由
router.post('/splash/list', [
    body('appid').notEmpty().withMessage('应用ID不能为空')
], appController.getSplashList);

router.post('/splash/create', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('title').notEmpty().withMessage('标题不能为空'),
    body('background').notEmpty().withMessage('背景图不能为空'),
    body('startDate').notEmpty().withMessage('开始时间不能为空')
        .isISO8601().withMessage('开始时间格式不正确'),
    body('endDate').notEmpty().withMessage('结束时间不能为空')
        .isISO8601().withMessage('结束时间格式不正确'),
    body('skip').optional().isBoolean().withMessage('skip必须是布尔值'),
    body('time').optional().isInt({ min: 1000 }).withMessage('显示时长必须大于1秒')
], appController.createSplash);

router.post('/splash/update', [
    body('id').notEmpty().withMessage('开屏页面ID不能为空'),
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('title').optional(),
    body('background').optional(),
    body('startDate').optional().isISO8601().withMessage('开始时间格式不正确'),
    body('endDate').optional().isISO8601().withMessage('结束时间格式不正确'),
    body('skip').optional().isBoolean().withMessage('skip必须是布尔值'),
    body('time').optional().isInt({ min: 1000 }).withMessage('显示时长必须大于1秒')
], appController.updateSplash);

router.post('/splash/delete', [
    body('id').notEmpty().withMessage('开屏页面ID不能为空'),
    body('appid').notEmpty().withMessage('应用ID不能为空')
], appController.deleteSplash);

// 获取用户地区统计
router.post('/user/region-stats', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('type').optional().isIn(['province', 'city']).withMessage('统计类型无效'),
    body('keyword').optional().isString().withMessage('关键词必须是字符串'),
    body('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
    body('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
    body('includeUsers').optional().isBoolean().withMessage('includeUsers必须是布尔值')
], appController.getUserRegionStats);

// 获取用户注册时间统计
router.post('/user/register-stats', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('timeRange').optional().isIn(['today', 'week', 'month', 'threeMonths', 'sixMonths', 'year']).withMessage('时间范围无效'),
    body('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
    body('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
    body('includeUsers').optional().isBoolean().withMessage('includeUsers必须是布尔值')
], appController.getUserRegisterStats);

// 任务管理路由
router.post('/tasks/create', [
    body('name').notEmpty().withMessage('任务名称不能为空'),
    body('action').notEmpty().withMessage('任务动作不能为空'),
    body('rewardType').isIn(['integral', 'membership']).withMessage('无效的奖励类型'),
    body('rewardAmount').isInt({ gt: 0 }).withMessage('奖励数量必须为正整数'),
    body('rewardUnit').optional().isIn(['minutes', 'hours', 'days', 'months', 'years', 'permanent'])
        .withMessage('无效的时间单位'),
    body('schedule').optional().isString().withMessage('无效的调度时间表达式'),
    body('executionDate').optional().isISO8601().withMessage('无效的执行日期格式'),
    body('conditions').optional().isObject().withMessage('无效的条件格式')
], appController.createTask);

router.put('/tasks/update/:id', appController.updateTask);
router.delete('/tasks/delete/:id', appController.deleteTask);

// 抽奖路由
router.post('/lottery/draw', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('count').isInt({ min: 1, max: 100 }).withMessage('抽奖人数必须在1-100之间'),
    body('rewardType').isIn(['integral', 'membership']).withMessage('无效的奖励类型'),
    body('rewardAmount').isInt({ gt: 0 }).withMessage('奖励数量必须为正整数'),
    body('rewardUnit')
        .optional()
        .isIn(['minutes', 'hours', 'days', 'months', 'years', 'permanent'])
        .withMessage('无效的时间单位')
        .custom((value, { req }) => {
            if (req.body.rewardType === 'membership' && !value) {
                throw new Error('会员奖励必须指定时间单位');
            }
            return true;
        }),
    body('conditions').optional().isObject().withMessage('无效的条件格式'),
    body('isJoinLottery').isBoolean().withMessage('满足条件是否参与抽奖是必须的'),
], appController.drawLottery);

// 用户查询路由
router.post('/users/search', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
    body('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
    body('queryType').isIn(['register', 'checkin', 'membership']).withMessage('无效的查询类型'),
    body('startTime').optional().isISO8601().withMessage('开始时间格式无效'),
    body('endTime').optional().isISO8601().withMessage('结束时间格式无效')
        .custom((value, { req }) => {
            if (value && req.body.startTime && new Date(value) <= new Date(req.body.startTime)) {
                throw new Error('结束时间必须晚于开始时间');
            }
            return true;
        }),
    body('membershipStatus').optional()
        .isArray().withMessage('会员状态必须是数组')
        .custom((value) => {
            const validStatus = ['active', 'expired', 'permanent'];
            return value.every(status => validStatus.includes(status));
        }).withMessage('包含无效的会员状态'),
    body('excludeConditions').optional().isObject().withMessage('排除条件必须是对象')
], appController.searchUsers);

// 创建定时抽奖任务
router.post('/lottery/create', [
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('name').notEmpty().withMessage('抽奖活动名称不能为空'),
    body('count').isInt({ min: 1, max: 100 }).withMessage('中奖人数必须在1-100之间'),
    body('rewardType').isIn(['integral', 'membership']).withMessage('无效的奖励类型'),
    body('rewardAmount').isInt({ gt: 0 }).withMessage('奖励数量必须为正整数'),
    body('drawTime').isISO8601().withMessage('开奖时间格式无效')
        .custom(value => {
            if (new Date(value) <= new Date()) {
                throw new Error('开奖时间必须在当前时间之后');
            }
            return true;
        }),
    body('rewardUnit')
        .optional()
        .isIn(['minutes', 'hours', 'days', 'months', 'years', 'permanent'])
        .custom((value, { req }) => {
            if (req.body.rewardType === 'membership' && !value) {
                throw new Error('会员奖励必须指定时间单位');
            }
            return true;
        }),
    body('conditions').optional().isObject()
        .custom((value) => {
            // 验证参与条件格式
            if (value.registerTime && !Date.parse(value.registerTime)) {
                throw new Error('注册时间格式无效');
            }
            if (value.minIntegral !== undefined && !Number.isInteger(value.minIntegral)) {
                throw new Error('最小积分必须是整数');
            }
            if (value.maxIntegral !== undefined && !Number.isInteger(value.maxIntegral)) {
                throw new Error('最大积分必须是整数');
            }
            return true;
        }),
    body('excludeConditions').optional().isObject()
        .custom((value) => {
            // 验证排除条件格式
            if (value.registerTime) {
                if (!Date.parse(value.registerTime.start) || !Date.parse(value.registerTime.end)) {
                    throw new Error('注册时间范围格式无效');
                }
            }
            if (value.integral) {
                if (!Number.isInteger(value.integral.min) || !Number.isInteger(value.integral.max)) {
                    throw new Error('积分范围必须是整数');
                }
            }
            return true;
        })
], appController.createLottery);

// 获取抽奖任务列表
router.get('/lottery/list', [
    query('appid').notEmpty().withMessage('应用ID不能为空'),
    query('status').optional().isIn(['pending', 'completed', 'cancelled']),
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 100 })
], appController.getLotteryList);

// 获取抽奖结果
router.get('/lottery/result/:lotteryId', [
    param('lotteryId').notEmpty().withMessage('抽奖ID不能为空')
        .matches(/^LT[a-f0-9]{16}$/).withMessage('无效的抽奖ID格式'),
    query('appid').notEmpty().withMessage('应用ID不能为空')
], appController.getLotteryResult);

// 取消抽奖任务
router.post('/lottery/cancel/:lotteryId', [
    param('lotteryId').notEmpty().withMessage('抽奖ID不能为空')
        .matches(/^LT[a-f0-9]{16}$/).withMessage('无效的抽奖ID格式'),
    body('appid').notEmpty().withMessage('应用ID不能为空'),
    body('reason').optional().isString().withMessage('取消原因必须是字符串')
], appController.cancelLottery);

// 获取抽奖统计信息
router.get('/lottery/stats', [
    query('appid').notEmpty().withMessage('应用ID不能为空'),
    query('startTime').optional().isISO8601().withMessage('开始时间格式无效'),
    query('endTime').optional().isISO8601().withMessage('结束时间格式无效')
        .custom((value, { req }) => {
            if (value && req.query.startTime && new Date(value) <= new Date(req.query.startTime)) {
                throw new Error('结束时间必须晚于开始时间');
            }
            return true;
        })
], appController.getLotteryStats);

// 获取抽奖参与名单
router.get('/lottery/participants/:lotteryId', [
    param('lotteryId').notEmpty().withMessage('抽奖ID不能为空')
        .matches(/^LT[a-f0-9]{16}$/).withMessage('无效的抽奖ID格式'),
    query('appid').notEmpty().withMessage('应用ID不能为空'),
    query('page').optional().isInt({ min: 1 }).withMessage('页码必须大于0'),
    query('pageSize').optional().isInt({ min: 1, max: 500 }).withMessage('每页数量必须在1-500之间')
], appController.getLotteryParticipants);

module.exports = router;
