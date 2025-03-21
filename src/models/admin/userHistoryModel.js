const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const moment = require("moment"); // Ensure you have moment.js installed

const tatDelay = {
  index: async (callback) => {
    try {
      // SQL query to retrieve admin login logs with admin details
      const SQL = `
            SELECT 
                admin_login_logs.*, 
                admins.name AS admin_name, 
                admins.profile_picture AS profile_picture, 
                admins.email AS admin_email, 
                admins.mobile AS admin_mobile 
            FROM \`admin_login_logs\`
            INNER JOIN \`admins\` ON \`admin_login_logs\`.admin_id = \`admins\`.id
            ORDER BY \`admin_login_logs\`.\`created_at\` DESC
        `;

      const results = await sequelize.query(SQL, {
        type: QueryTypes.SELECT,
      });

      // Return an empty array instead of a message if no records are found
      return callback(null, results.length > 0 ? results : []);
    } catch (error) {
      return callback(error, null);
    }
  },

  activityList: async (logId, adminId, callback) => {
    try {
      console.log("Entering activityList function with logId:", logId, "adminId:", adminId);

      // SQL query to retrieve the first login log
      const initialLoginQuery = `
            SELECT * FROM \`admin_login_logs\` 
            WHERE \`id\` = ? AND \`action\` = ? AND \`result\` = ? AND \`admin_id\` = ? 
            LIMIT 1
        `;

      const currentLoginResults = await sequelize.query(initialLoginQuery, {
        replacements: [logId, "login", "1", adminId],
        type: QueryTypes.SELECT,
      });

      if (currentLoginResults.length === 0) {
        console.log("No current login records found for logId:", logId, "and adminId:", adminId);
        return callback(null, []);
      }

      const currentLogData = currentLoginResults[0];
      console.log("Current login log data found:", currentLogData);

      // SQL query to retrieve the next login log (using created_at for sequence)
      const nextLoginQuery = `
            SELECT * FROM \`admin_login_logs\` 
            WHERE \`created_at\` > ? AND \`action\` = ? AND \`result\` = ? AND \`admin_id\` = ? 
            ORDER BY \`created_at\` ASC 
            LIMIT 1
        `;

      const nextLoginResults = await sequelize.query(nextLoginQuery, {
        replacements: [currentLogData.created_at, "login", "1", adminId],
        type: QueryTypes.SELECT,
      });

      let nextLogDatacreated_at = nextLoginResults.length > 0 ? nextLoginResults[0].created_at : "9999-12-31";
      console.log("Next login log data found:", nextLoginResults.length > 0 ? nextLoginResults[0] : "None");

      // SQL query to retrieve admin activity logs within the time range
      const activityQuery = `
            SELECT * FROM \`admin_activity_logs\` 
            WHERE \`admin_id\` = ? 
            AND \`created_at\` BETWEEN ? AND ? 
            ORDER BY \`created_at\` DESC
        `;

      const activityResults = await sequelize.query(activityQuery, {
        replacements: [adminId, currentLogData.created_at, nextLogDatacreated_at],
        type: QueryTypes.SELECT,
      });

      console.log("Activity logs found:", activityResults.length > 0 ? activityResults : "None");

      return callback(null, activityResults);
    } catch (error) {
      console.error("Error in activityList function:", error);
      return callback(error, null);
    }
  },

};

// Helper function to handle query errors and release connection
function handleQueryError(err, connection, callback) {
  console.error("Query error:", err);
  connectionRelease(connection);
  callback(err, null);
}

module.exports = tatDelay;
