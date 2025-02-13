const svgCaptcha = require('svg-captcha');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const { sendVerificationCode } = require('./mailService');
const { redisClient } = require("../global");

// 配置常量
const CONFIG = {
    CAPTCHA_LENGTH: 4,           // 验证码长度
    CAPTCHA_WIDTH: 150,          // 验证码图片宽度
    CAPTCHA_HEIGHT: 50,          // 验证码图片高度
    CAPTCHA_FONT_SIZE: 50,       // 验证码字体大小
    CAPTCHA_NOISE: 2,            // 验证码干扰线
    CAPTCHA_EXPIRE: 300,         // 验证码过期时间（秒）
    EMAIL_CODE_LENGTH: 6,        // 邮箱验证码长度
    EMAIL_CODE_EXPIRE: 600,      // 邮箱验证码过期时间（秒）
    EMAIL_RESEND_WAIT: 60,       // 邮箱验证码重发等待时间（秒）
};

const CAPTCHA_PREFIX = 'imageCaptcha:';
const EMAIL_PREFIX = 'emailCode:';

// 生成图形验证码
exports.generateImageCaptcha = () => {
    const captcha = svgCaptcha.create({
        size: CONFIG.CAPTCHA_LENGTH,
        ignoreChars: '0o1iIl',  // 排除容易混淆的字符
        noise: CONFIG.CAPTCHA_NOISE,
        color: false,
        background: '#f0f0f0',
        width: CONFIG.CAPTCHA_WIDTH,
        height: CONFIG.CAPTCHA_HEIGHT,
        fontSize: CONFIG.CAPTCHA_FONT_SIZE
    });

    const captchaId = uuidv4();
    console.log('生成验证码:', { captchaId, text: captcha.text.toLowerCase() });
    
    // 将验证码存入Redis，设置过期时间
    redisClient.set(CAPTCHA_PREFIX + captchaId, captcha.text.toLowerCase(), 'EX', CONFIG.CAPTCHA_EXPIRE);
    
    return {
        captchaId,
        svg: captcha.data
    };
};

// 验证图形验证码
exports.verifyImageCaptcha = async (captchaId, userInput) => {
    console.log('验证码验证:', { captchaId, userInput });
    
    if (!captchaId || !userInput) {
        console.log('验证码参数无效');
        return false;
    }

    const key = CAPTCHA_PREFIX + captchaId;
    const storedCaptcha = await redisClient.get(key);
    console.log('Redis中的验证码:', { key, storedCaptcha });
    
    if (!storedCaptcha) {
        console.log('验证码不存在或已过期');
        return false;
    }

    // 验证码不区分大小写
    const isValid = storedCaptcha === userInput.toLowerCase();
    console.log('验证结果:', { isValid, storedCaptcha, userInput: userInput.toLowerCase() });
    
    // 无论验证是否成功，都删除已使用的验证码
    await redisClient.del(key);
    
    return isValid;
};

// 生成并发送邮箱验证码
exports.generateEmailCode = async (email, app) => {
    if (!email) {
        throw new Error('邮箱地址不能为空');
    }

    const key = EMAIL_PREFIX + email;
    
    // 检查是否存在未过期的验证码
    const existingCode = await redisClient.get(key);
    if (existingCode) {
        const ttl = await redisClient.ttl(key);
        if (ttl > CONFIG.EMAIL_CODE_EXPIRE - CONFIG.EMAIL_RESEND_WAIT) {
            throw new Error(`请等待${CONFIG.EMAIL_RESEND_WAIT}秒后再次获取验证码`);
        }
    }

    // 生成指定长度的数字验证码
    const code = Array.from(
        { length: CONFIG.EMAIL_CODE_LENGTH },
        () => Math.floor(Math.random() * 10)
    ).join('');
    
    // 存储验证码，设置过期时间
    await redisClient.set(key, code, 'EX', CONFIG.EMAIL_CODE_EXPIRE);
    
    // 发送验证码邮件
    await sendVerificationCode(app, email, code);
    
    return true;
};

// 验证邮箱验证码
exports.verifyEmailCode = async (email, code) => {
    if (!email || !code) {
        return false;
    }

    const key = EMAIL_PREFIX + email;
    const storedCode = await redisClient.get(key);
    
    if (!storedCode) {
        return false;
    }
    
    const isValid = storedCode === code;
    
    // 验证成功后删除验证码
    if (isValid) {
        await redisClient.del(key);
    }
    
    return isValid;
};
