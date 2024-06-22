const crypto = require("crypto");
const global = require("../global");
const bcrypt = require("bcrypt");
const {validationResult} = require("express-validator");

exports.create = (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findOne({
            where: {
                id: req.body.id,
            }
        }).then(result => {
            if (result != null) {
                res.status(401).json({
                    code: 401,
                    message: '该应用已存在'
                })
            } else {
                global.App.create({
                    id: req.body.id,
                    name: req.body.name,
                    key: bcrypt.hashSync(req.body.id + req.body.id, 10),
                }).then(result => {
                    res.status(200).json({
                        code: 200,
                        message: result,
                    })
                }).catch(error => {
                    res.status(400).json({
                        code: 400,
                        message: error,
                    })
                })
            }
        }).catch(error => {
            res.status(500).json({
                code: 500,
                message: error
            })
        })
    }
}