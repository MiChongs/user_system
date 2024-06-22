const express = require("express");
const routes = require("./routes/index"); //新增
const app = express();
require('dotenv').config() // 默认读取项目根目录下的.env文件
const sequelize = require('sequelize')
const {Sequelize, DataTypes} = require("sequelize");
const globals = require('./global/index')
const cors = require('cors');
const {expressjwt} = require("express-jwt");
const {body, validationResult} = require('express-validator');
const boom = require('boom')
const secretKey = "Voyage";
app.use(expressjwt({algorithms: ['HS256'], secret: secretKey}).unless({
    path: ['/api/register', '/api/login']
}));
app.use(function (err, req, res, next) {
    if (err.name === 'UnauthorizedError') {
        res.status(401).json({
            code: 401,
            message: '无效 token'
        })
        return
    }
    if (err) {
        res.status(500).send({status: 'fail'});
    }
})
app.use(cors());
app.set('trust proxy', 'loopback');
app.use(globals.bodyParser.json());
app.use(globals.bodyParser.urlencoded({extended: false}));
app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    //Access-Control-Allow-Headers ,可根据浏览器的F12查看,把对应的粘贴在这里就行
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', '*');
    res.header('Content-Type', 'application/json;charset=utf-8');
    next();
});
const {join, resolve} = require("node:path");
const {jwt} = require("./global");

// 生成token
let generateToken;
generateToken = function (payload) {
    return "Bearer " +
        jwt.sign(payload, secretKey, {
            expiresIn: '7d',
        });
};

// 验证token
let verifyToken;
verifyToken = function (req, res, next) {
    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, secretKey, function (err, decoded) {
        if (err) {
            console.log("verify error", err);
            return res.json({code: 404, msg: "token无效"});
        }
        console.log("verify decoded", decoded);
        next();
    });
};
app.use((req, res, next) => {
//获取header中的token，并验证
    if (req.headers.authorization) {
        const flag = verifyToken(req.headers.authorization)
//验证失败
        if (!flag) {
            res.send({status: 'fail'})
        }
    }
//验证成功继续
    next()
})
app.get("/admin", (req, res) => {
    res.sendFile(resolve(__dirname, 'client/dist/admin', 'index.html'));
})

app.use("/", routes); //新增
globals.User.sync().then(r => console.debug("User synced successfully.")).catch(e => console.error(e));
globals.App.sync().then(r => console.debug("App synced successfully.")).catch(e => console.error(e));
globals.Token.sync().then(r => console.debug("Token synced successfully.")).catch(e => console.error(e));
app.listen(3000, () => {
    console.log("server is running");
});

try {
    globals.mysql.authenticate().then(r => console.log("Mysql authenticated!"));
} catch (e) {
    console.error(e);
}
