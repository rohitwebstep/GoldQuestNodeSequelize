const { pool, startConnection, connectionRelease } = require("../../config/db");

const WeeklyReport = {
  list: (startOfWeek, endOfWeek, callback) => {
    const sql = `
      SELECT * FROM \`client_applications\`
      WHERE \`created_at\` BETWEEN ? AND ?
    `;

    startConnection((err, connection) => {
      if (err) {
        console.error("Database connection error:", err);
        return callback(err, null);
      }

      // Execute the query with startOfWeek and endOfWeek as parameters
      connection.query(sql, [startOfWeek, endOfWeek], (queryErr, results) => {
        connectionRelease(connection);

        if (queryErr) {
          console.error("Database query error:", queryErr);
          return callback(queryErr, null);
        }

        callback(null, results);
      });
    });
  },
};

module.exports = WeeklyReport;
