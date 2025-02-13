const {User} = require('../models/user');
const {getToken} = require("../global");
const {Token} = require("../models/token");
const {App} = require("../models/app");
const bcrypt = require('bcrypt');
const {RoleToken} = require("../models/user/roleToken");
const {Op} = require("sequelize");
const dayjs = require("./dayjs");

/**
 * # 根据动态条件查找用户
 *  * @param {Object} req - 请求对象
 *  * @param {Object} res - 响应对象
 *  * @param {Function} callback - 回调函数，参数为 (token, user)
 *  */

async function findUserInfo(req, res, callback) {
    try {

        if (!req.headers.authorization) {
            return res.json({
                code: 201, message: '用户未授权'
            });
        }

        const appId = req.body.appid || req.query.appid;
        const tokenValue = getToken(req.headers.authorization);

        // Combine App and Token queries to reduce database calls
        const [app, token] = await Promise.all([
            App.findByPk(appId),
            Token.findOne({
                where: {
                    token: tokenValue, appid: appId,
                }
            })
        ]);

        if (!app) {
            return res.json({
                code: 201, message: '无法找到该应用'
            });
        }

        if (!token) {
            return res.json({
                code: 201, message: '无法找到该登录状态'
            });
        }

        // Set query condition
        const whereCondition = {
            appid: token.appid, // appid is required
        };

        if (token.account) {
            whereCondition.id = token.account;
        }
        if (token.open_qq) {
            whereCondition.open_qq = token.open_qq;
        }
        if (token.open_wechat) {
            whereCondition.open_wechat = token.open_wechat;
        }

        // Find User
        const user = await User.findOne({ where: whereCondition });

        if (!user) {
            return res.json({
                code: 201, message: '无法找到该用户'
            });
        }

        if (!user.enabled || dayjs(user.disabledEndTime).isAfter(dayjs())) {
            return res.json({
                code: 401, message: '用户已被禁用,验证失败'
            });
        }

        // Call the callback function with token, user, and app
        callback(token, user, app);
    } catch (e) {
        return res.json({
            code: 500, message: '服务器错误', error: e.message
        });
    }
}

async function findUserByPassword(req, res, callback) {
    try {

        if (!req.body.appid) {
            return res.json({
                code: 201, message: 'appid 是必需的'
            });
        }

        if (!req.body.account) {
            return res.json({
                code: 201, message: '用户名是必需的'
            });
        }

        if (!req.body.password) {
            return res.json({
                code: 201, message: '密码是必需的'
            });
        }

        const app = await App.findByPk(req.body.appid);

        if (!app) {
            return res.json({
                code: 201, message: '无法找到该应用'
            });
        }

        const user = await User.findOne({
            where: {
                appid: req.body.appid, account: req.body.account,
            }
        });

        if (!user) {
            return res.json({
                code: 201, message: '未找到该用户'
            });
        }

        if (!bcrypt.compareSync(req.body.password, user.password)) {
            return res.json({
                code: 201, message: '用户名或密码错误'
            });
        }

        callback(user, app);
    } catch (e) {
        return res.json({
            code: 500, message: '服务器错误', error: e.message
        });
    }
}


async function findUserVerifyRole(req, res, callback) {
    try {

        if (!req.headers.authorization) {
            return res.json({
                code: 201, message: '用户未授权'
            });
        }

        if (!req.body.appid) {
            return res.json({
                code: 201, message: 'appid 是必需的'
            });
        }

        const app = await App.findByPk(req.body.appid);

        if (!app) {
            return res.json({
                code: 201, message: '无法找到该应用'
            });
        }

        const token = await RoleToken.findOne({
            where: {
                token: getToken(req.headers.authorization), appid: req.body.appid,
            }, include: [{model: User}]
        })

        if (!token) {
            return res.json({
                code: 201, message: '无法找到该登录状态'
            });
        }

        const user = await User.findOne({
            where: {
                appid: req.body.appid || req.query.appid, account: token.User.account || req.query.account, role: {
                    [Op.in]: ['admin', 'auditor']
                }
            }
        });

        if (!user) {
            return res.json({
                code: 201, message: '未找到该用户'
            });
        }

        callback(token, user);
    } catch (e) {
        return res.json({
            code: 500, message: '服务器错误', error: e.message
        });
    }
}


module.exports = {findUserInfo, findUserByPassword, findUserVerifyRole};