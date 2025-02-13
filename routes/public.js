const express = require("express");
const { query, param } = require("express-validator");
const publicController = require("../controllers/publicController");

const publicRouter = express.Router();

// 抽奖相关路由
const lotteryRouter = express.Router();

const userRouter = express.Router();

const geoRouter = express.Router();

// 获取抽奖列表
lotteryRouter.get(
  "/list",
  [
    query("appid")
      .notEmpty()
      .withMessage("应用ID不能为空")
      .isInt()
      .withMessage("应用ID必须是数字"),
    query("status")
      .optional()
      .isIn(["pending", "completed", "cancelled"])
      .withMessage("无效的状态值"),
    query("page").optional().isInt({ min: 1 }).withMessage("页码必须大于0"),
    query("pageSize")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("每页数量必须在1-100之间"),
  ],
  publicController.getLotteryList
);

// 获取抽奖详情
lotteryRouter.get(
  "/detail/:lotteryId",
  [
    param("lotteryId")
      .notEmpty()
      .withMessage("抽奖ID不能为空")
      .matches(/^LT[a-f0-9]{16}$/)
      .withMessage("无效的抽奖ID格式"),
    query("appid")
      .notEmpty()
      .withMessage("应用ID不能为空")
      .isInt()
      .withMessage("应用ID必须是数字"),
  ],
  publicController.getLotteryDetail
);

// 获取中奖名单
lotteryRouter.get(
  "/winners/:lotteryId",
  [
    param("lotteryId")
      .notEmpty()
      .withMessage("抽奖ID不能为空")
      .matches(/^LT[a-f0-9]{16}$/)
      .withMessage("无效的抽奖ID格式"),
    query("appid")
      .notEmpty()
      .withMessage("应用ID不能为空")
      .isInt()
      .withMessage("应用ID必须是数字"),
  ],
  publicController.getLotteryWinners
);

// 获取满足抽奖条件的用户列表
lotteryRouter.get(
  "/participants/:lotteryId",
  [
    param("lotteryId")
      .notEmpty()
      .withMessage("抽奖ID不能为空")
      .matches(/^LT[a-f0-9]{16}$/)
      .withMessage("无效的抽奖ID格式"),
    query("appid")
      .notEmpty()
      .withMessage("应用ID不能为空")
      .isInt()
      .withMessage("应用ID必须是数字"),
    query("page").optional().isInt({ min: 1 }).withMessage("页码必须大于0"),
    query("pageSize")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("每页数量必须在1-100之间"),
  ],
  publicController.getLotteryParticipants
);

userRouter.get(
  "/list/ban",
  [
    query("appid")
      .notEmpty()
      .withMessage("应用ID不能为空")
      .isInt()
      .withMessage("应用ID必须是数字"),
    query("page").optional().isInt({ min: 1 }).withMessage("页码必须大于0"),
    query("pageSize")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("每页数量必须在1-100之间"),
  ],
  publicController.getUserBanList
); // 获取封禁用户列表

geoRouter.get("/ip", publicController.getUserIPInfo);

// 注册抽奖路由
publicRouter.use("/lottery", lotteryRouter);

publicRouter.use("/user", userRouter);

publicRouter.use("/geo", geoRouter);

module.exports = publicRouter;
