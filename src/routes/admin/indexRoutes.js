const express = require("express");
const router = express.Router();
const authController = require("../../controllers/admin/authController");
const adminController = require("../../controllers/admin/adminController");
const permissionRoutes = require("./permissionRoutes");
const callbackRoutes = require("./callbackRoutes");

// Authentication routes
router.post("/login", authController.login);
router.post("/verify-two-factor", authController.verifyTwoFactor);
router.put("/update-password", authController.updatePassword);
router.post("/forgot-password-request", authController.forgotPasswordRequest);
router.post("/forgot-password", authController.forgotPassword);
router.get("/logout", authController.logout);
router.get("/list", adminController.list);
router.post("/verify-admin-login", authController.validateLogin);

router.get("/create-listing", adminController.createListing);
router.post("/create", adminController.create);
router.post("/upload", adminController.upload);
router.get("/list", adminController.list);
router.put("/update", adminController.update);
router.delete("/delete", adminController.delete);

router.use("/permission", permissionRoutes);
router.use("/callback", callbackRoutes);
module.exports = router;
