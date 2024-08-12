const {validationResult} = require("express-validator");
const {App} = require("../../../models/app");
const {User} = require("../../../models/user");
const bcrypt = require("bcrypt");
const {jwt, redisClient} = require("../../../global");
const {RoleToken} = require("../../../models/user/roleToken");
const {SiteAudit} = require("../../../models/user/siteAudits");
const {findUserVerifyRole, findUserInfo} = require("../../../function/findUser");
const {Site} = require("../../../models/sites");
const dayjs = require("../../../function/dayjs");
const {SiteAward} = require("../../../models/user/siteAward");
const {Op} = require("sequelize");


exports.login = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = errors.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400, message: msg,
        });
    }
    // 业务逻辑
    try {
        const app = await App.findByPk(req.body.appid);
        if (!app) {
            return res.json({
                code: 201, message: '无法找到该应用'
            });
        }
        const user = await User.findOne({
            where: {
                appid: req.body.appid, account: req.body.account, role: {
                    [Op.in]: ['admin', 'auditor']
                }
            },
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

        if (!user.enabled || dayjs(user.disabledEndTime).isAfter(dayjs().toDate(), 'day')) {
            return res.json({
                code: 201, message: '用户已被禁用'
            });
        }


        const expiredAt = new Date().getTime() + 1000 * 60 * 60 * 24 * 7;

        const token = jwt.sign({
            id: user.id, appid: user.appid, account: user.account, password: user.password, role: user.role
        }, process.env.ROLE_TOKEN_KEY, {
            expiresIn: '7d'
        });

        await RoleToken.create({
            token: token, appid: user.appid, userId: user.id, role: user.role, expiredAt: dayjs(expiredAt).toDate()
        });

        await redisClient.set(token, user.id, {
            EX: 60 * 60 * 24 * 7
        });

        return res.json({
            code: 200, message: '登录成功', data: {
                token: token
            }
        });

    } catch (e) {
        return res.json({
            code: 500, message: '服务器错误', error: e.message
        });
    }
}


exports.waitAuditSites = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserVerifyRole(req, res, async (token, user) => {
        const sites = await SiteAudit.findAndCountAll({
            where: {
                audit_status: 'wait'
            }, attributes: ['site_id', 'userId', 'appId', 'audit_status'], include: [{
                model: Site, attributes: ['name', 'url', 'header', 'type', 'description', 'id']
            }, {
                model: User, attributes: ['name', 'avatar']
            },], order: [['create_at', 'DESC']]
        })

        if (sites.count <= 0) {
            return res.json({
                code: 404, message: "暂无数据"
            })
        }

        return res.json({
            code: 200, message: "获取成功", data: sites.rows
        })
    })
}

/**
 * # 审核站点
 * ## 说明
 * > 1.传入参数包括[req.body.id, req.body.appid, req.body.status, req.body.reason],\
 * > 2.审核状态包括[pass, reject]\
 * > 3.id为站点ID，appid为应用ID，status为审核状态，reason为审核备注
 * ## 参数
 * > 1.id: 站点ID\
 * > 2.appid: 应用ID\
 * > 3.status: 审核状态\
 * > 4.reason: 审核备注
 */

exports.auditSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserVerifyRole(req, res, async (token, user) => {
        const auditSite = await Site.findOne({
            where: {
                id: req.body.id, appid: req.body.appid
            }
        })

        if (!auditSite) {
            return res.json({
                code: 404, message: "无法找到该站点"
            })
        }

        const site = await SiteAudit.findOne({
            where: {
                site_id: req.body.id, appId: req.body.appid
            }
        })

        if (!site) {
            return res.json({
                code: 404, message: "无法找到该待审核站点"
            })
        }

        if (site.audit_status !== 'wait') {
            return res.json({
                code: 404, message: "该站点已审核"
            })
        }

        await site.update({
            audit_user_id: user.id
        })

        await site.update({
            audit_status: req.body.status, audit_notes: req.body.reason || "", audit_date: dayjs().toDate(),
        })

        if (req.body.status === 'pass') {
            const user = await User.findByPk(site.userId)

            if (!user) {
                return res.json({
                    code: 404, message: "无法找到该用户"
                })
            }

            const content = `您的站点 ${auditSite.name} 已通过审核`
            await auditSite.update({
                status: 'normal'
            })
            await site.update({
                audit_notes: content
            })
            await auditSite.save()
            await site.save()

            const startOfDay = dayjs().startOf('day').toDate();
            const endOfDay = dayjs().endOf('day').toDate();

            const awardSites = await SiteAward.findAndCountAll({
                where: {
                    appid: req.body.appid, userId: user.id, createdAt: {
                        [Op.between]: [startOfDay, endOfDay],
                    },
                }
            })

            if (awardSites.count <= 5) {
                await SiteAward.create({
                    appid: req.body.appid,
                    userId: user.id,
                    siteId: auditSite.id,
                    createdAt: dayjs().toDate(),
                    award: 'integral',
                    awardNum: 5
                })
                await user.update({
                    integral: user.integral + 5
                })
                await user.save()
            }

            return res.json({
                code: 200, message: "审核通过"
            })
        }

    })
}

exports.siteList = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    const page = Math.abs(parseInt(req.body.page, 10)) || 1;
    const pageSize = Math.abs(parseInt(req.body.pageSize, 10)) || 50;
    const offset = (page - 1) * pageSize;

    findUserVerifyRole(req, res, async (token, user) => {
        const sites = await Site.findAndCountAll({
            where: {
                appid: req.body.appid, status: 'normal'
            }, attributes: ['header', 'name', 'url', 'type', 'description', 'id'], include: [{
                model: User, attributes: ['name', 'avatar']
            }], order: [['createdAt', 'DESC'], ['id', 'ASC']], // 稳定排序
            limit: pageSize, offset: offset
        })

        if (sites.rows.length <= 0) {
            return res.json({
                code: 404, message: "暂无数据"
            })
        }

        const totalPages = Math.ceil(sites.count / pageSize);

        return res.json({
            code: 200,
            message: "获取成功",
            data: sites.rows,
            currentPage: page,
            pageSize: sites.rows.length,
            totalPages: totalPages,
            totalCount: sites.count
        })
    })
}

exports.deleteSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserVerifyRole(req, res, async (token, user) => {
        const site = await Site.findOne({
            where: {
                id: req.body.id, appid: req.body.appid
            }
        })

        if (!site) {
            return res.json({
                code: 404, message: "无法找到该站点"
            })
        }

        await site.destroy()

        const targetUser = await User.findByPk(site.userId)

        if (!targetUser) {
            return res.json({
                code: 404, message: "无法找到该用户"
            })
        }

        user.integral = user.integral - 5
        await user.save()

        return res.json({
            code: 200, message: "删除成功"
        })
    })
}


exports.getSiteById = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserVerifyRole(req, res, async (token, user) => {
        const site = await Site.findOne({
            where: {
                id: req.body.id, appid: req.body.appid
            }, attributes: ['header', 'name', 'url', 'type', 'description', 'id'], include: [{
                model: User, attributes: ['name', 'avatar']
            }]
        })

        if (!site) {
            return res.json({
                code: 404, message: "无法找到该站点"
            })
        }

        return res.json({
            code: 200, message: "获取成功", data: site
        })
    })
}

exports.getSiteByUserId = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserVerifyRole(req, res, async (token, user) => {
        const site = await Site.findOne({
            where: {
                id: req.body.id, userId: user.id
            }, attributes: ['header', 'name', 'url', 'type', 'description', 'id'], include: [{
                model: User, attributes: ['name', 'avatar']
            }]
        })

        if (!site) {
            return res.json({
                code: 404, message: "无法找到该站点"
            })
        }

        return res.json({
            code: 200, message: "获取成功", data: site
        })
    })
}

exports.getSitesByUserId = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserVerifyRole(req, res, async (token, user) => {
        const sites = await Site.findAndCountAll({
            where: {
                userId: req.body.userId, appid: req.body.appid
            }, attributes: ['header', 'name', 'url', 'type', 'description', 'id'], include: [{
                model: User, attributes: ['name', 'avatar']
            }]
        })

        if (sites.count <= 0) {
            return res.json({
                code: 404, message: "暂无数据"
            })
        }

        return res.json({
            code: 200, message: "获取成功", data: sites.rows
        })
    })
}

exports.updateSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserVerifyRole(req, res, async (token, user) => {
        const site = await Site.findOne({
            where: {
                id: req.body.id, appid: req.body.appid
            }
        })

        if (!site) {
            return res.json({
                code: 404, message: "无法找到该站点"
            })
        }

        await site.update({
            header: req.body.header || site.header,
            name: req.body.name || site.name,
            url: req.body.url || site.url,
            type: req.body.type || site.type,
            description: req.body.description || site.description,
        })

        return res.json({
            code: 200, message: "更新成功"
        })
    })
}