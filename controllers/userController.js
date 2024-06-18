exports.list = function (req, res) {
    res.json({
        //发送json数据类型
        list: [
            {
                name: "12",
                id: 1,
            },
            {
                name: "1233",
                id: 2,
            },
        ],
    });
}

exports.deleteUser = function (req, res) {
    res.send("Got a DELETE request at /user"); //发送各种类型的响应
}
