const {
  pool,
  startConnection,
  connectionRelease,
} = require("../../../config/db");

const subUser = {
  create: (
    branchId,
    customerId,
    subUserId,
    clientSpoc,
    remarks,
    savedZipPaths,
    callback
  ) => {
    const joinedPaths =
      Array.isArray(savedZipPaths) && savedZipPaths.length > 0
        ? savedZipPaths.join(", ")
        : "";
    const correctedPath = joinedPaths.replace(/\\\\/g, "/");
    // Start DB connection
    startConnection((err, connection) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      // SQL query to check if the table exists
      const checkTableExistSql = `SHOW TABLES LIKE 'branch_bulk_uploads'`;

      connection.query(checkTableExistSql, (err, results) => {
        if (err) {
          console.error("Error checking table existence:", err);
          connectionRelease(connection);
          return callback(
            { message: "Error checking table existence", error: err },
            null
          );
        }

        // If table does not exist, create it
        if (results.length === 0) {
          const createTableSql = `
            CREATE TABLE \`branch_bulk_uploads\` (
              \`id\` INT AUTO_INCREMENT PRIMARY KEY,
              \`branch_id\` INT NOT NULL,
              \`sub_user_id\` INT DEFAULT NULL,
              \`customer_id\` INT NOT NULL,
              \`client_spoc\` INT NOT NULL,
              \`zip\` TEXT DEFAULT NULL,
              \`remarks\` TEXT DEFAULT NULL,
              \`is_notification_read\` TINYINT(1) DEFAULT 0,
              \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              KEY \`branch_id\` (\`branch_id\`),
              KEY \`sub_user_id\` (\`sub_user_id\`),
              KEY \`customer_id\` (\`customer_id\`),
              CONSTRAINT \`fk_branch_bulk_uploads_branch_id\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\` (\`id\`) ON DELETE CASCADE,
              CONSTRAINT \`fk_branch_bulk_uploads_sub_user_id\` FOREIGN KEY (\`sub_user_id\`) REFERENCES \`branch_sub_users\` (\`id\`) ON DELETE CASCADE,
              CONSTRAINT \`fk_branch_bulk_uploads_customer_id\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
          `;

          connection.query(createTableSql, (err, results) => {
            if (err) {
              console.error("Error creating table:", err);
              connectionRelease(connection);
              return callback(
                { message: "Error creating table", error: err },
                null
              );
            }
            insertData();
          });
        } else {
          // Table exists, proceed with insert
          insertData();
        }
      });

      // Function to insert data into the table
      const insertData = () => {
        const insertSql = `
              INSERT INTO \`branch_bulk_uploads\` (
                \`branch_id\`,
                \`sub_user_id\`,
                \`customer_id\`,
                \`client_spoc\`,
                \`zip\`,
                \`remarks\`
              ) VALUES (?, ?, ?, ?, ?, ?)
            `;

        const values = [
          branchId,
          subUserId || null,
          customerId,
          clientSpoc,
          correctedPath,
          remarks,
        ];

        connection.query(insertSql, values, (err, results) => {
          // Release connection after query execution
          connectionRelease(connection);

          if (err) {
            console.error("Database query error: 109", err);
            return callback(err, null);
          }
          // Assuming you want to send the `new_application_id` back, you should extract it from `results.insertId`
          const bulk_inserted_id = results.insertId;

          return callback(null, results);
        });
      };
    });
  },

  getBulkById: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const sql = "SELECT * FROM `branch_bulk_uploads` WHERE id = ?";
      connection.query(sql, [id], (err, results) => {
        connectionRelease(connection); // Ensure the connection is released

        if (err) {
          console.error("Database query error: 113", err);
          return callback(err, null);
        }
        callback(null, results[0]);
      });
    });
  },

  list: (branch_id, callback) => {
    // Start DB connection
    startConnection((err, connection) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      // SQL query to fetch sub-user details for a specific branch
      const sqlClient = `
          SELECT id, client_spoc, zip, remarks, created_at
          FROM branch_bulk_uploads
          WHERE branch_id = ?
        `;

      connection.query(sqlClient, [branch_id], (err, bulkResults) => {
        // Release connection after query execution
        connectionRelease(connection);

        if (err) {
          console.error("Database query error: 110", err);
          return callback(
            { message: "Error retrieving bulk entries", error: err },
            null
          );
        }
        // Return the list of bulk entries
        return callback(null, bulkResults);
      });
    });
  },

  delete: (id, callback) => {
    // Start database connection
    startConnection((err, connection) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      // SQL query to delete the record
      const deleteSql = `DELETE FROM branch_bulk_uploads WHERE id = ?`;

      connection.query(deleteSql, [id], (err, results) => {
        // Release the connection after query execution
        connectionRelease(connection);

        if (err) {
          console.error("Database query error:", err);
          return callback(
            {
              message: "An error occurred while deleting the record.",
              error: err,
            },
            null
          );
        }

        // Check if any rows were affected (i.e., if the record was deleted)
        if (results.affectedRows === 0) {
          return callback(
            { message: "No record found with the provided ID." },
            null
          );
        }

        // Successfully deleted
        callback(null, {
          message: "Record deleted successfully.",
          affectedRows: results.affectedRows,
        });
      });
    });
  },
};

module.exports = subUser;
