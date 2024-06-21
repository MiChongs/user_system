const express = require("express");
const userController = require("../controllers/userController");

const userRouter = express.Router();

userRouter.get("/list", userController.list);

userRouter.delete("/user", userController.deleteUser);

module.exports = userRouter;
