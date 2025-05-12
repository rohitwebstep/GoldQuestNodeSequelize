const cron = require("node-cron");
const tatDelayController = require("../controllers/admin/tatDelayController");

console.log("Cron job initialized...");

// Schedule cron job to run daily at 8 AM, 12 PM, 4 PM, 8 PM, and 11 PM
cron.schedule("0 8,12,16,20,23 * * *", () => {
    console.log("Executing automated TAT delay notifications...");

    // Trigger auto-notification process
    tatDelayController.sendAutoNotification(
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
// pm2 start src/cron-jobs/tatDelayNotifications.js --name tat-delay-job
