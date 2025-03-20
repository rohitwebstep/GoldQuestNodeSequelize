const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const clientApplication = {
  generateApplicationID: async (branch_id, callback) => {
    try {
      // Step 1: Fetch customer_id from branches using branch_id
      const getCustomerIdSql = `
        SELECT \`customer_id\`
        FROM \`branches\`
        WHERE \`id\` = ?
      `;

      const branchResults = await sequelize.query(getCustomerIdSql, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      if (branchResults.length === 0) {
        return callback(new Error("Branch not found"), null);
      }

      const customer_id = branchResults[0].customer_id;

      // Step 2: Fetch client_unique_id from customers using customer_id
      const getClientUniqueIdSql = `
        SELECT \`client_unique_id\`
        FROM \`customers\`
        WHERE \`id\` = ?
      `;

      const customerResults = await sequelize.query(getClientUniqueIdSql, {
        replacements: [customer_id],
        type: QueryTypes.SELECT,
      });

      if (customerResults.length === 0) {
        return callback(new Error("Customer not found"), null);
      }

      const client_unique_id = customerResults[0].client_unique_id;

      // Step 3: Fetch the most recent application_id based on client_unique_id
      const getApplicationIdSql = `
      SELECT \`application_id\`
      FROM \`client_applications\`
      WHERE \`application_id\` LIKE ?
      ORDER BY \`created_at\` DESC
      LIMIT 1
    `;

      const applicationIdParam = `${client_unique_id}%`;

      const applicationResults = await sequelize.query(getApplicationIdSql, {
        replacements: [applicationIdParam],
        type: QueryTypes.SELECT,
      });

      let new_application_id;

      if (applicationResults.length === 0) {
        new_application_id = `${client_unique_id}-1`;
      } else {
        const latest_application_id =
          applicationResults[0].application_id;

        const parts = latest_application_id.split("-");
        const lastIndex = parts.length - 1; // Get the last index of the parts array

        if (!isNaN(parts[lastIndex])) {
          const numberPart = parseInt(parts[lastIndex], 10);
          parts[lastIndex] = (numberPart + 1).toString(); // Increment the number part at the last index
          new_application_id = parts.join("-"); // Reassemble the application_id
        } else {
          new_application_id = `${client_unique_id}-1`;
        }
      }

      callback(null, new_application_id);
    } catch (error) {
      console.error("Database query error:", error);
      callback(error, null);
    }
  },

  create: async (data, callback) => {
    try {
      const {
        name,
        employee_id,
        spoc,
        batch_number,
        sub_client,
        location,
        branch_id,
        services,
        packages,
        customer_id,
        attach_documents,
        purpose_of_application,
        nationality,
      } = data;

      const serviceIds = Array.isArray(services)
        ? services.map((id) => id.trim()).join(",")
        : typeof services === "string" && services.trim() !== ""
          ? services.split(",").map((id) => id.trim()).join(",")
          : "";

      const packageIds = Array.isArray(packages)
        ? packages.map((id) => id.trim()).join(",")
        : typeof packages === "string" && packages.trim() !== ""
          ? packages.split(",").map((id) => id.trim()).join(",")
          : "";

      // Convert generateApplicationID into a Promise-based function
      const new_application_id = await new Promise((resolve, reject) => {
        clientApplication.generateApplicationID(branch_id, (err, id) => {
          if (err) reject(err);
          else resolve(id);
        });
      });

      // Construct SQL query dynamically
      let sql = `
        INSERT INTO client_applications (
          application_id, name, employee_id, single_point_of_contact,
          batch_number, sub_client, location, branch_id, services,
          package, customer_id, purpose_of_application, nationality
      `;

      let values = [
        new_application_id, name, employee_id, spoc, batch_number,
        sub_client, location, branch_id, serviceIds, packageIds,
        customer_id, purpose_of_application, nationality
      ];

      if (attach_documents) {
        sql += `, attach_documents`;
        values.push(attach_documents);
      }

      sql += `) VALUES (${values.map(() => "?").join(", ")})`;

      const results = await sequelize.query(sql, {
        replacements: values,
        type: QueryTypes.INSERT, // FIXED: Correct query type
      });

      callback(null, { results, new_application_id });
    } catch (error) {
      console.error("Database query error:", error);
      callback(error, null);
    }
  },

  // Other methods remain unchanged, but should include startConnection and connectionRelease
  list: async (branch_id, callback) => {
    const sqlClient = `
    SELECT 
      *
    FROM 
      \`client_applications\`
    WHERE 
      branch_id = ?
    ORDER BY 
      created_at DESC;
  `;

    const clientResults = await sequelize.query(sqlClient, {
      replacements: [branch_id], // Positional replacements using ?
      type: QueryTypes.SELECT,
    });

    const finalResults = [];
    const cmtPromises = clientResults.map((clientApp) => {
      return new Promise(async (resolve, reject) => {
        // Query for CMT applications
        const sqlCmt =
          "SELECT * FROM cmt_applications WHERE client_application_id = ?";

        const cmtResults = await sequelize.query(sqlCmt, {
          replacements: [clientApp.id], // Positional replacements using ?
          type: QueryTypes.SELECT,
        });
        const cmtData = cmtResults.map((cmtApp) => {
          return Object.fromEntries(
            Object.entries(cmtApp).map(([key, value]) => [
              `cmt_${key}`,
              value,
            ])
          );
        });

        // Handle services splitting and querying
        const servicesIds = clientApp.services
          ? clientApp.services.split(",")
          : [];
        if (servicesIds.length === 0) {
          finalResults.push({
            ...clientApp,
            cmtApplications: cmtData,
            serviceNames: [],
          });
          return resolve();
        }

        const servicesQuery =
          "SELECT title FROM services WHERE id IN (?)";
        const servicesResults = await sequelize.query(servicesQuery, {
          replacements: [servicesIds], // Positional replacements using ?
          type: QueryTypes.SELECT,
        });

        const servicesTitles = servicesResults.map(
          (service) => service.title
        );

        finalResults.push({
          ...clientApp,
          cmtApplications: cmtData,
          serviceNames: servicesTitles, // Add services titles to the result
        });
        resolve();
      });
    });

    Promise.all(cmtPromises)
      .then(() => {
        callback(null, finalResults);
      })
      .catch((err) => {
        callback(err, null);
      });
  },

  checkUniqueEmpId: async (branch_id, clientUniqueEmpId, callback) => {
    try {
      const sql = `
        SELECT COUNT(*) AS count
        FROM client_applications
        WHERE employee_id = ? AND branch_id = ?
      `;

      const [result] = await sequelize.query(sql, {
        replacements: [clientUniqueEmpId, branch_id],
        type: QueryTypes.SELECT,
      });

      const isDuplicate = result.count > 0;
      callback(null, isDuplicate);
    } catch (error) {
      console.error("Database query error:", error);
      callback(error, null);
    }
  },

  checkUniqueEmpIdByClientApplicationID: async (branch_id, application_id, clientUniqueEmpId, callback) => {
    try {
      const sql = `
        SELECT COUNT(*) AS count
        FROM client_applications
        WHERE employee_id = ? AND id != ? AND branch_id = ?
      `;

      const [result] = await sequelize.query(sql, {
        replacements: [clientUniqueEmpId, application_id, branch_id],
        type: QueryTypes.SELECT,
      });

      const isDuplicate = result.count > 0;
      callback(null, isDuplicate);
    } catch (error) {
      console.error("Database query error:", error);
      callback(error, null);
    }
  },

  getClientApplicationById: async (id, callback) => {
    try {
      const sql = "SELECT * FROM `client_applications` WHERE id = ?";
      const results = await sequelize.query(sql, {
        replacements: [id], // Positional replacements using ?
        type: QueryTypes.SELECT,
      });

      callback(null, results.length > 0 ? results[0] : null);
    } catch (error) {
      console.error("Database query error:", error);
      callback(error, null);
    }
  },

  upload: async (client_application_id, db_column, savedImagePaths, callback) => {
    try {
      // Log the initial input parameters
      console.log("Starting upload function...");
      console.log("client_application_id:", client_application_id);
      console.log("db_column:", db_column);
      console.log("savedImagePaths:", savedImagePaths);

      // SQL query for updating customer data
      const sqlUpdateCustomer = `
        UPDATE client_applications 
        SET ${db_column} = ? 
        WHERE id = ?
      `;
      console.log("SQL Query:", sqlUpdateCustomer);

      // Join the saved image paths into a single string
      const joinedPaths = savedImagePaths.join(", ");
      console.log("Joined image paths:", joinedPaths);

      // Prepare the query parameters
      const queryParams = [joinedPaths, client_application_id];
      console.log("Query parameters:", queryParams);

      // Execute the query
      const [affectedRows] = await sequelize.query(sqlUpdateCustomer, {
        replacements: queryParams, // Positional replacements using ?
        type: QueryTypes.UPDATE,
      });
      console.log("Affected rows:", affectedRows);

      // Check if any rows were affected
      if (affectedRows > 0) {
        console.log("Update successful.");
        return callback(true, { message: "Update successful", affectedRows });
      } else {
        console.warn("No rows updated. Please check the client application ID.");
        return callback(false, {
          error: "No rows updated. Please check the client application ID.",
          query: sqlUpdateCustomer,
          params: queryParams,
        });
      }
    } catch (error) {
      // Log error if something goes wrong
      console.error("Database update error:", error);
      return callback(false, { error: "Database error", details: error });
    }
  },

  update: async (data, client_application_id, callback) => {
    try {
      const {
        name,
        employee_id,
        client_spoc,
        batch_number,
        sub_client,
        location,
        services = "", // Ensure default value
        packages = "", // Ensure default value
        purpose_of_application,
        nationality,
      } = data;

      // Ensure serviceIds and packageIds are always strings
      const serviceIds =
        typeof services === "string" && services.trim() !== ""
          ? services.split(",").map((id) => id.trim()).join(",")
          : Array.isArray(services) && services.length > 0
            ? services.map((id) => id.trim()).join(",")
            : "";

      const packageIds =
        typeof packages === "string" && packages.trim() !== ""
          ? packages.split(",").map((id) => id.trim()).join(",")
          : Array.isArray(packages) && packages.length > 0
            ? packages.map((id) => id.trim()).join(",")
            : "";

      const sql = `
        UPDATE \`client_applications\`
        SET
          \`name\` = ?,
          \`employee_id\` = ?,
          \`single_point_of_contact\` = ?,
          \`batch_number\` = ?,
          \`sub_client\` = ?,
          \`location\` = ?,
          \`services\` = ?,
          \`package\` = ?,
          \`purpose_of_application\` = ?,
          \`nationality\` = ?
        WHERE \`id\` = ?
      `;

      const values = [
        name || "",  // Ensure default values
        employee_id || "",
        client_spoc || "",
        batch_number || "",
        sub_client || "",
        location || "",
        serviceIds, // Always a string
        packageIds, // Always a string
        purpose_of_application || "",
        nationality || "",
        client_application_id,
      ];

      const results = await sequelize.query(sql, {
        replacements: values, // Positional replacements using ?
        type: QueryTypes.UPDATE,
      });

      callback(null, results);
    } catch (error) {
      console.error("Database update error:", error);
      callback(error, null);
    }
  },

  updateStatus: async (status, client_application_id, callback) => {
    try {
      // If status is empty or null, set it to 'wip'
      const newStatus = status || "wip";

      const sql = `
        UPDATE \`client_applications\`
        SET \`status\` = ?
        WHERE \`id\` = ?
      `;

      const [results] = await sequelize.query(sql, {
        replacements: [newStatus, client_application_id],
        type: QueryTypes.UPDATE, // Correct query type for UPDATE statements
      });

      callback(null, { success: true, affectedRows: results });
    } catch (error) {
      console.error("Error updating status:", error);
      callback({ success: false, message: "Failed to update status" }, null);
    }
  },

  delete: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      // Step 1: Retrieve services from client_applications where id = id
      const sqlGetServices =
        "SELECT services FROM `client_applications` WHERE `id` = ?";
      connection.query(sqlGetServices, [id], (err, results) => {
        if (err) {
          connectionRelease(connection); // Ensure the connection is released
          console.error("Database query error: 116", err);
          return callback(err, null);
        }

        if (results.length === 0) {
          connectionRelease(connection); // Ensure the connection is released
          return callback(
            { message: "No client application found with the given ID" },
            null
          );
        }

        // Get the services string and split it into an array
        const services = results[0].services;
        const servicesArray = services
          .split(",")
          .map((service) => parseInt(service.trim())); // Parse to integers

        const jsonResults = []; // Array to hold JSON results
        let completedQueries = 0; // Counter to track completed queries

        // Step 2: Loop through each service ID and query the report_forms table
        servicesArray.forEach((serviceId) => {
          const sqlGetJson =
            "SELECT json FROM report_forms WHERE service_id = ?";
          connection.query(sqlGetJson, [serviceId], (err, jsonQueryResults) => {
            if (err) {
              console.error(
                "Database query error for service ID",
                serviceId,
                ":",
                err
              );
            } else if (jsonQueryResults.length > 0) {
              try {
                const jsonData = JSON.parse(jsonQueryResults[0].json);
                const dbTable = jsonData.db_table;

                // Check if dbTable exists and if there is an entry with client_application_id = id
                const sqlCheckEntry = `SELECT * FROM \`${dbTable}\` WHERE client_application_id = ?`;
                connection.query(sqlCheckEntry, [id], (err, entryResults) => {
                  if (err) {
                    console.error(
                      "Database query error while checking dbTable:",
                      err
                    );
                  } else if (entryResults.length > 0) {
                    // Entry found, proceed to delete it
                    const sqlDeleteEntry = `DELETE FROM \`${dbTable}\` WHERE client_application_id = ?`;
                    connection.query(sqlDeleteEntry, [id], (err) => {
                      if (err) {
                        console.error(
                          "Database query error during entry deletion:",
                          err
                        );
                      }
                    });
                  }
                });

                // Store the JSON result
                jsonResults.push(jsonQueryResults[0].json);
              } catch (parseError) {
                console.error("Error parsing JSON:", parseError);
              }
            }

            // Increment the counter and check if all queries are done
            completedQueries++;
            if (completedQueries === servicesArray.length) {
              // Step 3: Now delete the client_application entry
              const sqlDelete =
                "DELETE FROM `client_applications` WHERE `id` = ?";
              connection.query(sqlDelete, [id], (err, deleteResults) => {
                connectionRelease(connection); // Ensure the connection is released

                if (err) {
                  console.error("Database query error during deletion:", err);
                  return callback(err, null);
                }

                // Return both the deleted services and the results from json queries
                callback(null, {
                  deletedServices: servicesArray,
                  jsonResults,
                  deleteResults,
                });
              });
            }
          });
        });
      });
    });
  },
};

module.exports = clientApplication;
