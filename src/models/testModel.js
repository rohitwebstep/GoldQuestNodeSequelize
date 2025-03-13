const sequelize = require("../config/db"); // Assuming Sequelize is configured here
const { QueryTypes } = require("sequelize");

const Test = {
  connectionCheck: async (callback) => {
    try {
      console.log("Model Step 1: Starting connection setup.");

      const sql = `
        SELECT * FROM \`app_info\`
        WHERE \`status\` = 1 AND \`interface_type\` = ?
        ORDER BY \`updated_at\` DESC
        LIMIT 1
      `;
      console.log("Model Step 2: SQL query prepared:", sql);

      const [results] = await sequelize.query(sql, {
        replacements: ["backend"],
        type: sequelize.QueryTypes.SELECT, // Ensures only data is returned
      });

      console.log("Model Step 3: Query executed successfully. Results:", results);

      if (results.length === 0) {
        console.log("Model Step 4: No matching entry found in the database.");
        return callback(null, null);
      }

      console.log("Model Step 5: Matching entry found. Returning result:", results[0]);
      return callback(null, results[0]);

    } catch (error) {
      console.error("Model Step 6: Database query error:", error);
      return callback(error, null);
    }
  },
};

module.exports = Test;
