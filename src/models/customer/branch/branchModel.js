const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const Branch = {
  isEmailUsedBefore: async (email, callback) => {
    try {
      const emailCheckSql = `
            SELECT COUNT(*) as count
            FROM \`branches\`
            WHERE \`email\` = ?
        `;

      const [results] = await sequelize.query(emailCheckSql, {
        replacements: [email],
        type: QueryTypes.SELECT,
      });

      const emailExists = results.count > 0;
      return callback(null, emailExists);

    } catch (error) {
      console.error("Error checking email existence:", error);
      return callback({ message: "Database query failed", error }, null);
    }
  },

  index: async (branch_id, callback) => {
    try {
      if (typeof callback !== "function") {
        console.error("Callback is not a function");
        return;
      }

      const query = `
        SELECT 
            ca.id AS client_application_id, 
            ca.application_id,
            ca.employee_id, 
            ca.name AS application_name,
            ca.status,
            ca.created_at,
            cmt.id AS cmt_id,
            cmt.* 
        FROM 
            client_applications ca
        LEFT JOIN 
            cmt_applications cmt ON ca.id = cmt.client_application_id
        WHERE 
            ca.branch_id = ?
        ORDER BY 
            ca.created_at DESC
      `;

      const results = await sequelize.query(query, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      const applicationsByStatus = results.reduce((grouped, app) => {
        if (!grouped[app.status]) {
          grouped[app.status] = {
            applicationCount: 0,
            applications: [],
          };
        }

        grouped[app.status].applications.push({
          client_application_id: app.client_application_id,
          application_name: app.name,
          application_id: app.application_id,
          created_at: app.created_at,
          cmtApplicationId: app.cmt_id,
          cmtOtherFields: app.other_fields, // Adjust based on actual field names from cmt
        });

        grouped[app.status].applicationCount += 1;

        return grouped;
      }, {});

      return callback(null, applicationsByStatus);

    } catch (error) {
      console.error("Database query error:", error);
      return callback({ status: false, message: "Database query error", error }, null);
    }
  },

  callbackRequest: async (branch_id, customer_id, callback) => {
    try {
      // SQL query to insert the callback request
      const sqlBranch = `
            INSERT INTO \`callback_requests\` (\`branch_id\`, \`customer_id\`)
            VALUES (?, ?)
        `;

      const [results] = await sequelize.query(sqlBranch, {
        replacements: [branch_id, customer_id],
        type: QueryTypes.INSERT,
      });

      // Respond with the insert ID if the query is successful
      const insertId = results; // `results` contains insertId in Sequelize
      callback(null, {
        message: "Callback request successfully registered.",
        insertId: insertId,
      });

    } catch (error) {
      console.error("Error inserting callback request:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

  create: async (BranchData, callback) => {
    try {
      const sql = `
        INSERT INTO branches (
          customer_id, name, email, is_head, password, permissions, mobile_number
        ) VALUES (?, ?, ?, ?, MD5(?), ?, ?)
      `;

      const permissions = `{"sub_user": true,"report_case_status": true,"ticket": true,"candidate_application": true,"client_application": true, "bulk_upload" : true, "delete_request" : true}`;

      const result = await sequelize.query(sql, {
        replacements: [
          BranchData.customer_id,
          BranchData.name,
          BranchData.email,
          BranchData.head,
          BranchData.password,
          permissions,
          BranchData.mobile_number || null,
        ],
        type: sequelize.QueryTypes.INSERT,
      });

      // result[0] contains the inserted ID
      const branchID = result[0].insertId;

      return callback(null, { insertId: branchID });
    } catch (err) {
      console.error("Database insertion error for branches:", err);
      return callback(
        { message: "Database insertion error for branches", error: err },
        null
      );
    }
  },

  list: async (callback) => {
    try {
      const sql = `SELECT * FROM \`branches\``;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error fetching branch list:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

  filterOptionsForClientApplications: async (branch_id, callback) => {
    try {
      const sql = `
            SELECT \`status\`, COUNT(*) AS \`count\` 
            FROM \`client_applications\` 
            WHERE \`branch_id\` = ?
            GROUP BY \`status\`, \`branch_id\`
        `;

      const results = await sequelize.query(sql, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error fetching client application filters:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

  filterOptionsForCandidateApplications: async (branch_id, callback) => {
    try {
      const sql = `
            SELECT \`status\`, COUNT(*) AS \`count\` 
            FROM \`candidate_applications\` 
            WHERE \`branch_id\` = ?
            GROUP BY \`status\`, \`branch_id\`
        `;

      const results = await sequelize.query(sql, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error fetching candidate application filters:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

  isEmailUsed: async (email, callback) => {
    try {
      const sql = `SELECT COUNT(*) AS count FROM branches WHERE email = ?`;

      const result = await sequelize.query(sql, {
        replacements: [email],
        type: QueryTypes.SELECT,
      });

      // If count > 0, email exists
      const isUsed = result[0].count > 0;
      return callback(null, isUsed);
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  isEmailUsedForUpdate: async (email, customer_id, callback) => {
    try {
      const branchQuery = `
        SELECT COUNT(*) AS count
        FROM branches
        WHERE email = ? AND customer_id != ?
      `;

      const result = await sequelize.query(branchQuery, {
        replacements: [email, customer_id],
        type: QueryTypes.SELECT,
      });

      const isUsed = result.count > 0; // If count > 0, email exists
      return callback(null, isUsed);
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  /*
  isEmailUsedForUpdate: (email, customer_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const branchQuery = `
        SELECT * 
        FROM \`branches\` 
        WHERE \`email\` = ? AND \`customer_id\` != ?`;

      const customerQuery = `
        SELECT \`emails\`
        FROM \`customers\`
        WHERE JSON_CONTAINS(\`emails\`, ?) AND \`id\` != ?`;

      // First, check in branches table
      connection.query(
        branchQuery,
        [email, customer_id],
        (err, branchResults) => {
          if (err) {
            connectionRelease(connection);
            console.error("Branches query error:", err);
            return callback(
              { message: "Database query error", error: err },
              null
            );
          }

          if (branchResults.length > 0) {
            // Email is found in branches table
            connectionRelease(connection);
            return callback(null, true);
          }

          // Next, check in customers table
          connection.query(
            customerQuery,
            [JSON.stringify(email), customer_id],
            (err, customerResults) => {
              connectionRelease(connection);

              if (err) {
                console.error("Customers query error:", err);
                return callback(
                  { message: "Customers query error", error: err },
                  null
                );
              }

              // Check if email is used in customers table
              const isUsed = customerResults.length > 0;
              return callback(null, isUsed);
            }
          );
        }
      );
    });
  },
  */

  listByCustomerID: async (customer_id, callback) => {
    try {
      const sql = `SELECT * FROM branches WHERE customer_id = ?`;

      const results = await sequelize.query(sql, {
        replacements: [customer_id],
        type: QueryTypes.SELECT,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  getBranchById: async (id, callback) => {
    try {
      if (typeof callback !== "function") {
        console.error("Callback is not a function");
        return;
      }

      const sql = `SELECT * FROM \`branches\` WHERE \`id\` = ?`;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      if (!results || results.length === 0) {
        return callback({
          status: false,
          message: "Branch not found",
          data: null,
        }, null);
      }

      return callback(null, results[0]);

    } catch (error) {
      console.error("Database query error:", error);
      return callback({ status: false, message: "Database query error", error }, null);
    }
  },

  getClientUniqueIDByBranchId: async (id, callback) => {
    try {
      // Fetch customer_id from branches
      const sql = "SELECT `customer_id` FROM `branches` WHERE `id` = ?";
      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      if (!results.length || !results[0].customer_id) {
        return callback(null, false); // No customer_id found
      }

      const customerId = results[0].customer_id;

      // Fetch client_unique_id from customers
      const uniqueIdSql = "SELECT `client_unique_id` FROM `customers` WHERE `id` = ?";
      const uniqueIdResults = await sequelize.query(uniqueIdSql, {
        replacements: [customerId],
        type: QueryTypes.SELECT,
      });

      if (!uniqueIdResults.length || !uniqueIdResults[0].client_unique_id) {
        return callback(null, false); // No unique_id found
      }

      return callback(null, uniqueIdResults[0].client_unique_id);
    } catch (error) {
      console.error("Database query error:", error);
      return callback(error, null);
    }
  },

  getClientNameByBranchId: async (id, callback) => {
    try {
      // Fetch customer_id from branches
      const sql = "SELECT `customer_id` FROM `branches` WHERE `id` = ?";
      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      if (!results.length || !results[0].customer_id) {
        return callback(null, false); // No customer_id found
      }

      const customerId = results[0].customer_id;

      // Fetch name from customers
      const nameSql = "SELECT `name` FROM `customers` WHERE `id` = ?";
      const nameResults = await sequelize.query(nameSql, {
        replacements: [customerId],
        type: QueryTypes.SELECT,
      });

      if (!nameResults.length || !nameResults[0].name) {
        return callback(null, false); // No name found
      }

      return callback(null, nameResults[0].name);
    } catch (error) {
      console.error("Database query error:", error);
      return callback(error, null);
    }
  },

  update: async (id, name, email, password, callback) => {
    try {
      const sql = `
            UPDATE \`branches\`
            SET \`name\` = ?, \`email\` = ?, \`password\` = ?
            WHERE \`id\` = ?
        `;

      const results = await sequelize.query(sql, {
        replacements: [name, email, password, id],
        type: QueryTypes.UPDATE,
      });
       const affectedRows = results[0];
      if (affectedRows === 0) {
        return callback({ message: "No branch found or no update made." }, null);
      }

      callback(null, { message: "Branch updated successfully.", affectedRows: results.affectedRows });
    } catch (error) {
      console.error("Error updating branch:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

  updateHeadBranchEmail: async (customer_id, name, email, callback) => {
    try {
      const sql = `
        UPDATE branches
        SET name = ?, email = ?
        WHERE is_head = ? AND customer_id = ?
      `;

      const results = await sequelize.query(sql, {
        replacements: [name, email, "1", customer_id],
        type: sequelize.QueryTypes.UPDATE,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  active: async (id, callback) => {
    try {
      const sql = `
            UPDATE \`branches\`
            SET \`status\` = ?
            WHERE \`id\` = ?
        `;

      const [results] = await sequelize.query(sql, {
        replacements: ["1", id],
        type: QueryTypes.UPDATE,
      });

      if (results.affectedRows === 0) {
        return callback({ message: "No branch found or status not changed." }, null);
      }

      callback(null, { message: "Branch activated successfully.", affectedRows: results.affectedRows });
    } catch (error) {
      console.error("Error activating branch:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

  inactive: async (id, callback) => {
    try {
      const sql = `
            UPDATE \`branches\`
            SET \`status\` = ?
            WHERE \`id\` = ?
        `;

      const [results] = await sequelize.query(sql, {
        replacements: ["0", id],
        type: QueryTypes.UPDATE,
      });

      if (results.affectedRows === 0) {
        return callback({ message: "No branch found or status not changed." }, null);
      }

      callback(null, { message: "Branch deactivated successfully.", affectedRows: results.affectedRows });
    } catch (error) {
      console.error("Error deactivating branch:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

  delete: async (id, callback) => {
    try {
      const sql = `DELETE FROM \`branches\` WHERE \`id\` = ?`;

      const [results] = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.DELETE,
      });

      if (results.affectedRows === 0) {
        return callback({ message: "Branch not found or already deleted." }, null);
      }

      callback(null, { message: "Branch deleted successfully.", affectedRows: results.affectedRows });
    } catch (error) {
      console.error("Error deleting branch:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

};

module.exports = Branch;
