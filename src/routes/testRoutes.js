const express = require("express");
const router = express.Router();
const testController = require("../controllers/testController");

// Authentication routes
router.post("/upload-image", testController.uploadImage);
router.get("/connection", testController.connectionCheck);
router.post("/image-to-base", testController.imageUrlToBase);
router.get("/delete-folder", testController.deleteFolder);

module.exports = router;
