const express = require("express");
const routes = require("./routes/index"); //新增
const app = express();

const sequelize = require('sequelize')
const {Sequelize, DataTypes} = require("sequelize");
const globals = require('./global/index')
const cors = require('cors');
const {expressjwt} = require("express-jwt");
const secretKey = "Voyage";
const {body, validationResult} = require('express-validator');
const boom = require('boom')
app.use(cors());
app.use(globals.bodyParser.json());
app.use(globals.bodyParser.urlencoded({extended: false}));
const {join, resolve} = require("node:path");
const {jwt} = require("./global");

// 生成token
generateToken = function (payload) {
    return "Bearer " +
        jwt.sign(payload, secretKey, {
            expiresIn: 60 * 60,
        });
};

// 验证token
verifyToken = function (req, res, next) {
    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, secretKey, function (err, decoded) {
        if (err) {
            console.log("verify error", err);
            return res.json({code: "404", msg: "token无效"});
        }
        console.log("verify decoded", decoded);
        next();
    });
};

app.post("/api/register",
    [
        body('account').notEmpty().withMessage("账号不得为空").isAscii().withMessage("账号不符合要求"),
        body('username').notEmpty().withMessage("用户名不得为空"),
        body('password').notEmpty().withMessage("密码不得为空")
    ], (req, res, next) => {
        const err = validationResult(req)
        if (!err.isEmpty()) {
            const [{msg}] = err.errors
            res.status(400).json({
                code: "400",
                msg: msg,
            })
        } else {
            globals.User.count({
                where: {
                    account: req.body.account,
                }
            }).then(count => {
                if (count >= 1) {
                    res.json({code: "401", msg: "user already exists"});
                } else {
                    globals.User.create({
                        username: req.body.username,
                        account: req.body.account,
                        password: req.body.password,
                        register_ip: globals.getClientIp(req),
                    }).then((result) => {
                        res.json({
                            code: 200,
                            message: '用户插入成功',
                            result: [{
                                username: result.username,
                                account: result.account,
                                password: result.password,
                                avatar: result.avatar,
                                name: result.name,
                                register_ip: result.register_ip,
                                register_time: result.register_time,
                                vip_time: result.vip_time,
                                token: generateToken({
                                    username: result.account,
                                    password: result.password,
                                    avatar: result.avatar
                                }),
                            }]
                        });
                    })
                }
            }).catch(error => {
                res.json({code: "401", msg: "查询数据库出现错误" + error.message});
                globals.User.sync().then(r => {
                    console.debug(r)
                }).catch(
                    error => {
                        console.error(err)
                    }
                )
            });
        }
    });

app.get("/admin", (req, res) => {
    res.sendFile(resolve(__dirname, 'client/dist/admin', 'index.html'));
})

app.use("/", routes); //新增
app.listen(3000, () => {
    console.log("server is running");
});

try {
    globals.mysql.authenticate().then(r => console.log("Mysql authenticated!"));
} catch (e) {
    console.error(e);
}
