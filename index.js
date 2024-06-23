const express = require("express");
const routes = require("./routes/index"); //新增
const app = express();
const sequelize = require('sequelize')
const { Sequelize, DataTypes } = require("sequelize");
const globals = require('./global/index')
const cors = require('cors');
const { expressjwt } = require("express-jwt");
const { body, validationResult } = require('express-validator');
const helmet = require('helmet')
const fileUpload = require('express-fileupload');
const path = require('path');
var ejs = require('ejs');
app.use(expressjwt({ algorithms: ['HS256'], secret: process.env.ADMIN_PASSWORD }).unless({
    path: ['/api/user/register', '/api/user/login', '/api/admin/login', '/api/user/logout', /^\/public\/.*/, /^\/avatars\/.*/,
        /^\/static\/.*/,
        /^\/user_disk\/.*/,
        /^\/user_video\/.*/]
}));
app.use(helmet())
const requestIp = require('request-ip');
app.use(requestIp.mw())
app.use(function (err, req, res, next) {
    if (err.name === 'UnauthorizedError') {
        res.status(401).json({
            code: 401,
            message: '无效 token'
        })
        return
    }
    if (err) {
        res.status(500).json({ status: 'fail' });
    }
})
app.use(cors());
app.engine('html', ejs.__express);
app.set('view engine', 'html');
app.set('trust proxy', 'loopback');
app.use(globals.bodyParser.json());
app.use('/avatars', express.static(path.resolve(__dirname, './public/avatars')))
app.use(fileUpload());
app.use(globals.bodyParser.urlencoded({ extended: true }));
app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    //Access-Control-Allow-Headers ,可根据浏览器的F12查看,把对应的粘贴在这里就行
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', '*');
    res.header('Content-Type', 'application/json;charset=utf-8');
    next();
});
const { resolve } = require("node:path");
const { jwt } = require("./global");

let verifyToken = async function (token) {
    let newToken = token
    if (newToken.indexOf('Bearer') >= 0) {
        newToken = newToken.replace('Bearer ', '')
    }
    await jwt.verify(newToken, process.env.APP_TOKEN_KEY, function (err, decoded) {
        if (err) {
            console.log("verify error", err);
            return false;
        }
        console.log("verify decoded", decoded);
        return true
    });
};

app.use((req, res, next) => {
    //获取header中的token，并验证
    if (req.headers.authorization) {
        const flag = verifyToken(req.headers.authorization)
        if (!flag) {
            res.send({ status: 'fail' })
        }
    }
    //验证成功继续
    next()
})

app.use("/", routes); //新增
globals.User.sync().then(r => console.debug("User synced successfully.")).catch(e => console.error(e));
globals.App.sync().then(r => console.debug("App synced successfully.")).catch(e => console.error(e));
globals.Token.sync().then(r => console.debug("Token synced successfully.")).catch(e => console.error(e));
globals.Card.sync().then(r => console.debug("Card synced successfully"))
globals.Notification.sync().then(r => console.debug("Notification synced successfully"))
app.listen(process.env.SERVER_PORT, () => {
    console.log("server is running");
});
// Typescript:
// import { Reader } from '@maxmind/geoip2-node';

// 使用示例
const options = {
    watchForUpdates: true
}; // 假设options已定义

try {
    globals.mysql.authenticate().then(r => console.log("Mysql authenticated!"));
} catch (e) {
    console.error(e);
}
