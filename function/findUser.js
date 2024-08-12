const {User} = require('../models/user');
const {getToken} = require("../global");
const {Token} = require("../models/token");
const {App} = require("../models/app");
const bcrypt = require('bcrypt');
const {RoleToken} = require("../models/user/roleToken");
const {Op} = require("sequelize");

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

        const app = await App.findByPk(req.body.appid || req.query.appid);

        if (!app) {
            return res.json({
                code: 201, message: '无法找到该应用'
            });
        }

        // 查找 Token
        const token = await Token.findOne({
            where: {
                token: getToken(req.headers.authorization), appid: req.body.appid || req.query.appid,
            }
        });

        if (!token) {
            return res.json({
                code: 201, message: '无法找到该登录状态'
            });
        }

        // 设置查询条件
        const whereCondition = {
            appid: token.appid, // appid 是必需的
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

        // 查找 User
        const user = await User.findOne({where: whereCondition});

        if (!user) {
            return res.json({
                code: 201, message: '无法找到该用户'
            });
        }

        // 调用回调函数并传递 token 和 user
        callback(token, user, app);
    } catch (e) {
        return res.json({
            code: 500, message: '服务器错误', error: e.message
        });
    }
}

async function findUserByPassword(req, res, callback) {
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