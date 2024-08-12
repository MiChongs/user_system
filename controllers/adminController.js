require('../function/dayjs')
const {where} = require("sequelize");
const global = require("../global");
const {
    jwt, lookupAllGeoInfo, isEmptyStr, nodemailer, redisClient, randomPass, validUrl, getToken
} = require("../global");
const {validationResult} = require("express-validator");
const {createAdminLog} = require("../global");
const {hashSync, compareSync} = require("bcrypt");
const path = require("path");
const fs = require("fs");
const {Admin} = require("../models/admin");
const {AdminRegistrationCode} = require("../models/adminRegistrationCode");
const dayjs = require("dayjs");
const {AdminToken} = require("../models/adminToken");
const {token} = require('morgan');
const {Banner} = require('../models/banner');


/**
 * # 应用管理员注册
 * ## 参数
 * 1. account
 * 1. password
 * */


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

exports.myInfo = (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(404).json({
            code: 404, message: msg,
        });
    } else {
        Admin.findOne({
            where: {
                account: req.body.account,
            }
        }).then(admin => {
            if (admin) {
                res.boom.badRequest('账号已存在')
            }
        })
    }
}

exports.logout = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(404).json({
            code: 404, message: msg,
        });
    } else {
        await redisClient.connect()
        if (await redisClient.exists(getToken(req.headers.authorization))) {
            await redisClient.del(getToken(req.headers.authorization));
            AdminToken.findOne({
                where: {
                    token: getToken(req.headers.authorization)
                }
            }).then(async result => {
                if (result) {
                    await result.destroy()
                    await redisClient.disconnect()
                    res.status(200).json({
                        code: 200, message: "退出登录成功"
                    })
                } else {
                    await redisClient.disconnect()
                    res.status(404).json({
                        code: 404, message: "该登录状态未找到"
                    })
                }
            })
        } else {
            await redisClient.disconnect()
            res.status(404).json({
                code: 404, message: "该登录状态未找到"
            })
        }
    }
}

exports.register = async (req, res) => {
    // 验证请求参数是否符合规则
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400, message: msg,
        });
    }

    try {
        // 检查账号是否已存在
        const registerCode = await AdminRegistrationCode.findOne({
            where: {
                code: req.body.code,
            },
        });

        if (!registerCode) {
            return res.status(404).json({
                code: 404, message: '注册码不存在',
            });
        } else {
            if (registerCode.usedTime) {
                return res.status(400).json({
                    code: 400, message: '注册码已被使用',
                });
            }
        }

        const existingAdmin = await Admin.findOne({
            where: {
                account: req.body.account
            }
        });
        if (existingAdmin) {
            return res.status(400).json({
                code: 400, message: '账号已存在',
            });
        }

        // 获取地理位置信息
        const geoInfo = await lookupAllGeoInfo(req.clientIp);

        // 创建新管理员账号
        const newAdmin = await Admin.create({
            account: req.body.account,
            password: hashSync(req.body.password, 10),
            username: req.body.name,
            email: req.body.email,
            status: req.body.status,
            register_ip: req.clientIp,
            register_address: geoInfo.provinceName + geoInfo.cityNameZh,
            register_isp: geoInfo.autonomousSystemOrganization,
            register_device: req.body.markcode,
            createTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            bindRegisterCode: req.body.code,
        });

        if (newAdmin) {
            await createAdminLog('admin_register', req, res, newAdmin);
            await registerCode.update({
                usedTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            });
            return res.status(200).json({
                code: 200, message: '注册成功', data: newAdmin,
            });
        } else {
            return res.status(503).json({
                code: 503, message: '数据未就绪',
            });
        }
    } catch (err) {
        console.error('Error during registration:', err);
        return res.status(500).json({
            code: 500, message: '数据库错误', error: err.message,
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
    const err = validationResult(req);

    if (!err.isEmpty()) {
        const [{ msg }] = err.errors;
        return res.status(400).json({
            code: 404,
            message: msg,
        });
    }

    try {
        const admin = await Admin.findOne({
            where: {
                account: req.body.account,
            }
        });

        if (admin && compareSync(req.body.password, admin.password)) {
            const token = jwt.sign({
                account: admin.account,
                password: admin.password,
            }, process.env.ADMIN_TOKEN_KEY, {
                expiresIn: process.env.ADMIN_EXPIRES_IN,
            });

            await AdminToken.create({
                account: admin.account,
                token: token,
                markcode: req.body.markcode,
            });

            await createAdminLog('admin_login', req, res, admin);

            await redisClient.set(token, admin.account, {
                EX: 60 * 15,
            });

            return res.json({
                code: 200,
                message: '登录成功',
                token: token,
            });
        } else {
            return res.status(404).json({
                code: 404,
                message: '账号或密码错误',
            });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            code: 500,
            message: '服务器错误',
        });
    }
}

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

exports.resetPassword = async (req, res) => {
    // 验证请求参数是否符合规则
    const {longUrl} = req.body;
    // 如果存在验证错误
    if (!validUrl.isUri(longUrl)) {
        return res.status(400).json({
            code: 400, message: "该链接不符合要求",
        });
    } else {
        await redisClient.connect();
        const email = await redisClient.get('admin_password_rested' + req.query.token);
        if (email) {
            Admin.findOne({
                where: {
                    email: email,
                }
            }).then(async admin => {
                if (admin) {
                    const transporter = global.nodemailer.createTransport({
                        host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, auth: {
                            user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD,
                        },
                    });
                    const sendVerificationEmail = async (to, verificationCode) => {
                        const templatePath = path.join(__dirname, '../template/rested_password.ejs');
                        const template = fs.readFileSync(templatePath, 'utf-8');
                        const html = global.ejs.render(template, {
                            username: admin.username,
                            newPassword: verificationCode,
                            senderName: process.env.USER_SYSTEM_NAME
                        });
                        const mailOptions = {
                            from: process.env.SMTP_FROM,
                            to: email,
                            subject: process.env.USER_SYSTEM_NAME + ' - 重置密码成功',
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
                    // 生成验证码
                    const password = randomPass()
                    const verificationCode = hashSync(password, 10);
                    await admin.update({
                        password: verificationCode,
                    });
                    await sendVerificationEmail(req.body.email, password);
                    global.redisClient.del('admin_password_rested' + req.body.token).then(() => {
                        res.status(200).json({code: 200, message: '密码重置成功'});
                        global.redisClient.disconnect();
                    });
                } else {
                    res.boom.unauthorized('token错误')
                }
            })
        } else {
            await redisClient.disconnect();
            res.status(404).json({code: 404, message: 'token错误'});
        }
    }
}

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