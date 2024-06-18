const express = require("express");
const routes = require("./routes"); //新增
const app = express();
const sequelize = require('sequelize')
const {Sequelize, DataTypes} = require("sequelize");
const globals = require('./global/index')

const cors = require('cors');
app.use(cors());
app.use(globals.bodyParser.json());
app.use(globals.bodyParser.urlencoded({extended: false}));
const jwt = require("jsonwebtoken");
const {join, resolve} = require("node:path");
const secretKey = "secretKey";
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

app.post("/", (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
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
    });
    const username = req.params.username;
    const password = req.params.password;
    const token = generateToken({username: username});
});

//删除
// app.get("/", (req, res) => {
//   res.send("Hello World");
// });
app.use(express.static(join(__dirname, 'client/dist')));

app.get("/admin", (req, res) => {
    res.sendFile(resolve(__dirname, 'client/dist/admin', 'index.html'));
})

app.get('*', (req, res) => {
    res.sendFile(resolve(__dirname, 'client/dist', 'index.html'));
});

app.use("/", routes); //新增
app.listen(3000, () => {
    console.log("server is running");
});

try {
    globals.mysql.authenticate().then(r => console.log("Mysql authenticated!"));
} catch (e) {
    console.error(e);
}
