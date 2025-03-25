const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const subUser = {
  create: async (
    branchId,
    customerId,
    subUserId,
    clientSpoc,
    remarks,
    savedZipPaths,
    callback
  ) => {
    try {
      const joinedPaths =
        Array.isArray(savedZipPaths) && savedZipPaths.length > 0
          ? savedZipPaths.join(", ")
          : "";
      const correctedPath = joinedPaths.replace(/\\\\/g, "/");

      // SQL query to check if the table exists
      const checkTableExistSql = `SHOW TABLES LIKE 'branch_bulk_uploads'`;

      const tableResults = await sequelize.query(checkTableExistSql, {
        type: QueryTypes.SELECT,
      });

      // If table does not exist, create it
      if (tableResults.length === 0) {
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

        await sequelize.query(createTableSql, { type: QueryTypes.RAW });
      }

      // Insert Data
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

      const values = [branchId, subUserId || null, customerId, clientSpoc, correctedPath, remarks];

      const [insertResults] = await sequelize.query(insertSql, {
        replacements: values,
        type: QueryTypes.INSERT,
      });

      callback(null, { message: "Data inserted successfully", insertId: insertResults });
    } catch (error) {
      console.error("Error in branch bulk uploads:", error);
      callback({ message: "Database operation failed", error }, null);
    }
  },
  getBulkById: async (id, callback) => {
    try {
      const sql = "SELECT * FROM `branch_bulk_uploads` WHERE id = ?";

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      callback(null, results.length > 0 ? results[0] : null);
    } catch (error) {
      console.error("Error fetching bulk upload:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

  list: async (branch_id, callback) => {
    try {
      // SQL query to fetch sub-user details for a specific branch
      const sqlClient = `
        SELECT id, client_spoc, zip, remarks, created_at
        FROM branch_bulk_uploads
        WHERE branch_id = ?
      `;

      const bulkResults = await sequelize.query(sqlClient, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      callback(null, bulkResults);
    } catch (error) {
      console.error("Error fetching bulk uploads:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

  delete: async (id, callback) => {
    try {
      // SQL query to delete the record
      const deleteSql = `DELETE FROM branch_bulk_uploads WHERE id = ?`;

      const [results, metadata] = await sequelize.query(deleteSql, {
        replacements: [id],
        type: QueryTypes.DELETE, // or QueryTypes.RAW
      });

      // Check if any rows were affected (i.e., if the record was deleted)
      if (metadata.affectedRows === 0) {
        return callback({ message: "No record found with the provided ID." }, null);
      }

      // Successfully deleted
      callback(null, {
        message: "Record deleted successfully.",
        affectedRows: metadata.affectedRows,
      });

    } catch (error) {
      console.error("Error deleting record:", error);
      callback({ message: "Database deletion failed", error }, null);
    }
  },

};

module.exports = subUser;
