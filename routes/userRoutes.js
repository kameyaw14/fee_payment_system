import express from "express";

const userRouter = express.Router();

userRouter.get("/users", (req, res) => {
  res.status(200).json({
    success: true,
    message: "User route",
  });
});

export default userRouter;
