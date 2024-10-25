require('../function/dayjs')
const crypto = require("crypto");
const global = require("../global");
const bcrypt = require("bcrypt");
const { validationResult } = require("express-validator");
const { getToken, stringRandom } = require("../global");
const { AdminToken } = require("../models/adminToken");
const { App } = require("../models/app");
const { User } = require("../models/user");
const { Card } = require("../models/card");
const dayjs = require("../function/dayjs");
const path = require("node:path");
const fs = require('fs');
const columnify = require('columnify');
const { Admin } = require("../models/admin");
const { getAvatar } = require('../function');
const { getVip } = require('../function/getVip');
const {Banner} = require("../models/banner");
const {hashSync} = require("bcrypt");

/**
 * # 创建应用
 * ## 参数
 * 1. appid
 * 1. name
 *
 * 请求该接口需要管理员Token，在请求头设置即可
 */
exports.create = (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        const token = getToken(req.headers.authorization)
        AdminToken.findOne({
            where: {
                token: token,
            }
        }).then(token => {
            if (token === null) {
                res.json({
                    code: 401, message: '管理员Token错误'
                })
            } else {
                App.findOne({
                    where: {
                        id: req.body.id,
                    }
                }).then(async result => {
                    if (result != null) {
                        res.json({
                            code: 401, message: '该应用已存在'
                        })
                    } else {
                        const admin = await Admin.findOne({
                            where: {
                                account: token.account
                            }
                        })
                        if (!admin) {
                            return res.json({
                                code: 401, message: '管理员不存在'
                            })
                        }
                        App.create({
                            id: req.body.id,
                            name: req.body.name,
                            key: bcrypt.hashSync(req.body.id + req.body.id, 10),
                            bind_admin_account: admin.id,
                        }).then(result => {
                            res.status(200).json({
                                code: 200, message: result,
                            })
                        }).catch(error => {
                            res.boom.notFound(error.message)
                        })
                    }
                }).catch(error => {
                    res.json({
                        code: 500, message: error
                    })
                })
            }
        }).catch(error => {
            res.json({
                code: 400, message: error.message,
            })
        })
    }
}


exports.createNotification = async function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        await App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app == null) {
                // 如果应用不存在，返回400错误并提示应用无法找到
                return res.json({
                    code: 400, message: '无法找到该应用'
                })
            }
            if (app instanceof App) {
                if (app.status) {
                    Notification.create({
                        appid: app.id, title: req.body.title, summary: req.body.content,
                    }).then(result => {
                        res.status(200).json({
                            code: 200, message: '成功创建通知',
                        })
                    }).catch(err => {
                        res.json({
                            code: 201, message: '创建通知失败',
                        })
                    })
                } else {
                    res.json({
                        code: 201, message: '应用已停止'
                    })

                }
            }

        }).catch(error => {
            // 处理查找应用的错误
            res.json({
                code: 500, message: '查找应用出错', error: error
            })
        })
    }
}

exports.notifications = async function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app) {
                Notification.findAll({
                    where: {
                        appid: app.id
                    }
                }).then(result => {
                    res.status(200).json({
                        code: 200, message: result,
                    })
                }).catch(error => {
                    res.json({
                        code: 400, message: '查找应用通知失败', data: error.message
                    })
                })
            } else {
                res.json({
                    code: 401, message: '应用不存在'
                })
            }
        })
    }
}

/**
 * # 删除应用
 * ## 参数
 * 1. appid
 *
 * 请求该接口需要管理员Token，在请求头设置即可
 */

exports.deleteApp = (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        App.findAll({
            where: {
                id: req.body.appid,
            }
        }).then(result => {
            if (result[0] != null) {
                result[0].destroy().then(r => res.status(200).json({
                    code: 200, message: '应用删除成功'
                })).catch(error => {
                    res.json({
                        code: 201, message: '应用删除失败'
                    })
                })
            } else {
                res.json({
                    code: 401, message: '该应用不存在'
                })
            }
        }).catch(error => {
            res.json({
                code: 500, message: error
            })
        })
    }
}

exports.apps = function (req, res) {
    App.findAll().then(result => {
        res.status(200).json({
            code: 200, message: result
        })
    }).catch(error => {
        res.json({
            code: 500, message: error
        })
    })
}

exports.appConfig = function (req, res) {
    App.findByPk(req.params.appid || req.body.appid).then(app => {
        if (app == null) {
            // 如果应用不存在，返回400错误并提示应用无法找到
            return res.json({
                code: 400, message: '无法找到该应用'
            })
        }
        if (app instanceof App) {
            res.status(200).json({
                code: 200, message: app
            })
        }
    })
}


exports.updateAppConfig = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app == null) {
                // 如果应用不存在，返回400错误并提示应用无法找到
                return res.json({
                    code: 400, message: '无法找到该应用'
                })
            } else {
                if (app instanceof App) {
                    app.update({
                        name: req.body.name,
                        status: req.body.status || app.status,
                        disabledReason: req.body.disabledReason || app.disabledReason,
                        registerStatus: req.body.registerStatus || app.registerStatus,
                        disabledRegisterStatus: req.body.disabledRegisterStatus || app.disabledRegisterStatus,
                        loginStatus: req.body.loginStatus || app.loginStatus,
                        disabledLoginReason: req.body.disabledLoginReason || app.disabledLoginReason,
                        loginCheckDevice: req.body.loginCheckDevice || app.loginCheckDevice,
                        loginCheckUser: req.body.loginCheckUser || app.loginCheckUser,
                        loginCheckDeviceTimeOut: req.body.loginCheckDeviceTimeOut || app.loginCheckDeviceTimeOut,
                        multiDeviceLogin: req.body.multiDeviceLogin || app.multiDeviceLogin,
                        multiDeviceLoginNum: req.body.multiDeviceLoginNum || app.multiDeviceLoginNum,
                        register_award: req.body.register_award || app.register_award,
                        register_award_num: req.body.register_award_num || app.register_award_num,
                        invite_award: req.body.invite_award || app.invite_award,
                        invite_award_num: req.body.invite_award_num || app.invite_award_num,
                        daily_award: req.body.daily_award || app.daily_award,
                        daily_award_num: req.body.daily_award_num || app.daily_award_num,
                    }).then(result => {
                        res.status(200).json({
                            code: 200, message: '更新配置成功', data: result
                        })
                    }).catch(error => {
                        res.json({
                            code: 500, message: error
                        })
                    })
                }
            }
        }).catch(error => {
            res.json({
                code: 500, message: error
            })
        })
    }
}
exports.generateCard = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors;
        return res.json({
            code: 400, message: msg,
        });
    }

    try {
        const app = await App.findByPk(req.params.appid || req.body.appid);
        if (!app) {
            return res.json({
                code: 404, message: '无法查找该应用',
            });
        }

        const num = Math.abs(parseInt(req.body.num)) || 1;
        const length = Math.abs(parseInt(req.body.length)) || 12;

        if (length < 6) {
            return res.json({
                code: 400, message: '卡号长度不能小于6位',
            });
        }

        if (num > 1000) {
            return res.json({
                code: 400, message: '一次最多生成1000张卡',
            });
        }

        const cards = [];
        for (let i = 0; i < num; i++) {
            const cardCode = stringRandom(length);
            const card = {
                card_code: cardCode,
                card_status: 'normal',
                card_type: req.body.card_type,
                appid: req.body.appid,
                card_award_num: Math.abs(req.body.card_award_num) || 0,
                card_memo: req.body.card_memo,
                card_code_expire: dayjs().add(Math.abs(parseInt(req.body.card_code_expire)), 'days').toDate(),
                card_time: dayjs().toDate()
            };
            const createdCard = await Card.create(card);
            cards.push(createdCard);
        }

        // Format the cards data into a table
        const cardData = cards.map(card => {
            const cardType = card.card_type === 'vip' ? '会员' : '积分';
            const cardUnit = card.card_type === 'vip' ? '天' : '个';
            return {
                卡密: card.card_code,
                过期时间: dayjs(card.card_code_expire).format('YYYY-MM-DD HH:mm:ss'),
                卡密奖励类型: cardType,
                卡密奖励数量: `${card.card_award_num} ${cardUnit}`
            };
        });

        const columnifiedData = columnify(cardData, {
            columnSplitter: ' | ', config: {
                卡密: { minWidth: 15 },
                过期时间: { minWidth: 20 },
                卡密奖励类型: { minWidth: 10 },
                卡密奖励数量: { minWidth: 15 }
            },
        });

        // Create a text file with the generated cards
        const fileName = `cards_${dayjs().format('YYYYMMDD_HHmmss')}.txt`;
        const filePath = path.join(__dirname, '../generated_cards', fileName);

        // Ensure the directory exists
        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        // Write the header and cards to the file
        const header = "本文件用于记录生成的卡密信息\n\n";
        const fileContent = header + columnifiedData;

        fs.writeFileSync(filePath, fileContent);

        // Schedule file deletion after 1 hour (3600000 milliseconds)
        const deleteAfter = 3600000; // 1 hour in milliseconds
        setTimeout(() => {
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(`Failed to delete file ${filePath}:`, err);
                } else {
                    console.log(`File ${filePath} deleted successfully.`);
                }
            });
        }, deleteAfter);

        // Trigger file download
        res.download(filePath, fileName, (err) => {
            if (err) {
                console.error('File download error:', err);
                res.json({
                    code: 500, message: '文件下载失败', error: err.message,
                });
            } else {
                console.log('File download succeeded');
            }
        });

    } catch (error) {
        console.error('Error generating cards:', error);
        res.json({
            code: 500, message: '服务器错误', error: error.message,
        });
    }
};


exports.cards = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app instanceof App) {
                Card.findAll({
                    where: {
                        appid: req.params.appid || req.body.appid
                    }
                }).then(cards => {
                    res.status(200).json({
                        code: 200, message: '获取卡成功', data: cards
                    })
                }).catch(error => {
                    res.json({
                        code: 500, message: '获取卡失败', error: error.message
                    })
                })
            }
        }).catch(error => {
            res.json({
                code: 500, message: '查找应用失败', error: error.message
            })
        })
    }
}

exports.userList = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors;
        res.json({
            code: 400, msg: msg,
        });
    } else {
        try {
            const appid = req.params.appid || req.body.appid;
            const app = await App.findByPk(appid);
            if (app instanceof App) {
                const page = Math.abs(parseInt(req.body.page)) || 1;
                const limit = Math.abs(parseInt(req.body.pageSize)) || 50;
                const offset = (page - 1) * limit;

                // 获取总条数
                const totalItems = await User.count({
                    where: {
                        appid: appid
                    }
                });

                // 获取当前页的数据
                const users = await User.findAll({
                    where: {
                        appid: appid
                    }, limit: limit, offset: offset
                });

                // 仅格式化 name 字段
                const formattedUsers = users.map(user => ({
                    ...user.toJSON(), // 保留其他字段
                    avatar: getAvatar(user.avatar),
                    vip_time:getVip(user.vip_time) // 仅格式化 name
                }));

                const totalPages = Math.ceil(totalItems / limit);
                const remainingPages = totalPages - page;
                const currentPageItems = users.length;

                return res.status(200).json({
                    code: 200, message: '获取用户成功', data: formattedUsers, pagination: {
                        currentPage: page,
                        totalPages: totalPages,
                        remainingPages: remainingPages,
                        totalItems: totalItems,
                        currentPageItems: currentPageItems
                    }
                });
            } else {
                res.status(404).json({
                    code: 404, message: '应用未找到'
                });
            }
        } catch (error) {
            res.status(500).json({
                code: 500, message: '获取用户失败', error: error.message
            });
        }
    }
};

exports.updateUser = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app) {
                User.findOne({
                    id: req.body.id, appid: req.params.appid || req.body.appid,
                }).then(user => {
                    if (user) {
                        user.update({
                            name: req.body.name || user.name,
                            integral: user.integral + req.body.integral || user.integral + 0,
                            vip_time: req.body.vip_time || user.vip_time,
                            email: req.body.email || user.email,
                            enabled: req.body.enabled || user.enabled,
                            reason: req.body.reason || user.reason,
                            role: req.body.role || user.role,
                            markcode: req.body.markcode || user.markcode,
                            password: user.password,
                        }).then(user => {
                            if (user) {
                                res.status(200).json({
                                    code: 200, message: '用户更新成功', user: user
                                })
                            }
                        }).catch(err => {
                            res.send({ message: err.message });
                        });
                    } else {
                        res.json({
                            code: 400,
                        })
                    }
                }).catch(err => {
                    res.json({
                        code: 201, msg: '用户无法找到',
                    })
                })
            } else {
                return res.json({
                    code: 201, msg: '无法找到该应用',
                })
            }
        })
    }
}


exports.deleteBanner = async (req, res) => {
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
        const {id} = req.body;
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
                await banner.destroy();

                res.status(200).json({
                    code: 200, message: '删除成功',
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

exports.bannerList = async (req, res) => {
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
        const {appid} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            }
        });

        if (admin) {
            const banners = await Banner.findAll({
                where: {
                    appid: appid,
                }
            });

            res.status(200).json({
                code: 200, message: '获取成功', data: banners,
            });
        } else {
            res.json({
                code: 404, message: 'token错误',
            });
        }
    }
}

exports.addBanner = async (req, res) => {
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
                appid: appid, title: title, header: header, content: content, type: type || 'url', url: url,
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
                    appid: appid, title: title, header: header, content: content, type: type || banner.type, url: url,
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

exports.addUser = async (req, res) => {
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
        const {appid, username, password, email, phone, avatar, status} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            }
        });

        if (admin) {
            const user = await User.create({
                appid: appid, name: username, password: hashSync(password, 10),
            });

            if (user) {
                res.status(200).json({
                    code: 200, message: '创建成功', data: user,
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

exports.userInfo = async (req, res) => {
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
        const {appid, id} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            }
        });

        if (admin) {
            const user = await User.findOne({
                where: {
                    appid: appid,
                    id: id,
                }
            });

            if (user) {
                res.status(200).json({
                    code: 200, message: '获取成功', data: user,
                });
            } else {
                res.json({
                    code: 404, message: '用户不存在',
                });
            }
        } else {
            res.json({
                code: 404, message: 'token错误',
            });
        }
    }
}

exports.deleteCard = async (req, res) => {
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
        const {appid, id} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            }
        });

        if (admin) {
            const card = await Card.findOne({
                where: {
                    appid: appid,
                    id: id,
                }
            });

            if (card) {
                await card.destroy();

                res.status(200).json({
                    code: 200, message: '删除成功',
                });
            } else {
                res.json({
                    code: 404, message: '卡密不存在',
                });
            }
        } else {
            res.json({
                code: 404, message: 'token错误',
            });
        }
    }
}

exports.deleteUser = async (req, res) => {
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
        const {appid, id} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            }
        });

        if (admin) {
            const user = await User.findOne({
                where: {
                    appid: appid,
                    id: id,
                }
            });

            if (user) {
                await user.destroy();

                res.status(200).json({
                    code: 200, message: '删除成功',
                });
            } else {
                res.json({
                    code: 404, message: '用户不存在',
                });
            }
        } else {
            res.json({
                code: 404, message: 'token错误',
            });
        }
    }
}

exports.cardInfo = async (req, res) => {
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
        const {appid, id} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            }
        });

        if (admin) {
            const card = await Card.findOne({
                where: {
                    appid: appid,
                    id: id,
                }
            });

            if (card) {
                res.status(200).json({
                    code: 200, message: '获取成功', data: card,
                });
            } else {
                res.json({
                    code: 404, message: '卡密不存在',
                });
            }
        } else {
            res.json({
                code: 404, message: 'token错误',
            });
        }
    }
}