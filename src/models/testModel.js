const { pool, startConnection, connectionRelease } = require("../config/db");

const Test = {
  connectionCheck: (callback) => {
    console.log("Model Step 1: Starting connection setup.");

    startConnection((err, connection) => {
      console.log("Model Step 2: Connection setup initiated.");
      connectionRelease(connection); // Release the connection (if needed)

      if (err) {
        console.error("Model Step 3: Failed to connect to the database:", err);
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      console.log("Model Step 4: Connection established successfully.");

      const sql = `
        SELECT * FROM \`app_info\`
        WHERE \`status\` = 1 AND \`interface_type\` = ?
        ORDER BY \`updated_at\` DESC
        LIMIT 1
      `;
      console.log("Model Step 5: SQL query prepared:", sql);

      connection.query(sql, ["backend"], (queryErr, results) => {
        console.log("Model Step 6: Query execution completed.");
        connectionRelease(connection); // Ensure the connection is released after the query

        if (queryErr) {
          console.error("Model Step 7: Database query error:", queryErr);
          return callback(queryErr, null);
        }

        console.log(
          "Model Step 8: Query executed successfully. Results:",
          results
        );

        if (results.length === 0) {
          console.log("Model Step 9: No matching entry found in the database.");
          return callback(null, null); // Return null if no entry is found
        }

        console.log(
          "Model Step 10: Matching entry found. Returning result:",
          results[0]
        );
        callback(null, results[0]); // Return the first result
      });
    });
  },
};

module.exports = Test;
