const express = require("express");
const router = express.Router();
const testController = require("../controllers/testController");

// Authentication routes
router.post("/upload-image", testController.uploadImage);
router.post("/upload-image-by-url", testController.uploadImageByUrl);
router.get("/connection", testController.connectionCheck);
router.post("/image-to-base", testController.imageUrlToBase);
router.get("/delete-folder", testController.deleteFolder);
router.post("/nearby-locations-by-coordinates", testController.nearestLocationsByCoordinates);

module.exports = router;
