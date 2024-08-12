process.env.TZ = 'Asia/Shanghai'
require('./function/dayjs')
const express = require("express");
const routes = require("./routes/index"); //新增
const app = express();
const sequelize = require('sequelize')
const {Sequelize, DataTypes} = require("sequelize");
const cors = require('cors');
const {body, validationResult} = require('express-validator');
const helmet = require('helmet')
const fileUpload = require('express-fileupload');
const boom = require('express-boom')
const path = require('path');
const ejs = require('ejs');
const {promisify} = require('util');
app.use(helmet())
const requestIp = require('request-ip');
app.use(requestIp.mw())
app.use(boom())

const {resolve} = require("node:path");
const {expressjwt} = require("express-jwt");
const expressLogger = require("./middleware/logger");
const {AdminRegistrationCode} = require("./models/adminRegistrationCode");
const {Admin} = require("./models/admin");
const {User} = require("./models/user");
const {Log} = require("./models/log");
const {urlencoded, json} = require("body-parser");
const {mysql} = require("./database");
const session = require("express-session");
const {Token} = require("./models/token");
const {Daily} = require("./models/daily");
const {CustomIdLog} = require("./models/customIdLog");
const {App} = require("./models/app");
const http = require("http");
const socketIO = require("socket.io");
const {Counter} = require("./models/counter");
const {VersionChannel} = require("./models/versionChannel");
const {versionChannelUser} = require("./models/versionChannelUser");
const {Version} = require("./models/version");
const {AdminLog} = require("./models/adminLog");
const {AdminToken} = require("./models/adminToken");
const {Banner} = require("./models/banner");
const {Card} = require("./models/card");
const {Goods} = require("./models/goods");
const {LoginLog} = require("./models/loginLog");
const {Notification} = require("./models/notification");
const {Site} = require("./models/sites");
const {RegisterLog} = require("./models/registerLog");
const {SiteAudit} = require('./models/user/siteAudits');
const {SiteAward} = require("./models/user/siteAward");
const {RoleToken} = require("./models/user/roleToken");
app.use(cors());
app.use(expressLogger)
app.engine('html', ejs.__express);
app.set('view engine', 'html');
app.set('trust proxy', 'loopback');
app.use(json());
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars')))
app.use(fileUpload());
app.use(urlencoded({extended: false}));
app.use(session({
    secret: process.env.ADMIN_TOKEN_KEY, resave: false, saveUninitialized: true, cookie: {secure: false} // 设置为 true 以支持 HTTPS
}));
const server = http.createServer(app);
exports.io = socketIO(server);
app.use("/", routes); //新增
// 错误处理中间件
async function initDatabase() {
    //JavaScript
    process.env.NODE_TLS_MIN_PROTOCOL_VERSION = "TLSv1.2";
    await mysql.authenticate().then(r => console.log("数据库测试成功"));
    await mysql.sync({force: false}).then(async r => {
        if (r) {
            await AdminRegistrationCode.hasMany(Admin, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindRegisterCode', sourceKey: 'code'
            })
            await Admin.belongsTo(AdminRegistrationCode, {
                foreignKey: 'bindRegisterCode', targetKey: 'code', onDelete: 'CASCADE', onUpdate: 'CASCADE'
            });// 定义关联关系
            await Admin.hasMany(AdminLog, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'log_user_id', sourceKey: 'id'
            })
            await Admin.hasMany(App, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bind_admin_account', sourceKey: 'id'
            })
            await Admin.hasMany(AdminToken, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'account', sourceKey: 'id'
            })
            await AdminLog.belongsTo(Admin, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'log_user_id', sourceKey: 'id'
            })
            await AdminToken.belongsTo(Admin, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'account', targetKey: 'id'
            })

            await App.hasMany(User, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id'
            })

            await User.belongsTo(App, {
                foreignKey: 'appid',
            })


            // 一个应用对应多个签到
            await App.hasMany(Daily, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid'
            })

            // 一个应用对应多个版本
            await App.hasMany(Version, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindAppid'
            })

            // 一个应用对应多个版本渠道
            await App.hasMany(VersionChannel, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindAppid'
            })

            // 一个应用对应多个自定义ID日志
            await App.hasMany(CustomIdLog, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid'
            })

            // 一个应用对应多个计数器
            await App.hasMany(Counter, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindAppid', sourceKey: 'id'
            })

            // 一个应用对应一个管理员
            await App.belongsTo(Admin, {
                foreignKey: 'bind_admin_account', targetKey: 'id'
            })

            await App.hasMany(Banner, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id'
            })

            await App.hasMany(Token, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id'
            })

            await Banner.belongsTo(App, {
                foreignKey: 'appid', targetKey: 'id'
            })
            await CustomIdLog.belongsTo(User, {
                foreignKey: 'userId'
            })
            await CustomIdLog.belongsTo(App, {
                foreignKey: 'appid'
            })
            await Goods.belongsTo(App, {
                foreignKey: 'bindAppid', targetKey: 'id'
            })
            await Daily.belongsTo(User, {
                foreignKey: 'userId'
            })
            await Daily.belongsTo(App, {
                foreignKey: 'appid'
            })
            await Log.belongsTo(User, {
                foreignKey: 'log_user_id'
            })
            await LoginLog.belongsTo(User, {
                foreignKey: 'user_id', targetKey: 'id'
            })
            await Notification.belongsTo(App, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE'
            })
            await App.hasMany(Notification, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id'
            })
            await App.hasMany(Card, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id'
            })
            await RegisterLog.belongsTo(User, {
                foreignKey: 'user_id', targetKey: 'id'
            })

            /*
            * 1. 一个应用对应多个网站
             */
            await Site.belongsTo(App, {onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', targetKey: 'id'})

            /*
            * 2. 一个用户对应多个网站
             */
            await Site.belongsTo(User, {
                foreignKey: 'userId', targetKey: 'id'
            })

            await Token.belongsTo(App, {foreignKey: 'appid', targetKey: 'id'})

            await Token.belongsTo(User, {
                foreignKey: 'account', targetKey: 'id'
            })

            await Token.belongsTo(User, {
                foreignKey: 'open_qq', targetKey: 'open_qq'
            })

            await Token.belongsTo(User, {
                foreignKey: 'open_wechat', targetKey: 'open_wechat'
            })


            await User.hasMany(Log, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'log_user_id'
            })
            await User.hasMany(Daily, {
                onUpdate: 'CASCADE', onDelete: 'CASCADE', foreignKey: 'userId'
            })
            await User.hasMany(CustomIdLog, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId'
            })
            await User.hasMany(versionChannelUser, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId'
            })
            await User.hasOne(Counter, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindUserid', sourceKey: 'id'
            })
            await User.hasOne(RegisterLog, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'user_id', sourceKey: 'id'
            })
            await User.hasMany(LoginLog, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'user_id', sourceKey: 'id'
            })

            await User.hasMany(Token, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'account', sourceKey: 'account'
            })

            await User.hasMany(Token, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'open_qq', sourceKey: 'open_qq'
            })

            await User.hasMany(Token, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'open_wechat', sourceKey: 'open_wechat'
            })

            await Version.belongsTo(App, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindAppid'
            })
            await Version.belongsTo(VersionChannel, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindBand'
            })

            await VersionChannel.hasMany(versionChannelUser, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'channelId'
            })

            await VersionChannel.hasMany(Version, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindBand'
            })
            await VersionChannel.belongsTo(App, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindAppid'
            })

            await versionChannelUser.belongsTo(User, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId'
            })
            await versionChannelUser.belongsTo(VersionChannel, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'channelId'
            })
            await Card.belongsTo(App, {foreignKey: 'appid', targetKey: 'id'});
            await Card.belongsTo(User, {
                foreignKey: 'account', targetKey: 'id'
            });
            await Counter.belongsTo(App, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindAppid', sourceKey: 'id'
            })
            await Counter.belongsTo(User, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindUserid', sourceKey: 'id'
            })
            await App.hasMany(SiteAudit, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appId', sourceKey: 'id'
            })
            await User.hasMany(SiteAudit, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId', sourceKey: 'id'
            })
            await SiteAudit.belongsTo(User, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId', sourceKey: 'id'
            })
            await Site.hasOne(SiteAudit, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'site_id', sourceKey: 'id'
            })
            await SiteAudit.belongsTo(Site, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'site_id', sourceKey: 'id'
            })
            await SiteAudit.belongsTo(App, {
                foreignKey: 'appId', targetKey: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE',
            })
            await App.hasMany(SiteAward, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id'
            })
            await User.hasMany(SiteAward, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId', sourceKey: 'id'
            })
            await SiteAward.belongsTo(User, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId', targetKey: 'id'
            })
            await Site.hasOne(SiteAward, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'siteId', sourceKey: 'id'
            })
            await SiteAward.belongsTo(Site, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'siteId', targetKey: 'id'
            })
            await App.hasMany(RoleToken, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id'
            })
            await User.hasOne(RoleToken, {
                onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId', sourceKey: 'id'
            })
            await RoleToken.belongsTo(User, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'userId',
                targetKey: 'id'
            })
            await RoleToken.belongsTo(App, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'appid',
                targetKey: 'id'
            })
            console.log("数据库同步成功");
        } else {
            console.log("数据库同步失败");
        }
    }).catch(e => console.error("数据库模型同步失败", e));

    // await globals.Token.sync({
    //     force: true, alter: false
    // }).then(r => console.log("数据库模型同步成功")).catch(e => console.error("数据库模型同步失败", e));
    console.log("数据库初始化完成")
    app.listen(process.env.SERVER_PORT, () => {
        console.log(`服务已启动 ${process.env.BASE_SERVER_URL}:${process.env.SERVER_PORT}`);
    });
}

initDatabase()