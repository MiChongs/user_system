const global = require("../global/index")
exports.list = async function (req, res) {
    const query = new global.ipRegion();
    const result = await query.search(global.getClientIp(req))
    if (!req.headers.authorization) {
        res.json({
            code: '201',
            message: '用户未授权',
            region: [{result: result, ip: global.getClientIp(req)}]
        })
        return
    }
    await global.User.findAll().then(result => {
        res.json({
            code: "200",
            message: "获取所有数据成功",
            //发送json数据类型
            list: JSON.stringify(result, null, 2),
        });
    }).catch(error => {
        res.json({
            code: "500",
            message: error,
        })
    });
}

exports.register = async function (req, res) {

}

exports.deleteUser = function (req, res) {
    res.send("Got a DELETE request at /user"); //发送各种类型的响应
}
