const {
  pool,
  startConnection,
  connectionRelease,
} = require("../../../config/db");

const clientApplication = {
  generateApplicationID: (branch_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      // Step 1: Fetch customer_id from branches using branch_id
      const getCustomerIdSql = `
        SELECT \`customer_id\`
        FROM \`branches\`
        WHERE \`id\` = ?
      `;

      connection.query(getCustomerIdSql, [branch_id], (err, branchResults) => {
        if (err) {
          console.error("Error fetching customer_id from branches:", err);
          connectionRelease(connection);
          return callback(err, null);
        }

        if (branchResults.length === 0) {
          connectionRelease(connection);
          return callback(new Error("Branch not found"), null);
        }

        const customer_id = branchResults[0].customer_id;

        // Step 2: Fetch client_unique_id from customers using customer_id
        const getClientUniqueIdSql = `
          SELECT \`client_unique_id\`
          FROM \`customers\`
          WHERE \`id\` = ?
        `;

        connection.query(
          getClientUniqueIdSql,
          [customer_id],
          (err, customerResults) => {
            if (err) {
              console.error(
                "Error fetching client_unique_id from customers:",
                err
              );
              connectionRelease(connection);
              return callback(err, null);
            }

            if (customerResults.length === 0) {
              connectionRelease(connection);
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

            // Execute the query
            connection.query(
              getApplicationIdSql,
              [applicationIdParam],
              (err, applicationResults) => {
                connectionRelease(connection);
                if (err) {
                  console.error("Error fetching application ID:", err);
                  return callback(err, null);
                }

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
              }
            );
          }
        );
      });
    });
  },

  create: (data, callback) => {
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

    // Generate a new application ID
    clientApplication.generateApplicationID(branch_id, (err, new_application_id) => {
      if (err) {
        console.error("Error generating new application ID:", err);
        return callback(err, null);
      }

      startConnection((err, connection) => {
        if (err) {
          return callback(
            { message: "Failed to connect to the database", error: err },
            null
          );
        }

        // Base SQL query and values
        let sql = `
                INSERT INTO \`client_applications\` (
                    \`application_id\`,
                    \`name\`,
                    \`employee_id\`,
                    \`single_point_of_contact\`,
                    \`batch_number\`,
                    \`sub_client\`,
                    \`location\`,
                    \`branch_id\`,
                    \`services\`,
                    \`package\`,
                    \`customer_id\`,
                    \`purpose_of_application\`,
                    \`nationality\`
            `;

        let values = [
          new_application_id,
          name,
          employee_id,
          spoc,
          batch_number,
          sub_client,
          location,
          branch_id,
          serviceIds,
          packageIds,
          customer_id,
          purpose_of_application,
          nationality,
        ];

        // If attach_documents is not null, include it in the query
        if (attach_documents) {
          sql += `, \`attach_documents\``;
          values.push(attach_documents);
        }

        sql += `) VALUES (${values.map(() => "?").join(", ")})`;

        connection.query(sql, values, (err, results) => {
          connectionRelease(connection);
          if (err) {
            console.error("Database query error: 109", err);
            return callback(err, null);
          }
          callback(null, { results, new_application_id });
        });
      });
    });
  },

  // Other methods remain unchanged, but should include startConnection and connectionRelease
  list: (branch_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

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

      connection.query(sqlClient, [branch_id], (err, clientResults) => {
        if (err) {
          console.error("Database query error: 110", err);
          connectionRelease(connection);
          return callback(err, null);
        }

        const finalResults = [];
        const cmtPromises = clientResults.map((clientApp) => {
          return new Promise((resolve, reject) => {
            // Query for CMT applications
            const sqlCmt =
              "SELECT * FROM cmt_applications WHERE client_application_id = ?";
            connection.query(sqlCmt, [clientApp.id], (err, cmtResults) => {
              if (err) {
                console.error(
                  "Database query error for cmt_applications:",
                  err
                );
                return reject(err);
              }

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

              connection.query(
                servicesQuery,
                [servicesIds],
                (err, servicesResults) => {
                  if (err) {
                    console.error("Database query error for services:", err);
                    return reject(err);
                  }

                  const servicesTitles = servicesResults.map(
                    (service) => service.title
                  );

                  finalResults.push({
                    ...clientApp,
                    cmtApplications: cmtData,
                    serviceNames: servicesTitles, // Add services titles to the result
                  });
                  resolve();
                }
              );
            });
          });
        });

        Promise.all(cmtPromises)
          .then(() => {
            connectionRelease(connection);
            callback(null, finalResults);
          })
          .catch((err) => {
            connectionRelease(connection);
            callback(err, null);
          });
      });
    });
  },

  checkUniqueEmpId: (branch_id, clientUniqueEmpId, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const sql = `
      SELECT COUNT(*) AS count
      FROM \`client_applications\`
      WHERE \`employee_id\` = ? AND \`branch_id\` = ?
    `;
      connection.query(sql, [clientUniqueEmpId, branch_id], (err, results) => {
        connectionRelease(connection); // Ensure the connection is released

        if (err) {
          console.error("Database query error: 111", err);
          return callback(
            { message: "Database query error", error: err },
            null
          );
        }

        const count = results[0].count;
        callback(null, count > 0);
      });
    });
  },

  checkUniqueEmpIdByClientApplicationID: (
    branch_id,
    application_id,
    clientUniqueEmpId,
    callback
  ) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const sql = `
      SELECT COUNT(*) AS count
      FROM \`client_applications\`
      WHERE \`employee_id\` = ? AND \`id\` != ? AND \`branch_id\` = ?
    `;
      connection.query(
        sql,
        [clientUniqueEmpId, application_id, branch_id],
        (err, results) => {
          connectionRelease(connection); // Ensure the connection is released

          if (err) {
            console.error("Database query error: 112", err);
            return callback(
              { message: "Database query error", error: err },
              null
            );
          }

          const count = results[0].count;
          callback(null, count > 0);
        }
      );
    });
  },

  getClientApplicationById: (id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const sql = "SELECT * FROM `client_applications` WHERE id = ?";
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

  upload: (client_application_id, db_column, savedImagePaths, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const sqlUpdateCustomer = `
      UPDATE client_applications 
      SET ${db_column} = ?
      WHERE id = ?
    `;
      const joinedPaths = savedImagePaths.join(", ");
      // Prepare the parameters for the query
      const queryParams = [joinedPaths, client_application_id];

      connection.query(sqlUpdateCustomer, queryParams, (err, results) => {
        connectionRelease(connection); // Ensure the connection is released

        if (err) {
          // Return error details and the final query with parameters
          return callback(false, {
            error: "Database error occurred.",
            details: err, // Include error details for debugging
            query: sqlUpdateCustomer,
            params: queryParams, // Return the parameters used in the query
          });
        }

        // Check if any rows were affected by the update
        if (results.affectedRows > 0) {
          return callback(true, results); // Success with results
        } else {
          // No rows updated, return a specific message along with the query details
          return callback(false, {
            error: "No rows updated. Please check the client application ID.",
            details: results,
            query: sqlUpdateCustomer,
            params: queryParams, // Return the parameters used in the query
          });
        }
      });
    });
  },

  update: (data, client_application_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const {
        name,
        employee_id,
        client_spoc,
        batch_number,
        sub_client,
        location,
        services,
        packages,
        purpose_of_application,
        nationality,
      } = data;

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
      WHERE
        \`id\` = ?
    `;

      const serviceIds =
        typeof services === "string" && services.trim() !== ""
          ? services
            .split(",")
            .map((id) => id.trim())
            .join(",")
          : Array.isArray(services) && services.length > 0
            ? services.map((id) => id.trim()).join(",")
            : "";

      const packageIds =
        typeof packages === "string" && packages.trim() !== ""
          ? packages
            .split(",")
            .map((id) => id.trim())
            .join(",")
          : Array.isArray(packages) && packages.length > 0
            ? packages.map((id) => id.trim()).join(",")
            : "";

      const values = [
        name,
        employee_id,
        client_spoc,
        batch_number,
        sub_client,
        location,
        serviceIds,
        packageIds,
        purpose_of_application,
        nationality,
        client_application_id,
      ];

      connection.query(sql, values, (err, results) => {
        connectionRelease(connection); // Ensure the connection is released

        if (err) {
          console.error("Database query error: 114", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
  },

  updateStatus: (status, client_application_id, callback) => {
    // If status is empty or null, set it to 'wip'
    let newStatus = status;
    if (!status || status === null) {
      newStatus = "wip";
    }
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

      connection.query(
        sql,
        [newStatus, client_application_id],
        (err, results) => {
          connectionRelease(connection); // Ensure the connection is released

          if (err) {
            console.error("Database query error: 115", err);
            return callback(err, null);
          }
          callback(null, results);
        }
      );
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
