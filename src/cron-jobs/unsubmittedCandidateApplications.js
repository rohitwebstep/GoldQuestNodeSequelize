const cron = require("node-cron");
const CEF = require("../models/customer/branch/cefModel");
const cefController = require("../controllers/customer/branch/candidate/cefController");

// Log to indicate that the cron job script has started
console.log("Cron job initialized...");

// Function to execute cron job logic
const executeCronJob = () => {
    console.log("Executing cron job for unsubmitted applications...");

    // Call the unsubmittedApplications function from the controller
    cefController.unsubmittedApplications(
        { body: {} }, // Simulated request object (empty body)
        {
            status: (code) => ({
                json: (response) => console.log(`Response (${code}):`, response),
            }),
            headersSent: false, // Ensure response headers are not sent prematurely
        }
    );
};

// **Run immediately when the script starts**
// executeCronJob();

// **Schedule a cron job to run at specific times daily**
cron.schedule("0 8,12,16,20,23 * * *", executeCronJob);

// Uncomment the following line to run the cron job every 5 seconds for testing/debugging
// cron.schedule("*/5 * * * * *", executeCronJob);

/*
PM2
pm2 start src/cron-jobs/unsubmittedCandidateApplications.js --name unsubmittedBGVCronJob
*/
