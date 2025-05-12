const express = require('express');
const router = express.Router();
const tatDelayController = require('../../controllers/admin/tatDelayController');

// Authentication routes
router.get('/list', tatDelayController.list);
router.get('/send-auto-notification', tatDelayController.sendAutoNotification);

module.exports = router;
