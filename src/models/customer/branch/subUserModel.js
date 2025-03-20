const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const subUser = {
  create: async (data, callback) => {
    try {
      console.log("Starting create function with data:", data);

      const { branch_id, customer_id, email, password } = data;
      console.log("Extracted variables - branch_id:", branch_id, "customer_id:", customer_id, "email:", email);

      // Check if the email already exists in branch_sub_users
      const checkSubUserEmailSql = `
        SELECT branch_id FROM \`branch_sub_users\`
        WHERE \`email\` = ?
      `;
      console.log("Executing query to check if email exists in branch_sub_users");

      const subUserResults = await sequelize.query(checkSubUserEmailSql, {
        replacements: [email],
        type: QueryTypes.SELECT,
      });

      console.log("Results from checking branch_sub_users:", subUserResults);

      if (subUserResults.length > 0) {
        const existingBranchId = subUserResults[0].branch_id;
        console.log("Email already exists in branch_sub_users with branch_id:", existingBranchId);

        return callback({
          message:
            existingBranchId === branch_id
              ? "This email is already registered under the same branch."
              : "This email is already associated with a different branch.",
        }, null);
      }

      // Check if the email already exists in branches
      const checkBranchEmailSql = `
        SELECT id FROM \`branches\`
        WHERE \`email\` = ?
      `;
      console.log("Executing query to check if email exists in branches");

      const branchResults = await sequelize.query(checkBranchEmailSql, {
        replacements: [email],
        type: QueryTypes.SELECT,
      });

      console.log("Results from checking branches:", branchResults);

      if (branchResults.length > 0) {
        console.log("Email is already registered as a branch email.");
        return callback({ message: "This email is already registered as a branch email." }, null);
      }

      // Insert new branch sub-user
      const insertSql = `
        INSERT INTO \`branch_sub_users\` (
          \`branch_id\`, \`customer_id\`, \`email\`, \`password\`
        ) VALUES (?, ?, ?, ?)
      `;
      const values = [branch_id, customer_id, email, password];
      console.log("Executing query to insert new branch sub-user with values:", values);

      const results = await sequelize.query(insertSql, {
        replacements: values,
        type: QueryTypes.INSERT,
      });

      console.log("Results from inserting branch sub-user:", results);
      const new_application_id = results[0];

      // Fetch branch and customer names
      const branchCustomerSql = `
        SELECT B.name AS branch_name, C.name AS customer_name 
        FROM \`branches\` AS B 
        INNER JOIN \`customers\` AS C 
        ON B.customer_id = C.id 
        WHERE B.id = ? AND C.id = ?
      `;
      console.log("Executing query to fetch branch and customer names for branch_id:", branch_id, "and customer_id:", customer_id);

      const branchCustomerResults = await sequelize.query(branchCustomerSql, {
        replacements: [branch_id, customer_id],
        type: QueryTypes.SELECT,
      });

      console.log("Results from fetching branch and customer names:", branchCustomerResults);

      if (branchCustomerResults.length === 0) {
        console.log("Branch or customer details not found.");
        return callback({ message: "Branch or customer details not found." }, null);
      }

      const { branch_name, customer_name } = branchCustomerResults[0];
      console.log("Found branch name:", branch_name, "and customer name:", customer_name);

      return callback(null, {
        new_application_id,
        branch_name,
        customer_name,
      });

    } catch (error) {
      console.error("Error in create function:", error);
      return callback({ message: "Database error", error }, null);
    }
  },

  getSubUserById: async (id, callback) => {
    try {
      const sql = `SELECT * FROM \`branch_sub_users\` WHERE \`id\` = ?`;
      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      return callback(null, results.length ? results[0] : null);
    } catch (error) {
      console.error("Error fetching sub-user by ID:", error);
      return callback(error, null);
    }
  },

  list: async (branch_id, callback) => {
    try {
      if (typeof callback !== "function") {
        console.error("Callback is not a function");
        return;
      }

      const sqlClient = `
        SELECT id, email
        FROM branch_sub_users
        WHERE branch_id = ?
      `;

      const subUserResults = await sequelize.query(sqlClient, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      if (!subUserResults || subUserResults.length === 0) {
        return callback(null, {
          message: "No sub-users found for this branch.",
          data: [],
        });
      }

      return callback(null, subUserResults);

    } catch (error) {
      console.error("Database query error:", error);
      return callback({ status: false, message: "Database query error", error }, null);
    }
  },

  updateEmail: async (data, callback) => {
    try {
      const { id, branch_id, customer_id, email } = data;

      // Check if the email already exists in `branch_sub_users`, specifying whether it's within the same or different branch
      const checkBranchEmailSql = `
        SELECT id, branch_id FROM \`branch_sub_users\` WHERE \`email\` = ? AND \`id\` != ?
      `;

      const branchResults = await sequelize.query(checkBranchEmailSql, {
        replacements: [email, id],
        type: QueryTypes.SELECT,
      });

      if (branchResults.length > 0) {
        const existingBranchId = branchResults[0].branch_id;
        const message =
          existingBranchId === branch_id
            ? "This email is already associated with another user in the **same branch**."
            : "This email is already associated with a user in a **different branch**.";

        return callback({ message }, null);
      }

      // Check if the email exists in the `branches` table
      const checkMainBranchEmailSql = `
        SELECT id FROM \`branches\` WHERE \`email\` = ?
      `;

      const mainBranchResults = await sequelize.query(checkMainBranchEmailSql, {
        replacements: [email],
        type: QueryTypes.SELECT,
      });

      if (mainBranchResults.length > 0) {
        return callback(
          { message: "This email is already associated with a **main branch**." },
          null
        );
      }

      // Proceed with updating the email
      const updateSql = `
        UPDATE \`branch_sub_users\`
        SET \`branch_id\` = ?, \`customer_id\` = ?, \`email\` = ?
        WHERE \`id\` = ?
      `;

      const updateResults = await sequelize.query(updateSql, {
        replacements: [branch_id, customer_id, email, id],
        type: QueryTypes.UPDATE,
      });

      if (updateResults[1] === 0) { // Sequelize returns [metadata, affectedRows]
        return callback(
          { message: "No record found to update or no changes made." },
          null
        );
      }

      return callback(null, {
        message: "Email updated successfully.",
        affectedRows: updateResults[1],
      });

    } catch (error) {
      console.error("Error updating email:", error);
      return callback({ message: "An error occurred while updating email." }, null);
    }
  },

  updatePassword: (data, callback) => {
    const { id, branch_id, customer_id, password } = data;

    // Start DB connection
    startConnection((err, connection) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      try {
        // SQL query for updating the record in branch_sub_users
        const updateSql = `
                  UPDATE \`branch_sub_users\` 
                  SET 
                      \`branch_id\` = ?, 
                      \`customer_id\` = ?, 
                      \`password\` = md5(?)
                  WHERE \`id\` = ?
              `;

        const values = [branch_id, customer_id, password, id];

        // Execute the query
        connection.query(updateSql, values, (err, results) => {
          // Release connection after query execution
          connectionRelease(connection);

          if (err) {
            console.error("Database query error:", err);
            return callback(
              { message: "Error updating the record", error: err },
              null
            );
          }

          // Handle no rows affected
          if (results.affectedRows === 0) {
            return callback(
              { message: "No record found with the given ID." },
              null
            );
          }

          // Success
          return callback(null, {
            results,
            message: "Record updated successfully.",
          });
        });
      } catch (error) {
        // Release connection and handle unexpected errors
        connectionRelease(connection);
        console.error("Unexpected error:", error);
        return callback({ message: "Unexpected error occurred", error }, null);
      }
    });
  },

  updateStatus: (status, client_application_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const sql = `
        UPDATE \`client_applications\`
        SET
          \`status\` = ?
        WHERE
          \`id\` = ?
      `;

      connection.query(sql, [status, client_application_id], (err, results) => {
        connectionRelease(connection); // Ensure the connection is released

        if (err) {
          console.error("Database query error: 115", err);
          return callback(err, null);
        }
        callback(null, results);
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
      const deleteSql = `DELETE FROM branch_sub_users WHERE id = ?`;

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
