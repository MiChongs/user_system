const express = require("express");
const appController = require('../controllers/appControllers');
const {body} = require("express-validator");
const {jwt} = require("../global");

const router = express.Router(); //模块化路由

router.post("/create", [
    body("name").not().isEmpty().withMessage("应用名称是必须的"),
    body("id").not().isEmpty().withMessage("应用ID是必须的"),
], appController.create);

router.delete("/delete", [
    body("appid").not().isEmpty().withMessage("应用ID是必须的"),
], appController.deleteApp);

let verifyToken = async function (token) {
    let newToken = token
    if (newToken.indexOf('Bearer') >= 0) {
        newToken = newToken.replace('Bearer ', '')
    }
    await jwt.verify(newToken, process.env.ADMIN_PASSWORD, function (err, decoded) {
        if (err) {
            console.log("verify error", err);
            return false;
        }
        console.log("verify decoded", decoded);
        return true
    });
};

router.use((req, res, next) => {
//获取header中的token，并验证
    if (req.headers.authorization) {
        const flag = verifyToken(req.headers.authorization)
        if (!flag) {
            res.send({status: 'fail'})
        }
    }
//验证成功继续
    next()
})

module.exports = router;
