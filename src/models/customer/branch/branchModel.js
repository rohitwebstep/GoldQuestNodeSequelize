const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const Branch = {
  isEmailUsedBefore: (email, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const emailCheckSql = `
        SELECT COUNT(*) as count
        FROM \`branches\`
        WHERE \`email\` = ?
      `;

      connection.query(emailCheckSql, [email], (err, emailCheckResults) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Error checking email in branch:", err);
          return callback(err, null);
        }

        const emailExists = emailCheckResults[0].count > 0;
        return callback(null, emailExists);
      });
    });
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

  callbackRequest: (branch_id, customer_id, callback) => {
    // Start a connection to the database
    startConnection((err, connection) => {
      if (err) {
        return callback(
          {
            message:
              "Unable to establish a connection to the database. Please try again later.",
            error: err,
          },
          null
        );
      }

      // SQL query to insert the callback request
      const sqlBranch = `
        INSERT INTO \`callback_requests\` (
          \`branch_id\`, \`customer_id\`
        ) VALUES (?, ?)
      `;

      // Execute the query with provided parameters
      connection.query(sqlBranch, [branch_id, customer_id], (err, results) => {
        // Release the database connection after query execution
        connectionRelease(connection);

        if (err) {
          console.error("Error while inserting callback request:", err);
          return callback(
            {
              message:
                "An error occurred while processing the callback request. Please contact support.",
              error: err,
            },
            null
          );
        }

        // Respond with the insert ID if the query is successful
        const insertId = results.insertId;
        callback(null, {
          message: "Callback request successfully registered.",
          insertId: insertId,
        });
      });
    });
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
  list: (callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `SELECT * FROM \`branches\``;
      connection.query(sql, (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 84", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
  },

  filterOptionsForClientApplications: (branch_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `
        SELECT \`status\`, COUNT(*) AS \`count\` 
        FROM \`client_applications\` 
        WHERE \`branch_id\` = ?
        GROUP BY \`status\`, \`branch_id\`
      `;
      connection.query(sql, [branch_id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 85", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
  },

  filterOptionsForCandidateApplications: (branch_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `
        SELECT \`status\`, COUNT(*) AS \`count\` 
        FROM \`candidate_applications\` 
        WHERE \`branch_id\` = ?
        GROUP BY \`status\`, \`branch_id\`
      `;
      connection.query(sql, [branch_id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 86", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
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

  getClientUniqueIDByBranchId: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = "SELECT `customer_id` FROM `branches` WHERE `id` = ?";
      connection.query(sql, [id], (err, results) => {
        if (err) {
          console.error("Database query error: 90", err);
          connectionRelease(connection);
          return callback(err, null);
        }

        if (results.length > 0 && results[0].customer_id) {
          const customerId = results[0].customer_id;
          const uniqueIdSql =
            "SELECT `client_unique_id` FROM `customers` WHERE `id` = ?";

          connection.query(
            uniqueIdSql,
            [customerId],
            (err, uniqueIdResults) => {
              connectionRelease(connection); // Ensure connection is released

              if (err) {
                console.error("Database query error: 91", err);
                return callback(err, null);
              }

              if (
                uniqueIdResults.length > 0 &&
                uniqueIdResults[0].client_unique_id
              ) {
                return callback(null, uniqueIdResults[0].client_unique_id);
              } else {
                return callback(null, false);
              }
            }
          );
        } else {
          connectionRelease(connection); // Ensure connection is released
          return callback(null, false);
        }
      });
    });
  },

  getClientNameByBranchId: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = "SELECT `customer_id` FROM `branches` WHERE `id` = ?";
      connection.query(sql, [id], (err, results) => {
        if (err) {
          console.error("Database query error: 92", err);
          connectionRelease(connection);
          return callback(err, null);
        }

        if (results.length > 0 && results[0].customer_id) {
          const customerId = results[0].customer_id;
          const uniqueIdSql = "SELECT `name` FROM `customers` WHERE `id` = ?";

          connection.query(
            uniqueIdSql,
            [customerId],
            (err, uniqueIdResults) => {
              connectionRelease(connection); // Ensure connection is released

              if (err) {
                console.error("Database query error: 93", err);
                return callback(err, null);
              }

              if (uniqueIdResults.length > 0 && uniqueIdResults[0].name) {
                return callback(null, uniqueIdResults[0].name);
              } else {
                return callback(null, false);
              }
            }
          );
        } else {
          connectionRelease(connection); // Ensure connection is released
          return callback(null, false);
        }
      });
    });
  },

  update: (id, name, email, password, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `
        UPDATE \`branches\`
        SET \`name\` = ?, \`email\` = ?, \`password\` = ?
        WHERE \`id\` = ?
      `;
      connection.query(sql, [name, email, password, id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 94", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
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

  active: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `
        UPDATE \`branches\`
        SET \`status\` = ?
        WHERE \`id\` = ?
      `;
      connection.query(sql, ["1", id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 96", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
  },

  inactive: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `
        UPDATE \`branches\`
        SET \`status\` = ?
        WHERE \`id\` = ?
      `;
      connection.query(sql, ["0", id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 97", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
  },

  delete: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `DELETE FROM \`branches\` WHERE \`id\` = ?`;
      connection.query(sql, [id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 98", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
  },
};

module.exports = Branch;
