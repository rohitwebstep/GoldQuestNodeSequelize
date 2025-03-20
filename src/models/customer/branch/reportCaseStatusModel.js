const crypto = require("crypto");
const {
  pool,
  startConnection,
  connectionRelease,
} = require("../../../config/db");

const reportCaseStatus = {
  reportFormJsonByServiceID: (service_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return callback(err, null);
      }

      // Use a parameterized query to prevent SQL injection
      const sql = "SELECT `json` FROM `report_forms` WHERE `id` = ?";
      connection.query(sql, [service_id], (queryErr, results) => {
        connectionRelease(connection); // Ensure the connection is released
        if (queryErr) {
          console.error("Database query error: 123", queryErr);
          return callback(queryErr, null);
        }
        // Assuming `results` is an array, and we want the first result
        callback(null, results[0] || null); // Return single application or null if not found
      });
    });
  },

  annexureData: (client_application_id, db_table, callback) => {
    startConnection((err, connection) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return callback(err, null);
      }

      // Check if the table exists in the information schema
      const checkTableSql = `
        SELECT COUNT(*) AS count 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = ?`;

      connection.query(checkTableSql, [db_table], (checkErr, results) => {
        if (checkErr) {
          console.error(
            "Database error while checking table existence:",
            checkErr
          );
          connectionRelease(connection);
          return callback(checkErr, null);
        }
        // If the table does not exist, return an error
        if (results[0].count === 0) {
          const createTableSql = `
            CREATE TABLE \`${db_table}\` (
              \`id\` bigint(20) NOT NULL AUTO_INCREMENT,
              \`cmt_id\` bigint(20) NOT NULL,
              \`client_application_id\` bigint(20) NOT NULL,
              \`branch_id\` int(11) NOT NULL,
              \`customer_id\` int(11) NOT NULL,
              \`status\` ENUM(
                          'nil', 'initiated', 'hold', 'closure_advice', 'wip', 'insuff', 'completed', 
                          'stopcheck', 'active_employment', 'not_doable', 'candidate_denied', 
                          'completed_green', 'completed_orange', 'completed_red', 'completed_yellow', 'completed_pink'
                        ) DEFAULT NULL,
              \`is_submitted\` TINYINT(1) DEFAULT 0,
              \`is_billed\` TINYINT(1) DEFAULT 0,
              \`billed_date\` TIMESTAMP NULL DEFAULT NULL,
              \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (\`id\`),
              KEY \`client_application_id\` (\`client_application_id\`),
              KEY \`cmt_application_customer_id\` (\`customer_id\`),
              KEY \`cmt_application_cmt_id\` (\`cmt_id\`),
              CONSTRAINT \`fk_${db_table}_client_application_id\` FOREIGN KEY (\`client_application_id\`) REFERENCES \`client_applications\` (\`id\`) ON DELETE CASCADE,
              CONSTRAINT \`fk_${db_table}_customer_id\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE,
              CONSTRAINT \`fk_${db_table}_cmt_id\` FOREIGN KEY (\`cmt_id\`) REFERENCES \`cmt_applications\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

          connection.query(createTableSql, (createErr) => {
            if (createErr) {
              console.error(`Error creating table "${db_table}":`, createErr);
              connectionRelease(connection);
              return callback(createErr);
            }
            fetchData();
          });
        } else {
          fetchData();
        }

        function fetchData() {
          // Now that we know the table exists, run the original query
          const sql = `SELECT * FROM \`${db_table}\` WHERE \`client_application_id\` = ?`;
          connection.query(
            sql,
            [client_application_id],
            (fetchErr, results) => {
              connectionRelease(connection); // Ensure the connection is released
              if (fetchErr) {
                console.error("Database query error: 124", fetchErr);
                return callback(fetchErr, null);
              }
              // Return the first result or null if not found
              callback(null, results[0] || null);
            }
          );
        }
      });
    });
  },
};

module.exports = reportCaseStatus;
