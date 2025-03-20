const {
  pool,
  startConnection,
  connectionRelease,
} = require("../../../config/db");

const replaceEmptyWithNull = (value) => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(",") : null; // Convert array to comma-separated string or return null if empty
  } else if (typeof value === "string") {
    return value.trim() !== "" ? value : null; // Trim and check if not empty
  } else {
    return value || null; // Return value if truthy, otherwise null
  }
};
const candidateApplication = {
  // Method to check if an email has been used before
  isEmailUsedBefore: (email, branch_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const emailCheckSql = `
        SELECT COUNT(*) as count
        FROM \`candidate_applications\`
        WHERE \`email\` = ? AND \`branch_id\` = ?
      `;

      connection.query(
        emailCheckSql,
        [email, branch_id],
        (err, emailCheckResults) => {
          connectionRelease(connection); // Ensure connection is released

          if (err) {
            console.error(
              "Error checking email in candidate_applications:",
              err
            );
            return callback(err, null);
          }

          const emailExists = emailCheckResults[0].count > 0;
          return callback(null, emailExists);
        }
      );
    });
  },

  // Method to create a new candidate application
  create: (data, callback) => {
    const {
      branch_id,
      name,
      employee_id,
      mobile_number,
      email,
      services,
      package,
      purpose_of_application,
      nationality,
      customer_id,
    } = data;

    const sql = `
        INSERT INTO \`candidate_applications\` (
          \`branch_id\`,
          \`name\`,
          \`employee_id\`,
          \`mobile_number\`,
          \`email\`,
          \`services\`,
          \`package\`,
          \`purpose_of_application\`,
          \`nationality\`,
          \`customer_id\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

    const values = [
      replaceEmptyWithNull(branch_id),
      replaceEmptyWithNull(name),
      replaceEmptyWithNull(employee_id),
      replaceEmptyWithNull(mobile_number),
      replaceEmptyWithNull(email),
      replaceEmptyWithNull(services),
      replaceEmptyWithNull(package),
      replaceEmptyWithNull(purpose_of_application),
      replaceEmptyWithNull(nationality),
      replaceEmptyWithNull(customer_id),
    ];

    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      connection.query(sql, values, (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 99", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
  },

  list: (branch_id, callback) => {
    const sql =
      "SELECT * FROM `candidate_applications` WHERE `branch_id` = ? ORDER BY created_at DESC";

    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      connection.query(sql, [branch_id], (err, results) => {
        if (err) {
          console.error("Database query error: 100", err);
          connectionRelease(connection); // Ensure connection is released
          return callback(err, null);
        }

        const finalResults = [];
        const servicePromises = results.map((application) => {
          return new Promise((resolve, reject) => {
            // Extract service IDs
            const servicesIds = application.services
              ? application.services.split(",")
              : [];

            if (servicesIds.length === 0) {
              finalResults.push({ ...application, serviceNames: "" });
              return resolve(); // No services to fetch
            }

            // Query for service titles
            const servicesQuery =
              "SELECT title FROM `services` WHERE id IN (?)";
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
                  ...application,
                  serviceNames: servicesTitles, // Add services titles to the result
                });
                resolve();
              }
            );
          });
        });

        Promise.all(servicePromises)
          .then(() => {
            connectionRelease(connection); // Ensure connection is released
            callback(null, finalResults);
          })
          .catch((err) => {
            connectionRelease(connection); // Ensure connection is released
            callback(err, null);
          });
      });
    });
  },

  checkUniqueEmpId: (branch_id, candidateUniqueEmpId, callback) => {
    if (!candidateUniqueEmpId) {
      return callback(null, false);
    }
    const sql = `
      SELECT COUNT(*) AS count
      FROM \`candidate_applications\`
      WHERE \`employee_id\` = ? AND \`branch_id\` = ?
    `;

    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      connection.query(sql, [candidateUniqueEmpId, branch_id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 101", err);
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

  checkUniqueEmpIdByCandidateApplicationID: (
    branch_id,
    candidateUniqueEmpId,
    application_id,
    callback
  ) => {
    if (!candidateUniqueEmpId) {
      return callback(null, false);
    }

    const sql = `
      SELECT COUNT(*) AS count
      FROM \`candidate_applications\`
      WHERE \`employee_id\` = ? AND id = ? AND \`branch_id\` = ?
    `;

    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      connection.query(
        sql,
        [candidateUniqueEmpId, application_id, branch_id],
        (err, results) => {
          connectionRelease(connection); // Ensure connection is released

          if (err) {
            console.error("Database query error: 102", err);
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

  getCandidateApplicationById: (id, callback) => {
    const sql = "SELECT * FROM `candidate_applications` WHERE id = ?";

    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      connection.query(sql, [id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 103", err);
          return callback(err, null);
        }
        callback(null, results[0]);
      });
    });
  },

  getAttachmentsOfCandidateApplicationByID: (candidate_application_id, branch_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        console.error("Error starting database connection:", err);
        return callback(err, null);
      }

      let sql = `
            SELECT 
                ca.*, 
                ca.id AS main_id, 
                cef.created_at AS cef_filled_date,
                cef.is_employment_gap,
                cef.is_education_gap,
                cef.created_at,
                cef.id AS cef_id,
                dav.created_at AS dav_filled_date,
                dav.id AS dav_id,
                CASE WHEN cef.id IS NOT NULL THEN 1 ELSE 0 END AS cef_submitted,
                CASE WHEN dav.id IS NOT NULL THEN 1 ELSE 0 END AS dav_submitted
            FROM 
                \`candidate_applications\` ca
            LEFT JOIN 
                \`cef_applications\` cef 
            ON 
                ca.id = cef.candidate_application_id
            LEFT JOIN 
                \`dav_applications\` dav 
            ON 
                ca.id = dav.candidate_application_id
            WHERE 
                ca.\`branch_id\` = ? AND ca.\`id\` = ?`;

      const params = [branch_id, candidate_application_id];

      sql += ` ORDER BY ca.\`created_at\` DESC;`;

      connection.query(sql, params, (err, results) => {
        if (err) {
          console.error("Database query error:", err);
          connectionRelease(connection);
          return callback(err, null);
        }

        const davSql = `
            SELECT * FROM \`services\`
            WHERE LOWER(\`title\`) LIKE '%digital%'
            AND (LOWER(\`title\`) LIKE '%verification%' OR LOWER(\`title\`) LIKE '%address%')
            LIMIT 1`;

        connection.query(davSql, (queryErr, davResults) => {
          if (queryErr) {
            console.error("Database query error for DAV services:", queryErr);
            return callback(queryErr, null);
          }

          let digitalAddressID = null;
          const singleEntry = davResults.length > 0 ? davResults[0] : null;

          if (singleEntry) {
            digitalAddressID = parseInt(singleEntry.id, 10);
          }

          const cmtPromises = results.map(async (candidateApp) => {
            const servicesResult = { cef: {}, dav: {} };
            const serviceNames = [];
            const servicesIds = candidateApp.services
              ? candidateApp.services.split(",")
              : [];

            if (servicesIds.length === 0) {
              serviceNames.push({ ...candidateApp, serviceNames: "" });
            } else {
              // Query for service titles
              const servicesQuery = "SELECT title FROM `services` WHERE id IN (?)";
              try {
                const servicesResults = await new Promise((resolve, reject) => {
                  connection.query(servicesQuery, [servicesIds], (err, results) => {
                    if (err) {
                      console.error("Database query error for services:", err);
                      return reject(err);
                    }
                    resolve(results);
                  });
                });

                const servicesTitles = servicesResults.map((service) => service.title);
                candidateApp.serviceNames = servicesTitles;
              } catch (error) {
                console.error("Error fetching service titles:", error);
              }
            }

            // Continue with existing processing for DAV and CEF
            candidateApp.dav_exist = servicesIds.includes(digitalAddressID)
              ? 1
              : 0;
            // Handle DAV submitted cases
            if (candidateApp.dav_submitted === 1) {
              const checkDavSql = `
                            SELECT identity_proof, home_photo, locality
                            FROM \`dav_applications\`
                            WHERE \`candidate_application_id\` = ?`;

              try {
                const davResults = await new Promise((resolve, reject) => {
                  connection.query(checkDavSql, [candidateApp.main_id], (queryErr, results) => {
                    if (queryErr) {
                      console.error("Error querying DAV details:", queryErr);
                      return reject(queryErr);
                    }
                    resolve(results);
                  });
                });

                if (davResults.length > 0) {
                  davResults.forEach((davResult) => {
                    const mappings = {
                      identity_proof: "Identity Proof",
                      home_photo: "Home Photo",
                      locality: "Locality",
                    };

                    Object.entries(mappings).forEach(([key, label]) => {
                      if (davResult[key]) {
                        servicesResult.dav[label] = davResult[key];
                      }
                    });
                  });
                  candidateApp.service_data = servicesResult;
                }
              } catch (error) {
                console.error("Error processing DAV services:", error);
              }
            }

            // Handle CEF submitted cases
            if (candidateApp.cef_submitted === 1) {
              const checkCefSql = `
                            SELECT 
                                signature, resume_file, govt_id, 
                                pan_card_image, aadhar_card_image, passport_photo
                            FROM 
                                \`cef_applications\`
                            WHERE 
                                \`candidate_application_id\` = ?`;

              try {
                const cefResults = await new Promise((resolve, reject) => {
                  connection.query(checkCefSql, [candidateApp.main_id], (queryErr, results) => {
                    if (queryErr) {
                      console.error("Error querying CEF details:", queryErr);
                      return reject(queryErr);
                    }
                    resolve(results);
                  });
                });

                if (cefResults.length > 0) {
                  const candidateBasicAttachments = [];
                  const mappings = {
                    signature: "Signature",
                    resume_file: "Resume File",
                    govt_id: "Govt ID",
                    pan_card_image: "Pan Card Image",
                    aadhar_card_image: "Aadhar Card Image",
                    passport_photo: "Passport Photo",
                  };

                  cefResults.forEach((cefResult) => {
                    Object.entries(mappings).forEach(([key, label]) => {
                      if (cefResult[key]) {
                        candidateBasicAttachments.push({ [label]: cefResult[key] });
                      }
                    });
                  });

                  servicesResult.cef["Candidate Basic Attachments"] = candidateBasicAttachments;
                  candidateApp.service_data = servicesResult;
                }
              } catch (error) {
                console.error("Error processing CEF services:", error);
              }

              const dbTableFileInputs = {};
              const dbTableColumnLabel = {};
              let completedQueries = 0;
              const dbTableWithHeadings = {};

              try {
                await Promise.all(
                  servicesIds.map(async (service) => {
                    const query =
                      "SELECT `json` FROM `cef_service_forms` WHERE `service_id` = ?";
                    const result = await new Promise((resolve, reject) => {
                      connection.query(query, [service], (err, result) => {
                        if (err) {
                          return reject(err); // Reject if there is an error in the query
                        }
                        resolve(result); // Resolve with query result
                      });
                    });

                    if (result.length > 0) {
                      try {
                        const rawJson = result[0].json;
                        const sanitizedJson = rawJson
                          .replace(/\\"/g, '"')
                          .replace(/\\'/g, "'");
                        const jsonData = JSON.parse(sanitizedJson);
                        const dbTable = jsonData.db_table;
                        const heading = jsonData.heading;

                        if (dbTable && heading) {
                          dbTableWithHeadings[dbTable] = heading;
                        }

                        if (!dbTableFileInputs[dbTable]) {
                          dbTableFileInputs[dbTable] = [];
                        }

                        jsonData.rows.forEach((row) => {
                          row.inputs.forEach((input) => {
                            if (input.type === "file") {
                              dbTableFileInputs[dbTable].push(input.name);
                              dbTableColumnLabel[input.name] = input.label;
                            }
                          });
                        });
                      } catch (parseErr) {
                        console.error("Error parsing JSON:", parseErr);
                      }
                    }
                  })
                );

                let tableQueries = 0;
                const totalTables = Object.keys(dbTableFileInputs).length;

                if (totalTables === 0) {
                  return; // If no tables to query, resolve immediately
                }

                await Promise.all(
                  Object.entries(dbTableFileInputs).map(async ([dbTable, fileInputNames]) => {
                    if (fileInputNames.length > 0) {
                      try {
                        // Fetch the column names of the table
                        const existingColumns = await new Promise((resolve, reject) => {
                          const describeQuery = `DESCRIBE cef_${dbTable}`;
                          connection.query(describeQuery, (err, results) => {
                            if (err) {
                              console.error("Error describing table:", dbTable, err);
                              return reject(err);
                            }
                            resolve(results.map((col) => col.Field)); // Extract column names
                          });
                        });

                        // Get only the columns that exist in the table
                        const validColumns = fileInputNames.filter((col) =>
                          existingColumns.includes(col)
                        );

                        if (validColumns.length > 0) {
                          // Create and execute the SELECT query
                          const selectQuery = `SELECT ${validColumns.join(", ")} FROM cef_${dbTable} WHERE candidate_application_id = ?`;
                          const rows = await new Promise((resolve, reject) => {
                            connection.query(
                              selectQuery,
                              [candidateApp.main_id],
                              (err, rows) => {
                                if (err) {
                                  console.error(
                                    "Error querying database for table:",
                                    dbTable,
                                    err
                                  );
                                  return reject(err);
                                }
                                resolve(rows);
                              }
                            );
                          });

                          // Process and map the rows to replace column names with labels
                          const updatedRows = rows.map((row) => {
                            const updatedRow = {};
                            for (const [key, value] of Object.entries(row)) {
                              if (value != null && value !== "") {
                                const label = dbTableColumnLabel[key];
                                updatedRow[label || key] = value; // Use label if available, else keep original key
                              }
                            }
                            return updatedRow;
                          });

                          if (
                            updatedRows.length > 0 &&
                            updatedRows.some((row) => Object.keys(row).length > 0)
                          ) {
                            servicesResult.cef[dbTableWithHeadings[dbTable]] = updatedRows;
                          }
                        } else {
                          console.log(
                            `Skipping table ${dbTable} as no valid columns exist in the table.`
                          );
                        }

                        tableQueries++;
                        if (tableQueries === totalTables) {
                          candidateApp.service_data = servicesResult;
                        }
                      } catch (error) {
                        console.error(`Error processing table ${dbTable}:`, error);
                      }
                    } else {
                      console.log(
                        `Skipping table ${dbTable} as fileInputNames is empty.`
                      );
                    }
                  })
                );

              } catch (error) {
                return Promise.reject(error); // Reject if any errors occur during CEF processing
              }
            }
          });

          Promise.all(cmtPromises)
            .then(() => {
              connectionRelease(connection);
              callback(null, results[0]);
            })
            .catch((promiseError) => {
              console.error("Error processing candidate applications:", promiseError);
              connectionRelease(connection);
              callback(promiseError, null);
            });
        });
      });
    });
  },

  update: (data, candidate_application_id, callback) => {
    const { name, employee_id, mobile_number, email, services, package, purpose_of_application, nationality } = data;

    const sql = `
      UPDATE \`candidate_applications\`
      SET
        \`name\` = ?,
        \`employee_id\` = ?,
        \`mobile_number\` = ?,
        \`email\` = ?,
        \`services\` = ?,
        \`package\` = ?,
        \`purpose_of_application\` = ?,
        \`nationality\` = ?
      WHERE
        \`id\` = ?
    `;

    const values = [
      replaceEmptyWithNull(name),
      replaceEmptyWithNull(employee_id),
      replaceEmptyWithNull(mobile_number),
      replaceEmptyWithNull(email),
      replaceEmptyWithNull(services),
      replaceEmptyWithNull(package),
      replaceEmptyWithNull(purpose_of_application),
      replaceEmptyWithNull(nationality),
      replaceEmptyWithNull(candidate_application_id),
    ];

    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      connection.query(sql, values, (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 104", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
  },

  updateConvertClientStatus: (candidateAppId, callback) => {

    // If no duplicates are found, proceed with updating the admin record
    const sql = `
        UPDATE \`candidate_applications\` 
        SET 
          \`is_converted_to_client\` = ?
        WHERE \`id\` = ?
      `;

    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      connection.query(sql, ["1", candidateAppId], (queryErr, results) => {
        connectionRelease(connection); // Release the connection

        if (queryErr) {
          console.error("Database query error: 51", queryErr);
          return callback(queryErr, null);
        }
        callback(null, results);
      });
    });
  },

  delete: (id, callback) => {
    const sql = "DELETE FROM `candidate_applications` WHERE `id` = ?";

    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      connection.query(sql, [id], (err, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (err) {
          console.error("Database query error: 105", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
  },

  isApplicationExist: (app_id, branch_id, customer_id, callback) => {
    const sql = `SELECT CA.*, C.is_custom_bgv AS is_custom_bgv, C.name AS customer_name, B.name AS branch_name
      FROM candidate_applications AS CA 
      INNER JOIN customers AS C ON C.id = CA.customer_id
      INNER JOIN branches AS B ON B.id = CA.branch_id
      WHERE CA.id = ? 
        AND CA.branch_id = ? 
        AND CA.customer_id = ?`;

    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      connection.query(
        sql,
        [app_id, branch_id, customer_id],
        (err, results) => {
          if (err) {
            console.error("Database query error: 106", err);
            return callback(err, null);
          }

          // Return the entry if it exists, or false otherwise
          const entry = results.length > 0 ? results[0] : false;
          connectionRelease(connection);
          callback(null, entry);
        }
      );
    });
  },
};

module.exports = candidateApplication;
