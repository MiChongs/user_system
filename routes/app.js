const express = require("express");
const appController = require('../controllers/appControllers');
const {body} = require("express-validator");

const router = express.Router(); //模块化路由

router.post("/create", [
    body("name").not().isEmpty().withMessage("应用名称是必须的"),
    body("id").not().isEmpty().withMessage("应用ID是必须的"),
], appController.create);

module.exports = router;
