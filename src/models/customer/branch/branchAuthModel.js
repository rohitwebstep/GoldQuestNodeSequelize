const {
  pool,
  startConnection,
  connectionRelease,
} = require("../../../config/db");

const Branch = {
  findByEmailOrMobile: (username, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      // Query the branches table first
      const sqlBranches = `
        SELECT 'branch' AS type, \`id\`, \`id\` AS branch_id, \`customer_id\`, \`name\`, \`name\` AS \`branch_name\`, \`email\`, \`status\`, \`login_token\`, \`token_expiry\`, \`otp\`, \`two_factor_enabled\`, \`otp_expiry\`
        FROM \`branches\`
        WHERE \`email\` = ?
      `;

      connection.query(sqlBranches, [username], (err, branchResults) => {
        if (err) {
          connectionRelease(connection);
          console.error("Database query error (branches):", err);
          return callback(
            { message: "Database query error (branches)", error: err },
            null
          );
        }

        if (branchResults.length > 0) {
          // If found in branches, return the result
          connectionRelease(connection);
          return callback(null, branchResults);
        }

        // If not found in branches, query the branch_sub_users table
        const sqlSubUsers =
          `SELECT 'sub_user' AS type, 
            sub_users.id, 
            sub_users.branch_id, 
            sub_users.customer_id, 
            sub_users.email, 
            sub_users.status, 
            sub_users.login_token, 
            sub_users.token_expiry, 
            branch.name AS branch_name 
     FROM branch_sub_users AS sub_users
     INNER JOIN branches AS branch ON branch.id = sub_users.branch_id
     WHERE sub_users.email = ?`;

        connection.query(sqlSubUsers, [username], (err, subUserResults) => {
          connectionRelease(connection);

          if (err) {
            console.error("Database query error (branch_sub_users):", err);
            return callback(
              {
                message: "Database query error (branch_sub_users)",
                error: err,
              },
              null
            );
          }

          if (subUserResults.length === 0) {
            // No record found in either table
            return callback(
              {
                message: "No branch or sub-user found with the provided email",
              },
              null
            );
          }

          // Found in branch_sub_users
          callback(null, subUserResults);
        });
      });
    });
  },

  findByEmailOrMobileAllInfo: (username, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      // Query the branches table first
      const sqlBranches = `
        SELECT 'branch' AS type, *
        FROM \`branches\`
        WHERE \`email\` = ?
      `;

      connection.query(sqlBranches, [username], (err, branchResults) => {
        if (err) {
          connectionRelease(connection);
          console.error("Database query error (branches):", err);
          return callback(
            { message: "Database query error (branches)", error: err },
            null
          );
        }

        if (branchResults.length > 0) {
          // If found in branches, return the result
          connectionRelease(connection);
          return callback(null, branchResults);
        }

        // If not found in branches, query the branch_sub_users table
        const sqlSubUsers = `
          SELECT 'sub_user' AS type, *
          FROM \`branch_sub_users\`
          WHERE \`email\` = ?
        `;

        connection.query(sqlSubUsers, [username], (err, subUserResults) => {
          connectionRelease(connection);

          if (err) {
            console.error("Database query error (branch_sub_users):", err);
            return callback(
              {
                message: "Database query error (branch_sub_users)",
                error: err,
              },
              null
            );
          }

          if (subUserResults.length === 0) {
            // No record found in either table
            return callback(
              {
                message: "No branch or sub-user found with the provided email",
              },
              null
            );
          }

          // Found in branch_sub_users
          callback(null, subUserResults);
        });
      });
    });
  },

  updatePasswordResetPermission: (status, branch_id, callback) => {
    const sql = `
      UPDATE \`branches\`
      SET \`can_request_password_reset\` = ?
      WHERE \`id\` = ?
    `;

    startConnection((err, connection) => {
      if (err) {
        console.error("Database connection error:", err);
        return callback({
          success: false,
          message: "Database connection failed",
          error: err
        }, null);
      }

      connection.query(sql, [status, branch_id], (queryErr, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (queryErr) {
          console.error("Database query error:", queryErr);
          return callback({
            success: false,
            message: "Failed to update password reset permission",
            error: queryErr
          }, null);
        }

        if (results.affectedRows === 0) {
          return callback({
            success: false,
            message: "No admin found with the provided ID or no update was necessary"
          }, null);
        }

        return callback(null, {
          success: true,
          message: `Password reset permission updated successfully to ${status ? 'Allowed' : 'Denied'}`,
          data: { affectedRows: results.affectedRows }
        });
      });
    });
  },

  setResetPasswordToken: (id, token, tokenExpiry, callback) => {
    const sql = `
      UPDATE \`branches\`
      SET 
        \`reset_password_token\` = ?, 
        \`password_token_expiry\` = ?,
        \`can_request_password_reset\` = ?,
        \`password_reset_request_count\` = 
          CASE 
            WHEN DATE(\`password_reset_requested_at\`) = CURDATE() 
            THEN \`password_reset_request_count\` + 1 
            ELSE 1 
          END,
        \`password_reset_requested_at\` = 
          CASE 
            WHEN DATE(\`password_reset_requested_at\`) = CURDATE() 
            THEN \`password_reset_requested_at\` 
            ELSE NOW() 
          END
      WHERE \`id\` = ?
    `;

    startConnection((err, connection) => {
      if (err) {
        console.error("Database connection error:", err);
        return callback({ success: false, message: "Database connection failed", error: err }, null);
      }

      connection.query(sql, [token, tokenExpiry, 1, id], (queryErr, results) => {
        connectionRelease(connection); // Ensure the connection is released

        if (queryErr) {
          console.error("Database query error:", queryErr);
          return callback({ success: false, message: "Failed to update reset password token", error: queryErr }, null);
        }

        if (results.affectedRows === 0) {
          return callback({ success: false, message: "No branch found with the provided ID or no update required" }, null);
        }

        return callback(null, {
          success: true,
          message: "Password reset token updated successfully",
          data: { affectedRows: results.affectedRows }
        });
      });
    });
  },

  validatePassword: (email, password, type, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      let sql;
      if (type === "branch") {
        sql = `
        SELECT \`id\`
        FROM \`branches\`
        WHERE \`email\` = ?
        AND (\`password\` = MD5(?) OR \`password\` = ?)
      `;
      } else if (type === "sub_user") {
        sql = `
        SELECT \`id\`
        FROM \`branch_sub_users\`
        WHERE \`email\` = ?
        AND (\`password\` = MD5(?) OR \`password\` = ?)
      `;
      } else {
        return callback(
          { message: "Undefined user trying to login", error: err },
          null
        );
      }

      connection.query(sql, [email, password, password], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query failed:", err);
          return callback(
            { message: "Internal server error", error: err },
            null
          );
        }

        // Return true if a match is found, otherwise return false
        if (results.length > 0) {
          return callback(null, true);
        } else {
          return callback(null, false);
        }
      });
    });
  },

  updatePassword: (new_password, branch_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `UPDATE \`branches\` SET \`password\` = MD5(?), \`reset_password_token\` = null, \`login_token\` = null, \`token_expiry\` = null, \`password_token_expiry\` = null WHERE \`id\` = ?`;

      connection.query(sql, [new_password, branch_id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 77", err);
          return callback(
            {
              message: "An error occurred while updating the password.",
              error: err,
            },
            null
          );
        }

        // Check if the branch_id was found and the update affected any rows
        if (results.affectedRows === 0) {
          return callback(
            {
              message:
                "Branch not found or password not updated. Please check the provided details.",
            },
            null
          );
        }

        callback(null, {
          message: "Password updated successfully.",
          affectedRows: results.affectedRows,
        });
      });
    });
  },

  updateOTP: (branch_id, otp, otp_expiry, callback) => {
    const sql = `UPDATE \`branches\` SET \`otp\` = ?, \`otp_expiry\` = ?,  \`reset_password_token\` = null, \`login_token\` = null, \`token_expiry\` = null, \`password_token_expiry\` = null WHERE \`id\` = ?`;

    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      connection.query(
        sql,
        [otp, otp_expiry, branch_id],
        (queryErr, results) => {
          connectionRelease(connection); // Release the connection

          if (queryErr) {
            console.error("Database query error: 8", queryErr);
            return callback(
              {
                message: "An error occurred while updating the password.",
                error: queryErr,
              },
              null
            );
          }

          // Check if the branch_id was found and the update affected any rows
          if (results.affectedRows === 0) {
            return callback(
              {
                message:
                  "Branch not found or password not updated. Please check the provided details.",
              },
              null
            );
          }

          callback(null, {
            message: "Password updated successfully.",
            affectedRows: results.affectedRows,
          });
        }
      );
    });
  },

  updateToken: (id, token, tokenExpiry, type, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback &&
          callback({ message: "Failed to connect to the database", error: err }, null);
      }

      let sql;
      if (type === "branch") {
        sql = `
        UPDATE \`branches\`
        SET \`login_token\` = ?, \`token_expiry\` = ?
        WHERE \`id\` = ?
      `;
      } else if (type === "sub_user") {
        sql = `
        UPDATE \`branch_sub_users\`
        SET \`login_token\` = ?, \`token_expiry\` = ?
        WHERE \`id\` = ?
      `;
      } else {
        if (callback) {
          return callback({ message: "Undefined user trying to login" }, null);
        }
        return; // Prevent calling an undefined function
      }

      connection.query(sql, [token, tokenExpiry, id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 78", err);
          return callback &&
            callback({ message: "Database update error", error: err }, null);
        }

        if (results.affectedRows === 0) {
          return callback &&
            callback({ message: "Token update failed. Branch not found or no changes made." }, null);
        }

        callback && callback(null, results);
      });
    });
  },
  
  validateLogin: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `
        SELECT \`login_token\`, \`token_expiry\`
        FROM \`branches\`
        WHERE \`id\` = ?
      `;

      connection.query(sql, [id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 79", err);
          return callback(
            { message: "Database query error", error: err },
            null
          );
        }

        if (results.length === 0) {
          return callback({ message: "Branch not found" }, null);
        }

        callback(null, results);
      });
    });
  },

  // Clear login token and token expiry
  logout: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `
          UPDATE \`branches\`
          SET \`login_token\` = NULL, \`token_expiry\` = NULL
          WHERE \`id\` = ?
        `;

      connection.query(sql, [id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 80", err);
          return callback(
            { message: "Database update error", error: err },
            null
          );
        }

        if (results.affectedRows === 0) {
          return callback(
            {
              message:
                "Token clear failed. Branch not found or no changes made.",
            },
            null
          );
        }

        callback(null, results);
      });
    });
  },

  findById: (sub_user_id, branch_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      let sql = "";
      let queryParams = [];

      // Build SQL query based on the presence of sub_user_id
      if (sub_user_id != null && String(sub_user_id).trim() !== "") {
        sql = `
          SELECT \`id\`, \`customer_id\`, \`email\`, \`status\`, \`login_token\`, \`token_expiry\`
          FROM \`branch_sub_users\`
          WHERE \`branch_id\` = ? AND \`id\` = ?
        `;
        queryParams = [branch_id, sub_user_id];
      } else {
        sql = `
          SELECT \`id\`, \`customer_id\`, \`name\`, \`email\`, \`status\`, \`login_token\`, \`token_expiry\`
          FROM \`branches\`
          WHERE \`id\` = ?
        `;
        queryParams = [branch_id];
      }

      console.log(`SQL Query:`, sql);
      console.log(`Branch ID: ${branch_id}, Sub User ID: ${sub_user_id}`);

      // Execute the query
      connection.query(sql, queryParams, (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error:", err);
          return callback(
            { message: "Database query error", error: err },
            null
          );
        }

        // Handle case where no records are found
        if (results.length === 0) {
          return callback({ message: "Branch or sub_user not found" }, null);
        }

        // Return the first result (should be one result if ID is unique)
        callback(null, results[0]);
      });
    });
  },

  isBranchActive: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `
        SELECT \`status\`
        FROM \`branches\`
        WHERE \`id\` = ?
      `;

      connection.query(sql, [id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 82", err);
          return callback(
            { message: "Database query error", error: err },
            null
          );
        }
        if (results.length === 0) {
          return callback({ message: "Branch not found" }, null);
        }

        const isActive = results[0].status == 1;
        callback(null, { isActive });
      });
    });
  },

  isBranchSubUserActive: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `
        SELECT \`status\`
        FROM \`branch_sub_users\`
        WHERE \`id\` = ?
      `;

      connection.query(sql, [id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 82", err);
          return callback(
            { message: "Database query error", error: err },
            null
          );
        }
        if (results.length === 0) {
          return callback({ message: "Branch not found" }, null);
        }

        const isActive = results[0].status == 1;
        callback(null, { isActive });
      });
    });
  },

  isCustomerActive: (customerID, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql = `
      SELECT \`status\`
      FROM \`customers\`
      WHERE \`id\` = ?
    `;

      connection.query(sql, [customerID], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 83", err);
          return callback(
            { message: "Database query error", error: err },
            null
          );
        }
        if (results.length === 0) {
          return callback({ message: "Customer not found" }, null);
        }

        const isActive = results[0].status == 1;
        callback(null, { isActive });
      });
    });
  },
};

module.exports = Branch;
