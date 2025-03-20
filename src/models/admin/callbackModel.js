const { pool, startConnection, connectionRelease } = require("../../config/db");

const Callback = {
  list: (callback) => {
    const sql = `
      SELECT 
        cr.*,
        b.name AS branch_name, 
        c.name AS customer_name, 
        c.mobile AS mobile, 
        cm.single_point_of_contact AS single_point_of_contact 
      FROM \`callback_requests\` cr
      INNER JOIN \`branches\` b ON b.id = cr.branch_id
      INNER JOIN \`customers\` c ON c.id = cr.customer_id
      INNER JOIN \`customer_metas\` cm ON cm.customer_id = cr.customer_id
      ORDER BY cr.\`requested_at\` DESC
    `;

    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      connection.query(sql, (queryErr, results) => {
        connectionRelease(connection); // Release the connection

        if (queryErr) {
          console.error("Database query error: 47", queryErr);
          return callback(queryErr, null);
        }

        callback(null, results);
      });
    });
  },
};

module.exports = Callback;
