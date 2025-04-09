const { sequelize } = require("../config/db");
const { QueryTypes } = require("sequelize");

const Test = {
  connectionCheck: async (callback) => {
    try {
      console.log("Model Step 1: Initiating connection check.");

      const sql = `
            SELECT * FROM \`app_info\`
            WHERE \`status\` = 1 AND \`interface_type\` = ?
            ORDER BY \`updated_at\` DESC
            LIMIT 1
        `;
      console.log("Model Step 2: SQL query prepared.");

      const results = await sequelize.query(sql, {
        replacements: ["backend"],
        type: QueryTypes.SELECT,
      });

      if (!results.length) {
        console.warn("Model Step 3: No matching record found.");
        return callback(null, null);
      }

      console.log("Model Step 4: Matching record found.", results[0]);
      callback(null, results[0]);
    } catch (error) {
      console.error("Model Step 5: Error occurred during connection check.", error);
      callback(error, null);
    }
  },

  testCheck: async (callback) => {
    try {
      console.log("Model Step 1: Initiating connection check.");

      const sql = `
            SELECT GROUP_CONCAT(id) AS ids
            FROM client_applications
            WHERE status = 'completed' AND customer_id = 37;
        `;
      console.log("Model Step 2: SQL query prepared.");

      const results = await sequelize.query(sql, {
        replacements: ["backend"],
        type: QueryTypes.SELECT,
      });

      if (!results.length) {
        console.warn("Model Step 3: No matching record found.");
        return callback(null, null);
      }

      console.log("Model Step 4: Matching record found.", results[0]);
      callback(null, results);
    } catch (error) {
      console.error("Model Step 5: Error occurred during connection check.", error);
      callback(error, null);
    }
  },

};

module.exports = Test;
