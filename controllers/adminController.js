// 核心模块
const path = require('path');
const fs = require('fs');
const os = require('os');

// 第三方依赖
require('../function/dayjs');
const dayjs = require('dayjs');
const { validationResult, body } = require('express-validator');
const { hashSync, compareSync, hash} = require('bcrypt');
const svgCaptcha = require('svg-captcha');
const RedisService = require('../function/redisService');
const mailService = require('../function/mailService');
const RandomService = require('../function/randomService');
const { verifyImageCaptcha, verifyEmailCode, generateEmailCode } = require('../function/verificationService');

// 全局配置和工具
const {
    jwt,
    lookupAllGeoInfo,
    isEmptyStr,
    nodemailer,
    redisClient,
    randomPass,
    validUrl,
    getToken,
    createAdminLog
} = require('../global');

// 数据库模型
const { where, Op } = require('sequelize');
const { Admin } = require('../models/admin');
const { AdminRegistrationCode } = require('../models/adminRegistrationCode');
const { AdminToken } = require('../models/adminToken');
const { Banner } = require('../models/banner');
const { App } = require('../models/app');
const { User } = require('../models/user');
const { Token } = require('../models/token');

// 注册验证规则
const registerValidation = [
    body('account').notEmpty().withMessage('账号不能为空')
        .isLength({ min: 3, max: 20 }).withMessage('账号长度应在3-20个字符之间'),
    body('password').notEmpty().withMessage('密码不能为空')
        .isLength({ min: 6, max: 20 }).withMessage('密码长度应在6-20个字符之间'),
    body('email').notEmpty().withMessage('邮箱不能为空')
        .isEmail().withMessage('请输入有效的邮箱地址'),
    body('code').notEmpty().withMessage('注册码不能为空'),
    body('captchaId').notEmpty().withMessage('图形验证码ID不能为空'),
    body('captcha').notEmpty().withMessage('图形验证码不能为空'),
    body('emailCode').notEmpty().withMessage('邮箱验证码不能为空')
];

exports.accountInfo = (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400, message: msg,
        });
    } else {
        Admin.findOne({
            where: {
                account: req.body.account,
            }
        }).then(admin => {
            if (admin) {
                res.status(200).json({
                    code: 200, message: '获取账号信息成功', data: {
                        name: admin.username, email: admin.email, avatar: admin.avatar,
                    }
                });
            } else {
                res.status(404).json({
                    code: 404, message: '账号不存在',
                });
            }
        })
    }
}

exports.myInfo = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(404).json({
            code: 404, message: msg,
        });
    } else {
        try {
            const token = await AdminToken.findOne({
                where: {
                    token: getToken(req.headers.authorization)
                }
            })

            if (!token) {
                return res.json({
                    code: 404,
                    message: "Token 错误"
                })
            }

            const admin = await Admin.findOne({
                where: {
                    account: token.account
                }
            })

            if (!admin) {
                return res.json({
                    code: 404,
                    message: "账号不存在"
                })
            }

            return res.json({
                code: 200,
                message: "获取账号信息成功",
                data: admin
            })


        } catch (e) {
            return res.json({
                code: 404,
                message: "服务器错误"
            })
        }
    }
}

exports.logout = async (req, res) => {
    try {
        const token = getToken(req.headers.authorization);
        if (!token) {
            return res.json({
                code: 401,
                message: "未提供有效的token"
            });
        }

        // 查找token记录
        const adminToken = await AdminToken.findOne({
            where: { token }
        });

        if (!adminToken) {
            return res.json({
                code: 404,
                message: "登录状态不存在"
            });
        }

        try {
            // 删除Redis缓存
            await redisClient.del(`admin_token:${token}`);
            // 从在线管理员列表移除
            await redisClient.srem('online_admins', adminToken.account);
        } catch (error) {
            console.error('Redis delete error:', error);
        }

        // 删除数据库记录
        await adminToken.destroy();

        // 记录登出日志
        await createAdminLog('admin_logout', req, res, {
            account: adminToken.account,
            ip: req.clientIp,
            device: req.headers['user-agent']
        });

        return res.json({
            code: 200,
            message: "退出登录成功"
        });

    } catch (error) {
        console.error('管理员登出失败:', error);
        return res.status(500).json({
            code: 500,
            message: '登出失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 管理员注册
 */
exports.register = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors;
        return res.json({
            code: 400,
            message: msg
        });
    }

    const transaction = await mysql.transaction();

    try {
        const { 
            account, 
            password, 
            name, 
            email,
            captchaId,
            captchaCode,
            emailCode,
            registerCode 
        } = req.body;

        // 验证图片验证码
        const isValidCaptcha = await verifyImageCaptcha(captchaId, captchaCode);
        if (!isValidCaptcha) {
            throw new Error("图片验证码错误或已过期");
        }

        // 验证邮箱验证码
        const isValidEmailCode = await verifyEmailCode(email, emailCode);
        if (!isValidEmailCode) {
            throw new Error("邮箱验证码错误或已过期");
        }

        // 验证注册码
        const regCode = await AdminRegistrationCode.findOne({
            where: {
                code: registerCode,
                usedTime: null
            },
            transaction
        });

        if (!regCode) {
            throw new Error("注册码无效或已被使用");
        }

        // 检查账号是否已存在
        const existingAdmin = await Admin.findOne({
            where: { account },
            transaction
        });

        if (existingAdmin) {
            throw new Error("该账号已被注册");
        }

        // 检查邮箱是否已被使用
        const emailExists = await Admin.findOne({
            where: { email },
            transaction
        });

        if (emailExists) {
            throw new Error("该邮箱已被使用");
        }

        // 获取IP地理位置信息
        const ipInfo = await lookupAllGeoInfo(req.clientIp);
        
        // 密码加密
        const hashedPassword = await hash(password, 10);

        // 创建管理员账号
        const admin = await Admin.create({
            account,
            password: hashedPassword,
            username: name,
            email,
            register_ip: req.clientIp,
            register_address: `${ipInfo.country} ${ipInfo.region} ${ipInfo.city}`,
            register_device: req.headers['user-agent'],
            register_isp: ipInfo.isp,
            bindRegisterCode: registerCode,
            status: true
        }, { transaction });

        // 更新注册码状态
        await regCode.update({
            usedTime: new Date(),
            usedBy: admin.id
        }, { transaction });

        // 记录日志
        await createLog({
            type: 'admin_register',
            content: `管理员注册: ${account}`,
            status: 'success',
            ip: req.clientIp,
            device: req.headers['user-agent'],
            admin_id: admin.id,
            details: {
                name,
                email,
                location: ipInfo
            }
        }, { transaction });

        await transaction.commit();

        res.json({
            code: 200,
            message: "注册成功",
            data: {
                id: admin.id,
                account: admin.account,
                name: admin.username,
                email: admin.email
            }
        });

    } catch (error) {
        await transaction.rollback();
        res.json({
            code: 500,
            message: error.message
        });
    }
};

/**
 * 生成图片验证码
 */
exports.generateCaptcha = async function(req, res) {
    try {
        // 生成验证码
        const captcha = svgCaptcha.create({
            size: 4,
            noise: 2,
            color: true,
            background: '#f0f0f0'
        });

        // 生成唯一ID
        const captchaId = RandomService.generateString(32);
        
        // 存储验证码到Redis，5分钟过期
        const key = `admin_captcha:${captchaId}`;
        await RedisService.set(key, captcha.text);
        await RedisService.expire(key, 300, RedisService.TimeUnit.SECONDS);

        res.json({
            code: 200,
            data: {
                id: captchaId,
                image: captcha.data
            }
        });

    } catch (error) {
        res.json({
            code: 500,
            message: error.message
        });
    }
};

/**
 * 发送邮箱验证码
 */
exports.sendEmailCode = async function(req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors;
        return res.json({
            code: 400,
            message: msg
        });
    }

    try {
        const { email } = req.body;

        // 检查邮箱是否已被使用
        const existingAdmin = await Admin.findOne({
            where: { email }
        });

        if (existingAdmin) {
            throw new Error("该邮箱已被使用");
        }

        // 生成并发送验证码
        await generateEmailCode(email, null, 'admin_register');

        res.json({
            code: 200,
            message: "验证码已发送"
        });

    } catch (error) {
        res.json({
            code: 500,
            message: error.message
        });
    }
};

/**
 * # 管理员登录
 * ## 参数
 * 1. account
 * 1. password
 *
 * 管理员账号、密码在环境变量文件中设置(根目录 .env 文件)
 */
exports.login = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg
            });
        }

        const { account, password, markcode } = req.body;

        // 查找管理员
        const admin = await Admin.findOne({
            where: { account }
        });

        if (!admin || !compareSync(password, admin.password)) {
            return res.json({
                code: 401,
                message: "账号或密码错误"
            });
        }

        if (!admin.status) {
            return res.json({
                code: 403,
                message: "账号已被禁用"
            });
        }

        // 获取地理位置信息
        const geoInfo = await getIpLocation(req.clientIp);

        // 生成 token
        const token = jwt.sign({
            id: admin.id,
            account: admin.account,
            role: 'admin'
        }, process.env.ADMIN_TOKEN_KEY, {
            expiresIn: '24h' // token 24小时有效
        });

        // 检查是否存在旧的登录记录
        const existingToken = await AdminToken.findOne({
            where: {
                account: admin.account,
                markcode
            }
        });

        if (existingToken) {
            // 删除旧的 Redis 缓存
            try {
                await redisClient.del(`admin_token:${existingToken.token}`);
            } catch (error) {
                console.error('Redis delete error:', error);
            }
            // 删除旧的数据库记录
            await existingToken.destroy();
        }

        // 创建新的登录记录
        const adminToken = await AdminToken.create({
            account: admin.account,
            token,
            markcode,
            device: req.headers['user-agent']
        });

        // 在 Redis 中缓存 token 信息
        const tokenData = {
            id: admin.id,
            account: admin.account,
            markcode,
            loginTime: dayjs().toISOString(),
            device: req.headers['user-agent'],
            ip: req.clientIp,
            location: geoInfo.location,
            permissions: ['admin'], // 可以根据需要添加权限
            lastActive: Date.now()
        };

        try {
            // 设置 token 缓存，24小时过期
            await redisClient.set(
                `admin_token:${token}`,
                JSON.stringify(tokenData),
                'EX',
                86400 // 24小时 = 86400秒
            );

            // 维护在线管理员列表
            await redisClient.sadd('online_admins', admin.account);
            await redisClient.expire('online_admins', 86400);
        } catch (error) {
            console.error('Redis cache error:', error);
        }

        // 记录登录日志
        await createAdminLog('admin_login', req, res, {
            account: admin.id,
            ip: req.clientIp,
            device: req.headers['user-agent'],
            location: geoInfo.location
        });

        // 构建响应数据
        const response = {
            code: 200,
            message: "登录成功",
            data: {
                token,
                admin: {
                    id: admin.id,
                    account: admin.account,
                    username: admin.username,
                    avatar: admin.avatar,
                    email: admin.email,
                    description: admin.description
                },
                device: {
                    id: adminToken.id,
                    markcode: adminToken.markcode,
                    loginTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
                },
                loginInfo: {
                    ip: req.clientIp,
                    location: geoInfo.location,
                    isp: geoInfo.isp,
                    device: req.headers['user-agent']
                }
            }
        };

        return res.json(response);

    } catch (error) {
        console.error('管理员登录失败:', error);
        return res.status(500).json({
            code: 500,
            message: '登录失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

exports.sendMail = async (req, res) => {
    // 验证请求参数是否符合规则
    const err = validationResult(req);
    // 如果存在验证错误
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400, message: msg,
        });
    } else {
        if (!req.body.account && !req.body.token) {
            if (!!process.env.SMTP_USER && !!process.env.SMTP_PASSWORD && !!process.env.SMTP_HOST && !!process.env.SMTP_PORT && !!process.env.SMTP_SECURE && !!process.env.SMTP_FROM) {
                Admin.findOne({
                    where: {
                        email: req.body.email,
                    }
                }).then(async admin => {
                    if (admin) {
                        await global.redisClient.connect();
                        if (req.body.mailType === 'reset_password') {
                            const result = await global.redisClient.get('admin_reset_password' + req.body.email);
                            // 已存在此邮箱数据
                            if (result) {
                                await global.redisClient.disconnect();
                                return res.status().json('此邮箱已发送找回密码邮件，请检查邮箱，15分钟后再次尝试')
                            }
                            const transporter = global.nodemailer.createTransport({
                                host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, auth: {
                                    user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD,
                                },
                            });
                            const sendVerificationEmail = async (to, verificationCode) => {
                                const templatePath = path.join(__dirname, '../template/reset_password.ejs');
                                const template = fs.readFileSync(templatePath, 'utf-8');
                                const html = global.ejs.render(template, {
                                    username: admin.username,
                                    verificationLink: process.env.BASE_SERVER_URL + '/api/admin/resetPassword/?token=' + verificationCode,
                                    senderName: process.env.USER_SYSTEM_NAME
                                });
                                const mailOptions = {
                                    from: process.env.SMTP_FROM,
                                    to: req.body.email,
                                    subject: process.env.USER_SYSTEM_NAME + ' - 重置密码',
                                    html,
                                };

                                try {
                                    await transporter.sendMail(mailOptions);
                                    console.log('重置密码电子邮件已成功发送。');
                                } catch (error) {
                                    console.error('发送电子邮件时出错：', error);
                                    res.status(500).json({msg: '发送电子邮件时出错：' + error});
                                }
                            };

                            const storeVerificationCode = async (email, code) => {
                                await global.redisClient.set('admin_reset_password' + email, code, {
                                    EX: 60 * 15, NX: true,
                                }); // 设置有效期为15分钟
                            };
                            // 发送验证码邮件
                            // 生成验证码
                            const verificationCode = hashSync(req.body.email, 10);
                            await sendVerificationEmail(req.body.email, hashSync(req.body.email, 10));
                            // 存储验证码至 redis
                            await storeVerificationCode(req.body.email, hashSync(req.body.email, 10));
                            await redisClient.set('admin_password_rested' + verificationCode, req.body.email, {
                                EX: 60 * 15, NX: true,
                            });
                            await global.redisClient.disconnect();
                            res.status(200).json({code: 200, message: '重置电子邮件已成功发送。'});
                        }
                    } else {
                        res.status(404).json({
                            code: 404, message: '邮箱未绑定账号',
                        })
                    }
                })
            } else {
                res.boom.badRequest('SMTP配置错误')
            }
        } else {
            Admin.findOne({
                where: {
                    account: req.body.account,
                }
            }).then(async admin => {
                if (admin) {
                    if (admin.email !== null) {
                        AdminToken.findOne({
                            where: {
                                account: admin.account, token: req.body.token,
                            }
                        }).then(async token => {
                            if (token) {
                                if (!!process.env.SMTP_USER && !!process.env.SMTP_PASSWORD && !!process.env.SMTP_HOST && !!process.env.SMTP_PORT && !!process.env.SMTP_SECURE && !!process.env.SMTP_FROM) {
                                    await global.redisClient.connect();
                                    if (req.body.mailType === 'reset_password') {
                                        const result = await global.redisClient.get('admin_reset_password' + req.body.email);
                                        // 已存在此邮箱数据
                                        if (result) {
                                            await global.redisClient.disconnect();
                                            return res.boom.badRequest('此邮箱已发送找回密码邮件，请检查邮箱，15分钟后再次尝试')
                                        }
                                        const transporter = global.nodemailer.createTransport({
                                            host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, auth: {
                                                user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD,
                                            },
                                        });
                                        const sendVerificationEmail = async (to, verificationCode) => {
                                            const templatePath = path.join(__dirname, '../template/reset_password.ejs');
                                            const template = fs.readFileSync(templatePath, 'utf-8');
                                            const html = global.ejs.render(template, {
                                                username: admin.username,
                                                verificationLink: process.env.BASE_SERVER_URL + '/api/admin/resetPassword?token=' + verificationCode,
                                                senderName: process.env.USER_SYSTEM_NAME
                                            });
                                            const mailOptions = {
                                                from: process.env.SMTP_FROM,
                                                to: req.body.email,
                                                subject: process.env.USER_SYSTEM_NAME + ' - 重置密码',
                                                html,
                                            };

                                            try {
                                                await transporter.sendMail(mailOptions);
                                                console.log('重置密码电子邮件已成功发送。');
                                            } catch (error) {
                                                console.error('发送电子邮件时出错：', error);
                                                res.status(500).json({msg: '发送电子邮件时出错：' + error});
                                            }
                                        };

                                        const storeVerificationCode = async (email, code) => {
                                            await global.redisClient.set('admin_reset_password' + email, code, {
                                                EX: 60 * 15, NX: true,
                                            }); // 设置有效期为15分钟
                                        };
                                        // 发送验证码邮件
                                        // 生成验证码
                                        const verificationCode = hashSync(req.body.email, 10);
                                        await sendVerificationEmail(req.body.email, verificationCode);
                                        // 存储验证码至 redis
                                        await storeVerificationCode(req.body.email, req.body.email);
                                        await redisClient.set('admin_password_rested' + verificationCode, req.body.email, {
                                            EX: 60 * 15, NX: true,
                                        });
                                        await global.redisClient.disconnect();
                                        res.status(200).json({code: 200, message: '重置电子邮件已成功发送。'});
                                    }
                                } else {
                                    res.boom.badRequest('SMTP配置错误')
                                }
                                // 创建nodemailer transporter
                            } else {
                                res.boom.unauthorized('token错误')
                            }
                        }).catch(err => {
                            console.error(err)
                            res.boom.serverUnavailable(`数据模型未就绪 ${err.message}`)
                        });
                    } else {
                        res.boom.badRequest('该账号没有绑定邮箱')
                    }
                } else {
                    res.boom.unauthorized('账号不存在')
                }
            });
        }
    }
}

exports.bindEmail = (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400, message: msg,
        });
    } else {
        AdminToken.findOne({
            where: {
                token: req.body.token,
            }
        }).then(token => {
            if (token) {
                Admin.findOne({
                    where: {
                        account: token.account,
                    }
                }).then(async admin => {
                    if (admin) {
                        if (!admin.email) {
                            await redisClient.connect();
                            if (await redisClient.exists('admin_bind_email' + req.body.email)) {
                                const verificationCode = await redisClient.get('admin_bind_email' + req.body.email);
                                if (verificationCode === req.body.verificationCode) {
                                    await admin.update({
                                        email: req.body.email,
                                    });
                                    await redisClient.del('admin_bind_email' + req.body.email);
                                    await redisClient.disconnect();
                                    res.status(200).json({code: 200, message: '绑定邮箱成功'});
                                }
                            } else {
                                res.status(404).json({code: 404, message: '请先发送绑定邮箱验证码'});
                            }
                        } else {
                            res.status(404).json({code: 404, message: '该账号已绑定邮箱'});
                        }
                    } else {
                        res.status(404).json({code: 404, message: '账号不存在'});
                    }
                })
            }
        })
    }
};
//
// exports.resetPassword = async (req, res) => {
//     // 验证请求参数是否符合规则
//     const {longUrl} = req.body;
//     // 如果存在验证错误
//     if (!validUrl.isUri(longUrl)) {
//         return res.status(400).json({
//             code: 400, message: "该链接不符合要求",
//         });
//     } else {
//         await redisClient.connect();
//         const email = await redisClient.get('admin_password_rested' + req.query.token);
//         if (email) {
//             Admin.findOne({
//                 where: {
//                     email: email,
//                 }
//             }).then(async admin => {
//                 if (admin) {
//                     const transporter = global.nodemailer.createTransport({
//                         host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, auth: {
//                             user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD,
//                         },
//                     });
//                     const sendVerificationEmail = async (to, verificationCode) => {
//                         const templatePath = path.join(__dirname, '../template/rested_password.ejs');
//                         const template = fs.readFileSync(templatePath, 'utf-8');
//                         const html = global.ejs.render(template, {
//                             username: admin.username,
//                             newPassword: verificationCode,
//                             senderName: process.env.USER_SYSTEM_NAME
//                         });
//                         const mailOptions = {
//                             from: process.env.SMTP_FROM,
//                             to: email,
//                             subject: process.env.USER_SYSTEM_NAME + ' - 重置密码成功',
//                             html,
//                         };
//
//                         try {
//                             await transporter.sendMail(mailOptions);
//                             console.log('重置密码电子邮件已成功发送。');
//                         } catch (error) {
//                             console.error('发送电子邮件时出错：', error);
//                             res.status(500).json({msg: '发送电子邮件时出错：' + error});
//                         }
//                     };
//                     // 生成验证码
//                     const password = randomPass()
//                     const verificationCode = hashSync(password, 10);
//                     await admin.update({
//                         password: verificationCode,
//                     });
//                     await sendVerificationEmail(req.body.email, password);
//                     global.redisClient.del('admin_password_rested' + req.body.token).then(() => {
//                         res.status(200).json({code: 200, message: '密码重置成功'});
//                         global.redisClient.disconnect();
//                     });
//                 } else {
//                     res.boom.unauthorized('token错误')
//                 }
//             })
//         } else {
//             await redisClient.disconnect();
//             res.status(404).json({code: 404, message: 'token错误'});
//         }
//     }
// }

exports.createBanner = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400, message: msg,
        });
    } else {
        const token = getToken(req.headers.authorization);
        const {appid, title, header, content, type, url} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            }
        });

        if (admin) {
            const banner = await Banner.create({
                appid: appid, title: title, header: header, content: content, type: type, url: url,
            });

            if (banner) {
                res.status(200).json({
                    code: 200, message: '创建成功', data: banner,
                });
            } else {
                res.json({
                    code: 503, message: '数据未就绪',
                });
            }
        } else {
            res.json({
                code: 404, message: 'token错误',
            });
        }
    }
}

exports.updateBanner = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400, message: msg,
        });
    } else {
        const token = getToken(req.headers.authorization);
        const {id, appid, title, header, content, type, url} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            }
        });

        if (admin) {
            const banner = await Banner.findOne({
                where: {
                    id: id,
                }
            });

            if (banner) {
                await banner.update({
                    appid: appid, title: title, header: header, content: content, type: type, url: url,
                });

                res.status(200).json({
                    code: 200, message: '更新成功', data: banner,
                });
            } else {
                res.json({
                    code: 404, message: 'banner不存在',
                });
            }
        } else {
            res.json({
                code: 404, message: 'token错误',
            });
        }
    }
}

const {logger} = require("express-winston");

exports.getSystemInfo = async (req, res) => {
    try {
        const cpus = os.cpus();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const platform = os.platform();
        
        const response = {
            cpu: {
                model: cpus[0].model,
                count: cpus.length,
                speed: `${cpus[0].speed} MHz`,
                load: os.loadavg()
            },
            memory: {
                total: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
                free: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
                usage: `${((1 - freeMemory / totalMemory) * 100).toFixed(2)}%`
            },
            system: {
                platform,
                type: os.type(),
                release: os.release(),
                arch: os.arch(),
                uptime: `${Math.floor(os.uptime() / 3600)} hours`
            }
        };

        res.json({ code: 200, data: response });
    } catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
};


/**
 * 获取管理员统计信息
 */
exports.getAdminStats = async (req, res) => {
    try {
        await findAdminInfo(req, res, async (adminToken, admin) => {
            // 使用单个查询获取应用及其用户数量
            const apps = await App.findAll({
                where: { bind_admin_account: admin.id },
                attributes: [
                    'id',
                    'name',
                    [sequelize.fn('COUNT', sequelize.col('Users.id')), 'userCount']
                ],
                include: [{
                    model: User,
                    attributes: [],
                    required: false
                }],
                group: ['App.id', 'App.name'],
                raw: true
            });

            // 优化在线用户统计
            const appOnlineStats = new Map();
            if (global.onlineUsers) {
                for (const [_, userData] of global.onlineUsers) {
                    const appId = userData.appid;
                    appOnlineStats.set(appId, (appOnlineStats.get(appId) || 0) + 1);
                }
            }

            const appStats = apps.map(app => ({
                appId: app.id,
                appName: app.name,
                userCount: parseInt(app.userCount),
                onlineCount: appOnlineStats.get(app.id) || 0
            }));

            const response = {
                adminInfo: {
                    account: admin.account,
                    name: admin.username,
                    email: admin.email,
                    avatar: admin.avatar,
                    createTime: admin.createdAt,
                },
                stats: {
                    totalApps: apps.length,
                    totalUsers: appStats.reduce((sum, app) => sum + app.userCount, 0),
                    onlineUsers: global.onlineUsers ? global.onlineUsers.size : 0,
                    appsDetail: appStats
                }
            };

            // 使用Redis缓存统计数据（5分钟）
            if (redisClient) {
                const cacheKey = `admin_stats:${admin.id}`;
                await redisClient.setex(cacheKey, 300, JSON.stringify(response));
            }

            return res.json({
                code: 200,
                data: response
            });
        });
    } catch (error) {
        console.error('获取管理员统计信息失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取统计信息失败',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

exports.updateAdminInfo = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.status(400).json({
            code: 400, message: msg,
        });
    }

    try {
        const token = getToken(req.headers.authorization);
        const adminToken = await AdminToken.findOne({
            where: { token }
        });

        if (!adminToken) {
            return res.status(401).json({
                code: 401,
                message: '管理员Token错误'
            });
        }

        const admin = await Admin.findOne({
            where: { account: adminToken.account }
        });

        if (!admin) {
            return res.status(404).json({
                code: 404,
                message: '管理员不存在'
            });
        }

        // Update admin information
        await admin.update({
            username: req.body.username || admin.username,
            email: req.body.email || admin.email,
            // Add other fields as necessary
        });

        res.status(200).json({
            code: 200,
            message: '信息更新成功',
            data: {
                username: admin.username,
                email: admin.email,
                // Include other fields as necessary
            }
        });

    } catch (error) {
        res.status(500).json({
            code: 500,
            message: '服务器错误',
            error: error.message
        });
    }
};

// ... existing code ...

exports.updatePassword = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.status(400).json({
            code: 400, message: msg,
        });
    }

    try {
        const token = getToken(req.headers.authorization);
        const adminToken = await AdminToken.findOne({
            where: { token }
        });

        if (!adminToken) {
            return res.status(401).json({
                code: 401,
                message: '管理员Token错误'
            });
        }

        const admin = await Admin.findOne({
            where: { account: adminToken.account }
        });

        if (!admin) {
            return res.status(404).json({
                code: 404,
                message: '管理员不存在'
            });
        }

        // Check if the old password matches
        if (!compareSync(req.body.oldPassword, admin.password)) {
            return res.status(400).json({
                code: 400,
                message: '旧密码错误'
            });
        }

        // Update the password
        const newPasswordHash = hashSync(req.body.newPassword, 10);
        await admin.update({
            password: newPasswordHash
        });

        res.status(200).json({
            code: 200,
            message: '密码更新成功'
        });

    } catch (error) {
        res.status(500).json({
            code: 500,
            message: '服务器错误',
            error: error.message
        });
    }
};

const si = require('systeminformation');
const { findAdminInfo } = require('../function/findAdmin');
const sequelize = require('sequelize');
const {mysql} = require("../database");
const {createLog} = require("../function/adminLogService");
const osUtils = require('node-os-utils');
const pidusage = require('pidusage');
const { getIpLocation } = require('../function/ipLocation');

/**
 * 获取CPU使用率
 */
async function getCpuUsage() {
    try {
        const os = require('os');
        const cpu = osUtils.cpu;
        const count = cpu.count();
        const usage = await cpu.usage();
        const loadavg = os.loadavg();
        const model = os.cpus()[0].model;

        // 获取当前进程的 CPU 使用情况
        const processStats = await pidusage(process.pid);

        return {
            cores: {
                physical: count,
                logical: os.cpus().length
            },
            usage: {
                total: usage.toFixed(2),
                process: processStats.cpu.toFixed(2)
            },
            loadavg: {
                '1m': loadavg[0].toFixed(2),
                '5m': loadavg[1].toFixed(2),
                '15m': loadavg[2].toFixed(2)
            },
            model: model,
            speed: {
                current: os.cpus()[0].speed,
                min: null,
                max: null
            },
            temperature: await getCpuTemperature()
        };
    } catch (error) {
        console.error('Failed to get CPU usage:', error);
        return {
            cores: {
                physical: os.cpus().length,
                logical: os.cpus().length
            },
            usage: {
                total: '0',
                process: '0'
            },
            loadavg: {
                '1m': '0',
                '5m': '0',
                '15m': '0'
            },
            model: os.cpus()[0].model,
            speed: {
                current: os.cpus()[0].speed,
                min: null,
                max: null
            },
            temperature: null
        };
    }
}

/**
 * 获取 CPU 温度 (仅支持 Linux)
 */
async function getCpuTemperature() {
    const { execSync } = require('child_process');
    const os = require('os');
    
    if (os.platform() !== 'linux') return null;
    
    try {
        // 尝试从不同的温度传感器读取
        const sensors = [
            '/sys/class/thermal/thermal_zone0/temp',
            '/sys/class/hwmon/hwmon0/temp1_input'
        ];
        
        for (const sensor of sensors) {
            try {
                const temp = parseInt(execSync(`cat ${sensor}`, { encoding: 'utf8' }));
                return (temp / 1000).toFixed(1); // 转换为摄氏度
            } catch (e) {
                continue;
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * 获取内存使用情况
 */
async function getMemoryInfo() {
    const mem = osUtils.mem;
    const info = await mem.info();
    const processStats = await pidusage(process.pid);

    return {
        total: formatBytes(info.totalMemMb * 1024 * 1024),
        used: formatBytes(info.usedMemMb * 1024 * 1024),
        free: formatBytes(info.freeMemMb * 1024 * 1024),
        percent: info.usedMemPercentage.toFixed(2),
        process: {
            used: formatBytes(processStats.memory),
            percent: ((processStats.memory / (info.totalMemMb * 1024 * 1024)) * 100).toFixed(2)
        },
        swap: await getSwapInfo()
    };
}

/**
 * 获取交换分区信息
 */
async function getSwapInfo() {
    const { execSync } = require('child_process');
    const os = require('os');
    
    try {
        if (os.platform() === 'linux') {
            const output = execSync('free -b', { encoding: 'utf8' });
            const lines = output.split('\n');
            const swapLine = lines.find(line => line.startsWith('Swap:'));
            if (swapLine) {
                const [, total, used] = swapLine.split(/\s+/).map(Number);
                return {
                    total: formatBytes(total),
                    used: formatBytes(used),
                    free: formatBytes(total - used),
                    percent: ((used / total) * 100).toFixed(2)
                };
            }
        } else if (os.platform() === 'win32') {
            const output = execSync('wmic pagefile get AllocatedBaseSize,CurrentUsage', { encoding: 'utf8' });
            const [, values] = output.trim().split('\n');
            const [total, used] = values.trim().split(/\s+/).map(size => size * 1024 * 1024);
            return {
                total: formatBytes(total),
                used: formatBytes(used),
                free: formatBytes(total - used),
                percent: ((used / total) * 100).toFixed(2)
            };
        }
        return null;
    } catch (error) {
        console.error('Failed to get swap info:', error);
        return null;
    }
}

/**
 * 获取网络使用情况
 */
async function getNetworkInfo() {
    try {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        const { execSync } = require('child_process');
        const platform = os.platform();

        // 获取网络流量统计
        let trafficStats = {};
        try {
            if (platform === 'linux') {
                // Linux 系统使用 /proc/net/dev
                const output = execSync('cat /proc/net/dev', { encoding: 'utf8' });
                const lines = output.trim().split('\n').slice(2);
                lines.forEach(line => {
                    const [iface, stats] = line.trim().split(':');
                    const [
                        rxBytes, rxPackets, rxErrors, rxDrop,
                        rxFifo, rxFrame, rxCompressed, rxMulticast,
                        txBytes, txPackets, txErrors, txDrop,
                        txFifo, txColls, txCarrier, txCompressed
                    ] = stats.trim().split(/\s+/).map(Number);

                    trafficStats[iface.trim()] = {
                        rx: {
                            bytes: rxBytes,
                            packets: rxPackets,
                            errors: rxErrors,
                            dropped: rxDrop
                        },
                        tx: {
                            bytes: txBytes,
                            packets: txPackets,
                            errors: txErrors,
                            dropped: txDrop
                        }
                    };
                });
            } else if (platform === 'win32') {
                // Windows 系统使用 netstat
                const output = execSync('netstat -e', { encoding: 'utf8' });
                const lines = output.trim().split('\n').slice(2);
                const [bytes] = lines[0].trim().split(/\s+/).map(Number);
                trafficStats = {
                    total: {
                        bytes: bytes
                    }
                };
            }
        } catch (error) {
            console.error('Failed to get network traffic stats:', error);
            trafficStats = {};
        }

        // 处理网络接口信息
        const networkInterfaces = [];
        for (const [name, ifaceData] of Object.entries(interfaces)) {
            for (const iface of ifaceData) {
                // 排除内部接口
                if (!iface.internal) {
                    const interfaceInfo = {
                        name: name,
                        address: iface.address,
                        netmask: iface.netmask,
                        family: `IPv${iface.family}`,
                        mac: iface.mac,
                        internal: iface.internal,
                        cidr: iface.cidr,
                        traffic: trafficStats[name] || null,
                        status: {
                            up: true,
                            running: true
                        }
                    };

                    // 添加流量统计
                    if (trafficStats[name]) {
                        interfaceInfo.stats = {
                            received: {
                                bytes: formatBytes(trafficStats[name].rx.bytes),
                                packets: trafficStats[name].rx.packets,
                                errors: trafficStats[name].rx.errors,
                                dropped: trafficStats[name].rx.dropped
                            },
                            transmitted: {
                                bytes: formatBytes(trafficStats[name].tx.bytes),
                                packets: trafficStats[name].tx.packets,
                                errors: trafficStats[name].tx.errors,
                                dropped: trafficStats[name].tx.dropped
                            }
                        };
                    }

                    networkInterfaces.push(interfaceInfo);
                }
            }
        }

        return {
            interfaces: networkInterfaces,
            stats: {
                total: trafficStats.total ? formatBytes(trafficStats.total.bytes) : null,
                interfaces: networkInterfaces.length,
                active: networkInterfaces.filter(iface => iface.status.up).length
            }
        };
    } catch (error) {
        console.error('Failed to get network info:', error);
        return {
            interfaces: [],
            stats: {
                total: null,
                interfaces: 0,
                active: 0
            }
        };
    }
}

/**
 * 格式化字节大小
 * @param {number} bytes - 字节数
 * @returns {Object} 格式化后的对象，包含值和单位
 */
function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return { value: 0, unit: 'Bytes' };
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return {
        value: parseFloat((bytes / Math.pow(1024, i)).toFixed(2)),
        unit: sizes[i],
        raw: bytes,
        formatted: `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`
    };
}

/**
 * 格式化运行时间
 * @param {number} seconds - 秒数
 * @returns {Object} 格式化后的对象，包含总秒数和格式化字符串
 */
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return {
        total: seconds,
        formatted: `${days}天 ${hours}小时 ${minutes}分钟 ${secs}秒`,
        breakdown: {
            days,
            hours,
            minutes,
            seconds: secs
        }
    };
}

/**
 * 获取磁盘使用状态
 * @param {number} usage - 使用百分比
 * @returns {string} 状态描述
 */
function getDiskStatus(usage) {
    if (usage >= 90) return 'critical';
    if (usage >= 70) return 'warning';
    return 'normal';
}

/**
 * 格式化内存使用情况
 * @param {Object} memory - 内存使用对象
 * @returns {Object} 格式化后的内存使用信息
 */
function formatMemoryUsage(memory) {
    return {
        heapTotal: formatBytes(memory.heapTotal),
        heapUsed: formatBytes(memory.heapUsed),
        rss: formatBytes(memory.rss),
        external: formatBytes(memory.external || 0),
        arrayBuffers: formatBytes(memory.arrayBuffers || 0),
        usage: {
            percentage: ((memory.heapUsed / memory.heapTotal) * 100).toFixed(2),
            formatted: `${((memory.heapUsed / memory.heapTotal) * 100).toFixed(2)}%`
        }
    };
}

/**
 * 格式化网络速率
 * @param {number} bytesPerSecond - 每秒字节数
 * @returns {Object} 格式化后的网络速率
 */
function formatNetworkSpeed(bytesPerSecond) {
    const formatted = formatBytes(bytesPerSecond);
    return {
        ...formatted,
        perSecond: `${formatted.value} ${formatted.unit}/s`
    };
}

/**
 * 获取磁盘状态
 */
function getDiskStatus() {
    const { execSync } = require('child_process');
    const os = require('os');
    const platform = os.platform();

    try {
        let diskInfo;
        if (platform === 'win32') {
            // Windows
            const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
            const lines = output.trim().split('\n').slice(1);
            diskInfo = lines.map(line => {
                const [caption, freeSpace, size] = line.trim().split(/\s+/);
                const used = size - freeSpace;
                return {
                    drive: caption,
                    total: parseInt(size),
                    free: parseInt(freeSpace),
                    used: used,
                    percent: Math.round((used / size) * 100)
                };
            }).filter(disk => disk.total > 0);
        } else {
            // Linux/Unix
            const output = execSync('df -B1', { encoding: 'utf8' });
            const lines = output.trim().split('\n').slice(1);
            diskInfo = lines.map(line => {
                const [filesystem, size, used, available, percent, mounted] = line.trim().split(/\s+/);
                return {
                    drive: mounted,
                    total: parseInt(size),
                    free: parseInt(available),
                    used: parseInt(used),
                    percent: parseInt(percent)
                };
            });
        }

        return diskInfo.map(disk => ({
            drive: disk.drive,
            total: formatBytes(disk.total),
            free: formatBytes(disk.free),
            used: formatBytes(disk.used),
            percent: disk.percent
        }));
    } catch (error) {
        console.error('Failed to get disk status:', error);
        return [];
    }
}

/**
 * 格式化内存使用情况
 */
function formatMemoryUsage() {
    const os = require('os');
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const swapTotal = 0; // 需要根据平台获取swap信息
    const swapUsed = 0;

    return {
        total: formatBytes(total),
        used: formatBytes(used),
        free: formatBytes(free),
        percent: Math.round((used / total) * 100),
        swap: {
            total: formatBytes(swapTotal),
            used: formatBytes(swapUsed),
            percent: swapTotal ? Math.round((swapUsed / swapTotal) * 100) : 0
        }
    };
}

/**
 * 格式化网络速率
 */
function formatNetworkSpeed() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const stats = [];

    for (const [name, info] of Object.entries(interfaces)) {
        for (const item of info) {
            if (!item.internal) { // 排除本地回环接口
                stats.push({
                    interface: name,
                    address: item.address,
                    family: `IPv${item.family}`,
                    mac: item.mac,
                    netmask: item.netmask,
                    speed: item.speed || 0 // 某些系统可能不提供速率信息
                });
            }
        }
    }

    return stats;
}

/**
 * 获取系统信息和管理员统计信息
 */
exports.getAdminDashboard = async (req, res) => {
    try {
        await findAdminInfo(req, res, async (adminToken, admin) => {
            try {
                // 1. 并行获取系统信息以提高性能
                const [cpuInfo, memInfo, diskInfo, osInfo, networkStats] = await Promise.all([
                    getCpuUsage(),
                    getMemoryInfo(),
                    getDiskStatus(),
                    si.osInfo(),
                    getNetworkInfo()
                ]);

                // 2. 获取应用统计信息
                const appStats = await App.findAll({
                    where: { bind_admin_account: admin.id },
                    attributes: [
                        'id',
                        'name',
                        'status',
                        [sequelize.fn('COUNT', sequelize.col('Users.id')), 'userCount']
                    ],
                    include: [{
                        model: User,
                        attributes: []
                    }],
                    group: ['App.id', 'App.name', 'App.status']
                });

                // 3. 构建响应数据
                const response = {
                    code: 200,
                    message: '获取仪表盘数据成功',
                    data: {
                        system: {
                            cpu: {
                                model: cpuInfo.model,
                                cores: cpuInfo.cores,
                                usage: cpuInfo.usage,
                                loadavg: cpuInfo.loadavg,
                                speed: cpuInfo.speed,
                                temperature: cpuInfo.temperature
                            },
                            memory: {
                                total: memInfo.total,
                                used: memInfo.used,
                                free: memInfo.free,
                                percent: memInfo.percent,
                                process: memInfo.process,
                                swap: memInfo.swap
                            },
                            disk: diskInfo.map(disk => ({
                                device: disk.drive,
                                size: disk.total,
                                used: disk.used,
                                available: disk.free,
                                usage: {
                                    percentage: disk.percent,
                                    status: getDiskStatus(disk.percent)
                                }
                            })),
                            os: {
                                platform: osInfo.platform,
                                distro: osInfo.distro,
                                release: osInfo.release,
                                arch: osInfo.arch,
                                hostname: osInfo.hostname,
                                uptime: formatUptime(os.uptime())
                            },
                            network: {
                                stats: networkStats.stats,
                                interfaces: networkStats.interfaces
                            }
                        },
                        process: {
                            pid: process.pid,
                            uptime: formatUptime(process.uptime()),
                            memory: formatMemoryUsage(process.memoryUsage()),
                            nodeVersion: process.version,
                            platform: process.platform,
                            arch: process.arch
                        },
                        admin: {
                            id: admin.id,
                            account: admin.account,
                            username: admin.username,
                            email: admin.email,
                            createTime: admin.createTime,
                            lastLogin: adminToken.createdAt
                        },
                        applications: {
                            total: appStats.length,
                            active: appStats.filter(app => app.status).length,
                            stats: appStats.map(app => ({
                                id: app.id,
                                name: app.name,
                                status: app.status,
                                users: {
                                    total: parseInt(app.get('userCount')),
                                    online: global.onlineUsers ? 
                                        Array.from(global.onlineUsers.values())
                                            .filter(u => u.appid === app.id).length : 0,
                                    percentage: app.get('userCount') > 0 ? 
                                        ((global.onlineUsers ? 
                                            Array.from(global.onlineUsers.values())
                                                .filter(u => u.appid === app.id).length : 0) / 
                                            parseInt(app.get('userCount')) * 100).toFixed(2) : '0.00'
                                }
                            }))
                        }
                    }
                };

                // 4. 缓存处理
                try {
                    if (global.redis) {
                        const cacheKey = `admin_dashboard:${admin.id}`;
                        await global.redis.setex(cacheKey, 300, JSON.stringify(response));
                    }
                } catch (cacheError) {
                    console.error('Dashboard cache error:', cacheError);
                }

                return res.json(response);

            } catch (error) {
                console.error('获取仪表盘数据失败:', error);
                return res.status(500).json({
                    code: 500,
                    message: '获取仪表盘数据失败',
                    error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
                });
            }
        });
    } catch (error) {
        console.error('管理员验证失败:', error);
        return res.status(401).json({
            code: 401,
            message: '未授权访问',
            error: process.env.NODE_ENV === 'development' ? error.message : '认证失败'
        });
    }
};

// 导出所有工具函数以便其他模块使用
module.exports = {
    ...module.exports,
    formatBytes,
    formatUptime,
    getDiskStatus,
    formatMemoryUsage,
    formatNetworkSpeed,
    getCpuUsage,
    getMemoryInfo,
    getNetworkInfo
};