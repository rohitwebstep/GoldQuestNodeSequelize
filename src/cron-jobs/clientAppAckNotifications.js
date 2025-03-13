const cron = require("node-cron");
const Acknowledgement = require("../models/admin/acknowledgementModel");
const acknowledgementController = require("../controllers/admin/acknowledgementController");

console.log("Cron job initialized...");

// Schedule cron job to run daily at 8 AM, 12 PM, 4 PM, 8 PM, and 11 PM
cron.schedule("0 8,12,16,20,23 * * *", () => {
    console.log("Executing automated acknowledgement notifications...");

    // Trigger auto-notification process
    acknowledgementController.sendAutoNotification(
        { body: {} }, // Mock request object
        {
            status: (code) => ({
                json: (response) => console.log(`Response (${code}):`, response),
            }),
            headersSent: false, // Prevent premature response sending
        }
    );
});

// Uncomment below for testing: runs every 5 seconds
// cron.schedule("*/5 * * * * *", () => console.log("Test run: every 5 seconds"));
