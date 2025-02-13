const express = require("express")
const adminController = require('../controllers/adminController')
const {body, check, validationResult} = require("express-validator")
const {expressjwt} = require("express-jwt");
const {redisClient, adminPath} = require("../global");
const indexJwt = require("../middleware/indexJwt");

const router = express.Router(); //模块化路由

router.use(indexJwt)
router.post("/login", [body("account").not().isEmpty().withMessage("账号参数不能为空"), body("password").not().isEmpty().withMessage("密码参数不能为空"), body("markcode").optional().trim().not().isEmpty().withMessage("设备码参数不能为空"),], adminController.login);

// 注册路由
router.post('/register', [
    body('account').notEmpty().withMessage('账号不能为空')
        .isLength({ min: 4 }).withMessage('账号至少需要4个字符'),
    body('password').notEmpty().withMessage('密码不能为空')
        .isLength({ min: 6 }).withMessage('密码至少需要6个字符'),
    body('name').notEmpty().withMessage('昵称不能为空'),
    body('email').isEmail().withMessage('邮箱格式不正确'),
    body('captchaId').notEmpty().withMessage('验证码ID不能为空'),
    body('captchaCode').notEmpty().withMessage('图片验证码不能为空'),
    body('emailCode').notEmpty().withMessage('邮箱验证码不能为空'),
    body('registerCode').notEmpty().withMessage('注册码不能为空')
], adminController.register);

router.post("/sendMail", [body("account").optional().trim().not().isEmpty().withMessage("账号是必须的"), body("token").optional().trim().not().isEmpty().withMessage("token是必须的").bail().isJWT(), body("email").optional().trim().not().isEmpty().withMessage("邮箱是必须的").bail().isEmail(),], adminController.sendMail);

router.post("/logout", adminController.logout)

//router.get("/:code", adminController.resetPassword);

router.post('/info',adminController.myInfo)

router.put('/update-info', adminController.updateAdminInfo);

// 管理员统计信息路由
router.get('/stats', adminController.getAdminStats);

// 系统信息路由
router.get('/system', adminController.getSystemInfo);

// 管理员仪表盘路由（合并系统信息和统计信息）
router.get('/dashboard', adminController.getAdminDashboard);

// 生成图片验证码
router.get('/captcha', (req, res) => {
    try {
        const { generateImageCaptcha } = require('../function/verificationService');
        const captcha = generateImageCaptcha();
        res.json({
            code: 200,
            data: captcha
        });
    } catch (error) {
        res.json({
            code: 500,
            message: error.message
        });
    }
});

// 发送邮箱验证码
router.post('/email-code', [
    body('email').isEmail().withMessage('邮箱格式不正确')
], adminController.sendEmailCode);

// Validation rules for updating admin password
const updatePasswordValidation = [
    check('oldPassword').notEmpty().withMessage('旧密码不能为空'),
    check('newPassword').isLength({ min: 6 }).withMessage('新密码至少需要6个字符')
];

// Route for updating admin password
router.put('/update-password', updatePasswordValidation, adminController.updatePassword);

module.exports = router;
