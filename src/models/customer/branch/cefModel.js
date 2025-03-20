const crypto = require("crypto");
const {
  pool,
  startConnection,
  connectionRelease,
} = require("../../../config/db");

const cef = {
  formJson: (service_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const sql = "SELECT * FROM `cef_service_forms` WHERE `service_id` = ?";
      connection.query(sql, [service_id], (queryErr, results) => {
        connectionRelease(connection);
        if (queryErr) {
          console.error("Database query error: 107", queryErr);
          return callback(queryErr, null);
        }
        callback(null, results);
      });
    });
  },

  updateSubmitStatus: (data, callback) => {
    const { candidateAppId, status } = data;

    // If no duplicates are found, proceed with updating the admin record
    const sql = `
        UPDATE \`cef_applications\` 
        SET 
          \`is_submitted\` = ?
        WHERE \`candidate_application_id\` = ?
      `;

    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      connection.query(sql, [status, candidateAppId], (queryErr, results) => {
        connectionRelease(connection); // Release the connection

        if (queryErr) {
          console.error("Database query error: 51", queryErr);
          return callback(queryErr, null);
        }
        callback(null, results);
      });
    });
  },

  bgvFormOpened: (candidate_application_id, callback) => {

    // If no duplicates are found, proceed with updating the admin record
    const sql = `
        UPDATE \`candidate_applications\` 
        SET 
          \`is_bgv_form_opened\` = ?
        WHERE \`id\` = ?
      `;

    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      connection.query(sql, ['1', candidate_application_id], (queryErr, results) => {
        connectionRelease(connection); // Release the connection

        if (queryErr) {
          console.error("Database query error: 51", queryErr);
          return callback(queryErr, null);
        }
        callback(null, results);
      });
    });
  },

  updateReminderDetails: (data, callback) => {
    const { candidateAppId } = data;

    const updateSQL = `
      UPDATE \`candidate_applications\` 
      SET 
        \`cef_last_reminder_sent_at\` = CURDATE(),
        \`dav_last_reminder_sent_at\` = CURDATE(),
        \`reminder_sent\` = reminder_sent + 1
      WHERE \`id\` = ?
    `;

    startConnection((err, connection) => {
      if (err) return callback(err, null);

      connection.query(updateSQL, [candidateAppId], (queryErr, results) => {
        connectionRelease(connection); // Ensure connection is released

        if (queryErr) {
          console.error("Database query error:", queryErr);
          return callback(queryErr, null);
        }

        callback(null, results);
      });
    });
  },

  unsubmittedApplications: (callback) => {
    const dayInterval = 0;
    const sql = `
                SELECT 
                    ca.id AS candidate_application_id, 
                    ca.name AS application_name, 
                    ca.email, 
                    ca.branch_id, 
                    ca.customer_id,
                    ca.services, 
                    ca.reminder_sent, 
                    c.name AS customer_name, 
                    b.name AS branch_name,
                    COALESCE(cef.is_submitted, NULL) AS cef_submitted,
                    COALESCE(da.is_submitted, NULL) AS dav_submitted
                FROM candidate_applications ca
                INNER JOIN customers c ON c.id = ca.customer_id
                INNER JOIN branches b ON b.id = ca.branch_id
                LEFT JOIN cef_applications cef ON cef.candidate_application_id = ca.id
                LEFT JOIN dav_applications da ON da.candidate_application_id = ca.id
                WHERE 
                    -- Condition 1: Candidate applications not present in cef_applications OR present but not submitted
                    (cef.candidate_application_id IS NULL OR cef.is_submitted = 0)
                    -- Condition 2: Candidate applications not present in dav_applications OR present but not submitted
                    AND (da.candidate_application_id IS NULL OR da.is_submitted = 0)
                    -- Condition 3: Last reminder sent exactly 'dayInterval' days ago OR is NULL
                    AND (
                        (ca.cef_last_reminder_sent_at = DATE_SUB(CURDATE(), INTERVAL ? DAY) OR ca.cef_last_reminder_sent_at IS NULL)
                        OR
                        (ca.dav_last_reminder_sent_at = DATE_SUB(CURDATE(), INTERVAL ? DAY) OR ca.dav_last_reminder_sent_at IS NULL)
                    )
                    -- Condition 4: Only select candidates who have received less than 3 reminders
                    AND ca.reminder_sent < 5;
  `;

    startConnection((err, connection) => {
      if (err) return callback(err, null);

      connection.query(sql, [dayInterval, dayInterval], (queryErr, results) => {
        connectionRelease(connection); // Release the connection

        if (queryErr) {
          console.error("Database query error: 51", queryErr);
          return callback(queryErr, null);
        }
        callback(null, results);
      });
    });
  },

  filledOrUnfilledServices: (servicesIds, candidate_application_id, callback) => {
    if (!servicesIds) {
      return callback(null, {});
    }
    let services = Array.isArray(servicesIds) ? servicesIds : servicesIds.split(',').map(s => s.trim());
    if (!Array.isArray(services) || services.length === 0) {
      return callback(null, {}); // Return empty if no services are provided
    }

    startConnection((err, connection) => {
      if (err) {
        console.error("Database connection failed:", err);
        return callback({ message: "Failed to connect to the database", error: err }, null);
      }

      let completedQueries = 0;
      const serviceData = {}; // Store data for each service.

      // Helper function to check completion
      const checkCompletion = () => {
        if (completedQueries === services.length) {
          connectionRelease(connection);
          callback(null, serviceData);
        }
      };

      // Loop through each service and perform actions
      services.forEach((service, index) => {
        const query = "SELECT `json` FROM `cef_service_forms` WHERE `service_id` = ?";

        connection.query(query, [service], (err, result) => {
          if (err) {
            console.error(`Error fetching JSON for service ${service}:`, err);
            completedQueries++;
            return checkCompletion();
          }

          if (result.length === 0) {
            console.warn(`No JSON found for service: ${service}`);
            completedQueries++;
            return checkCompletion();
          }

          const rawJson = result[0].json;
          const sanitizedJson = rawJson
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'");
          const jsonData = JSON.parse(sanitizedJson);

          const dbTable = jsonData.db_table || null;
          const heading = jsonData.heading || `Service ${service}`;

          if (!dbTable) {
            console.warn(`Missing db_table for service: ${service}`);
            serviceData[service] = { heading, is_submitted: false };
            completedQueries++;
            return checkCompletion();
          }

          const sql = `SELECT is_submitted FROM \`cef_${dbTable}\` WHERE \`candidate_application_id\` = ?`;

          connection.query(sql, [candidate_application_id], (queryErr, dbTableResults) => {
            if (queryErr) {
              if (queryErr.code === "ER_NO_SUCH_TABLE") {
                console.warn(`Table "cef_${dbTable}" does not exist. Skipping service: ${service}`);
                serviceData[service] = { heading, is_submitted: false };
              } else {
                console.error(`Error executing query for service ${service}:`, queryErr);
                serviceData[service] = { heading, is_submitted: false };
              }
            } else {
              const isSubmitted = dbTableResults.length > 0 && dbTableResults[0].is_submitted === 1;
              serviceData[service] = { heading, is_submitted: isSubmitted };
            }
            completedQueries++;
            checkCompletion();
          });
        });
      });
    });
  },

  formJsonWithData: (services, candidate_application_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      let completedQueries = 0;
      const serviceData = {}; // Object to store data for each service.

      // Helper function to check completion
      const checkCompletion = () => {
        if (completedQueries === services.length) {
          connectionRelease(connection);
          callback(null, serviceData);
        }
      };

      // Step 1: Loop through each service and perform actions
      services.forEach((service) => {
        const query = "SELECT `json` FROM `cef_service_forms` WHERE `service_id` = ?";
        const serviceQuery = "SELECT `group` FROM `services` WHERE `id` = ?";

        connection.query(query, [service], (err, result) => {
          if (err) {
            console.error("Error fetching JSON for service:", service, err);
            completedQueries++;
            checkCompletion();
            return;
          }

          if (result.length === 0) {
            console.warn(`No JSON found for service: ${service}`);
            completedQueries++;
            checkCompletion();
            return;
          }
          try {
            // Parse the JSON data safely
            const rawJson = result[0].json;
            const sanitizedJson = rawJson.replace(/\\"/g, '"').replace(/\\'/g, "'");
            const jsonData = JSON.parse(sanitizedJson);
            const dbTable = jsonData.db_table;

            const sql = `SELECT * FROM \`cef_${dbTable}\` WHERE \`candidate_application_id\` = ?`;

            connection.query(sql, [candidate_application_id], (queryErr, dbTableResults) => {
              if (queryErr) {
                if (queryErr.code === "ER_NO_SUCH_TABLE") {
                  console.warn(`Table "${dbTable}" does not exist. Skipping.`);
                  serviceData[service] = { jsonData, data: null, group: null };
                } else {
                  console.error("Error executing query:", queryErr);
                }
                completedQueries++;
                checkCompletion();
                return;
              }

              const dbTableResult = dbTableResults.length > 0 ? dbTableResults[0] : null;

              // Fetch the service group in a separate query
              connection.query(serviceQuery, [service], (serviceErr, serviceResult) => {
                if (serviceErr) {
                  console.error("Error fetching service group for service:", service, serviceErr);
                  serviceData[service] = { jsonData, data: dbTableResult, group: null };
                } else {
                  const serviceGroup = serviceResult.length > 0 ? serviceResult[0].group : null;
                  serviceData[service] = { jsonData, data: dbTableResult, group: serviceGroup };
                }

                completedQueries++;
                checkCompletion();
              });
            });

          } catch (parseErr) {
            console.error("Error parsing JSON for service:", service, parseErr);
            completedQueries++;
            checkCompletion();
          }
        });
      });
    });
  },

  getCMEFormDataByApplicationId: (
    candidate_application_id,
    db_table,
    callback
  ) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const checkTableSql = `
        SELECT COUNT(*) AS count 
        FROM information_schema.tables 
        WHERE table_schema = ? AND table_name = ?`;

      connection.query(
        checkTableSql,
        [process.env.DB_NAME || "goldquest", db_table],
        (tableErr, tableResults) => {
          if (tableErr) {
            console.error("Error checking table existence:", tableErr);
            connectionRelease(connection);
            return callback(tableErr);
          }

          if (tableResults[0].count === 0) {
            const createTableSql = `
            CREATE TABLE \`${db_table}\` (
                \`id\` INT NOT NULL AUTO_INCREMENT,
                \`cef_id\` INT NOT NULL,
                \`candidate_application_id\` INT NOT NULL,
                \`branch_id\` INT(11) NOT NULL,
                \`customer_id\` INT(11) NOT NULL,
                \`status\` ENUM(
                          'nil', 'initiated', 'hold', 'closure_advice', 'wip', 'insuff', 'completed', 
                          'stopcheck', 'active_employment', 'not_doable', 'candidate_denied', 
                          'completed_green', 'completed_orange', 'completed_red', 'completed_yellow', 'completed_pink'
                        ) DEFAULT NULL,
                \`is_submitted\` TINYINT(1) DEFAULT 0,
                \`is_billed\` TINYINT(1) DEFAULT 0,
                \`billed_date\` TIMESTAMP NULL DEFAULT NULL,
                \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`),
                KEY \`candidate_application_id\` (\`candidate_application_id\`),
                KEY \`cef_application_customer_id\` (\`customer_id\`),
                KEY \`cef_application_cef_id\` (\`cef_id\`),
                CONSTRAINT \`fk_${db_table}_candidate_application_id\` FOREIGN KEY (\`candidate_application_id\`) 
                    REFERENCES \`candidate_applications\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`fk_${db_table}_customer_id\` FOREIGN KEY (\`customer_id\`) 
                    REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`fk_${db_table}_cef_id\` FOREIGN KEY (\`cef_id\`) 
                    REFERENCES \`cef_applications\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

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
            const sql = `SELECT * FROM \`${db_table}\` WHERE \`candidate_application_id\` = ?`;
            connection.query(
              sql,
              [candidate_application_id],
              (queryErr, results) => {
                connectionRelease(connection);
                if (queryErr) {
                  console.error("Error executing query:", queryErr);
                  return callback(queryErr);
                }
                const response = results.length > 0 ? results[0] : null;
                callback(null, response);
              }
            );
          }
        }
      );
    });
  },

  getCEFApplicationById: (
    candidate_application_id,
    branch_id,
    customer_id,
    callback
  ) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const sql =
        "SELECT * FROM `cef_applications` WHERE `candidate_application_id` = ? AND `branch_id` = ? AND `customer_id` = ?";
      connection.query(
        sql,
        [candidate_application_id, branch_id, customer_id],
        (queryErr, results) => {
          connectionRelease(connection);
          if (queryErr) {
            console.error("Database query error: 108", queryErr);
            return callback(queryErr, null);
          }
          callback(null, results[0]);
        }
      );
    });
  },

  create: (
    personal_information,
    is_employment_gap,
    is_education_gap,
    candidate_application_id,
    branch_id,
    customer_id,
    callback
  ) => {
    const fields = Object.keys(personal_information);

    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const checkColumnsSql = `SHOW COLUMNS FROM \`cef_applications\``;

      connection.query(checkColumnsSql, (checkErr, results) => {
        if (checkErr) {
          console.error("Error checking columns:", checkErr);
          connectionRelease(connection);
          return callback(checkErr, null);
        }

        const existingColumns = results.map((row) => row.Field);
        const missingColumns = fields.filter(
          (field) => !existingColumns.includes(field)
        );
        if (missingColumns.length > 0) {
          const alterQueries = missingColumns.map((column) => {
            return `ALTER TABLE cef_applications ADD COLUMN ${column} LONGTEXT`;
          });

          const alterPromises = alterQueries.map(
            (query) =>
              new Promise((resolve, reject) => {
                connection.query(query, (alterErr) => {
                  if (alterErr) {
                    console.error("Error adding column:", alterErr);
                    return reject(alterErr);
                  }
                  resolve();
                });
              })
          );

          Promise.all(alterPromises)
            .then(() => {
              cef.insertOrUpdateEntry(
                personal_information,
                is_employment_gap,
                is_education_gap,
                candidate_application_id,
                branch_id,
                customer_id,
                callback
              );
            })
            .catch((alterErr) => {
              console.error("Error executing ALTER statements:", alterErr);
              connectionRelease(connection);
              callback(alterErr, null);
            });
        } else {
          cef.insertOrUpdateEntry(
            personal_information,
            is_employment_gap,
            is_education_gap,
            candidate_application_id,
            branch_id,
            customer_id,
            callback
          );
        }
      });
    });
  },

  // Helper function for inserting or updating the entry
  insertOrUpdateEntry: (
    personal_information,
    is_employment_gap,
    is_education_gap,
    candidate_application_id,
    branch_id,
    customer_id,
    callback
  ) => {
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      const checkEntrySql =
        "SELECT * FROM cef_applications WHERE candidate_application_id = ?";
      connection.query(
        checkEntrySql,
        [candidate_application_id],
        (entryErr, entryResults) => {
          if (entryErr) {
            console.error("Error checking entry existence:", entryErr);
            connectionRelease(connection);
            return callback(entryErr, null);
          }

          personal_information.is_employment_gap = is_employment_gap;
          personal_information.is_education_gap = is_education_gap;

          if (entryResults.length > 0) {
            // Entry exists, so update it
            personal_information.branch_id = branch_id;
            personal_information.customer_id = customer_id;

            const updateSql =
              "UPDATE cef_applications SET ? WHERE candidate_application_id = ?";
            connection.query(
              updateSql,
              [personal_information, candidate_application_id],
              (updateErr, updateResult) => {
                connectionRelease(connection);
                if (updateErr) {
                  console.error("Error updating application:", updateErr);
                  return callback(updateErr, null);
                }
                // Return the id (primary key) of the updated row
                const updatedId = entryResults[0].id; // Get the existing `id` from the SELECT result
                callback(null, { insertId: updatedId, result: updateResult });
              }
            );
          } else {
            // Entry does not exist, so insert it
            const insertSql = "INSERT INTO cef_applications SET ?";
            connection.query(
              insertSql,
              {
                ...personal_information,
                candidate_application_id,
                branch_id,
                customer_id,
              },
              (insertErr, insertResult) => {
                connectionRelease(connection);
                if (insertErr) {
                  console.error("Error inserting application:", insertErr);
                  return callback(insertErr, null);
                }
                callback(null, insertResult);
              }
            );
          }
        }
      );
    });
  },

  createOrUpdateAnnexure: (
    cef_id,
    candidate_application_id,
    branch_id,
    customer_id,
    db_table,
    mainJson,
    callback
  ) => {
    const removeKeys = [
      'created_at', 'updated_at', 'id',
      'cef_id', 'candidate_application_id',
      'branch_id', 'customer_id'
    ];

    removeKeys.forEach(key => delete mainJson[key]);
    const fields = Object.keys(mainJson);

    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      // 1. Check if the table exists
      const checkTableSql = `
            SELECT COUNT(*) AS count 
            FROM information_schema.tables 
            WHERE table_schema = ? AND table_name = ?`;

      connection.query(
        checkTableSql,
        [process.env.DB_NAME || "goldquest", db_table],
        (tableErr, tableResults) => {
          if (tableErr) {
            console.error("Error checking table existence:", tableErr);
            connectionRelease(connection);
            return callback(tableErr, null);
          }

          if (tableResults[0].count === 0) {
            const createTableSql = `
            CREATE TABLE \`${db_table}\` (
                \`id\` INT NOT NULL AUTO_INCREMENT,
                \`cef_id\` INT NOT NULL,
                \`candidate_application_id\` INT NOT NULL,
                \`branch_id\` INT(11) NOT NULL,
                \`customer_id\` INT(11) NOT NULL,
                \`status\` ENUM(
                          'nil', 'initiated', 'hold', 'closure_advice', 'wip', 'insuff', 'completed', 
                          'stopcheck', 'active_employment', 'not_doable', 'candidate_denied', 
                          'completed_green', 'completed_orange', 'completed_red', 'completed_yellow', 'completed_pink'
                        ) DEFAULT NULL,
                \`is_submitted\` TINYINT(1) DEFAULT 0,
                \`is_billed\` TINYINT(1) DEFAULT 0,
                \`billed_date\` TIMESTAMP NULL DEFAULT NULL,
                \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`),
                KEY \`candidate_application_id\` (\`candidate_application_id\`),
                KEY \`branch_id\` (\`branch_id\`),
                KEY \`cmt_application_customer_id\` (\`customer_id\`),
                KEY \`cmt_application_cef_id\` (\`cef_id\`),
                CONSTRAINT \`fk_${db_table}_candidate_application_id\` FOREIGN KEY (\`candidate_application_id\`) 
                    REFERENCES \`candidate_applications\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`fk_${db_table}_branch_id\` FOREIGN KEY (\`branch_id\`) 
                    REFERENCES \`branches\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`fk_${db_table}_customer_id\` FOREIGN KEY (\`customer_id\`) 
                    REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE,
                CONSTRAINT \`fk_${db_table}_cef_id\` FOREIGN KEY (\`cef_id\`) 
                    REFERENCES \`cef_applications\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

            connection.query(createTableSql, (createErr) => {
              if (createErr) {
                console.error("Error creating table:", createErr);
                connectionRelease(connection);
                return callback(createErr, null);
              }
              proceedToCheckColumns();
            });
          } else {
            proceedToCheckColumns();
          }

          function proceedToCheckColumns() {
            const checkColumnsSql = `SHOW COLUMNS FROM \`${db_table}\``;

            connection.query(checkColumnsSql, (err, results) => {
              if (err) {
                console.error("Error checking columns:", err);
                connectionRelease(connection);
                return callback(err, null);
              }

              const existingColumns = results.map((row) => row.Field);
              const missingColumns = fields.filter(
                (field) => !existingColumns.includes(field)
              );

              // 4. Add missing columns
              if (missingColumns.length > 0) {
                const alterQueries = missingColumns.map((column) => {
                  return `ALTER TABLE \`${db_table}\` ADD COLUMN \`${column}\` LONGTEXT`; // Adjust data type as necessary
                });

                // Run all ALTER statements in sequence
                const alterPromises = alterQueries.map(
                  (query) =>
                    new Promise((resolve, reject) => {
                      connection.query(query, (alterErr) => {
                        if (alterErr) {
                          console.error("Error adding column:", alterErr);
                          return reject(alterErr);
                        }
                        resolve();
                      });
                    })
                );

                Promise.all(alterPromises)
                  .then(() => checkAndUpdateEntry())
                  .catch((alterErr) => {
                    console.error(
                      "Error executing ALTER statements:",
                      alterErr
                    );
                    connectionRelease(connection);
                    callback(alterErr, null);
                  });
              } else {
                checkAndUpdateEntry();
              }
            });
          }

          function checkAndUpdateEntry() {
            // 5. Check if entry exists by candidate_application_id
            const checkEntrySql = `SELECT * FROM \`${db_table}\` WHERE candidate_application_id = ?`;
            connection.query(
              checkEntrySql,
              [candidate_application_id],
              (entryErr, entryResults) => {
                if (entryErr) {
                  console.error("Error checking entry existence:", entryErr);
                  connectionRelease(connection);
                  return callback(entryErr, null);
                }

                // 6. Insert or update the entry
                if (entryResults.length > 0) {
                  const updateSql = `UPDATE \`${db_table}\` SET ? WHERE candidate_application_id = ?`;
                  connection.query(
                    updateSql,
                    [mainJson, candidate_application_id],
                    (updateErr, updateResult) => {
                      connectionRelease(connection); // Ensure the connection is released
                      if (updateErr) {
                        console.error("Error updating application:", updateErr);
                        return callback(updateErr, null);
                      }
                      callback(null, updateResult);
                    }
                  );
                } else {
                  const insertSql = `INSERT INTO \`${db_table}\` SET ?`;
                  connection.query(
                    insertSql,
                    {
                      ...mainJson,
                      candidate_application_id,
                      branch_id,
                      customer_id,
                      cef_id, // Include cef_id in the insert statement
                    },
                    (insertErr, insertResult) => {
                      connectionRelease(connection); // Ensure the connection is released
                      if (insertErr) {
                        console.error(
                          "Error inserting application:",
                          insertErr
                        );
                        return callback(insertErr, null);
                      }
                      callback(null, insertResult);
                    }
                  );
                }
              }
            );
          }
        }
      );
    });
  },

  upload: (
    cef_id,
    candidate_application_id,
    db_table,
    db_column,
    savedImagePaths,
    callback
  ) => {
    startConnection((err, connection) => {
      if (err) {
        console.error("Error starting connection:", err);
        return callback(false, {
          error: "Error starting database connection.",
          details: err,
        });
      }

      const checkTableSql = `
        SELECT COUNT(*) AS count 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = ?`;

      connection.query(checkTableSql, [db_table], (tableErr, tableResults) => {
        if (tableErr) {
          connectionRelease(connection);
          console.error("Error checking table existence:", tableErr);
          return callback(false, {
            error: "Error checking table existence.",
            details: tableErr,
          });
        }

        if (tableResults[0].count === 0) {

          const createTableSql = `
          CREATE TABLE \`${db_table}\` (
              \`id\` INT NOT NULL AUTO_INCREMENT,
              \`cef_id\` INT NOT NULL,
              \`candidate_application_id\` INT NOT NULL,
              \`branch_id\` INT(11) NOT NULL,
              \`customer_id\` INT(11) NOT NULL,
              \`status\` ENUM(
                          'nil', 'initiated', 'hold', 'closure_advice', 'wip', 'insuff', 'completed', 
                          'stopcheck', 'active_employment', 'not_doable', 'candidate_denied', 
                          'completed_green', 'completed_orange', 'completed_red', 'completed_yellow', 'completed_pink'
                        ) DEFAULT NULL,
              \`is_submitted\` TINYINT(1) DEFAULT 0,
              \`is_billed\` TINYINT(1) DEFAULT 0,
              \`billed_date\` TIMESTAMP NULL DEFAULT NULL,
              \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
              \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (\`id\`),
              KEY \`candidate_application_id\` (\`candidate_application_id\`),
              KEY \`branch_id\` (\`branch_id\`),
              KEY \`cmt_application_customer_id\` (\`customer_id\`),
              KEY \`cmt_application_cef_id\` (\`cef_id\`),
              CONSTRAINT \`fk_${db_table}_candidate_application_id\` FOREIGN KEY (\`candidate_application_id\`) 
                  REFERENCES \`candidate_applications\` (\`id\`) ON DELETE CASCADE,
              CONSTRAINT \`fk_${db_table}_branch_id\` FOREIGN KEY (\`branch_id\`) 
                  REFERENCES \`branches\` (\`id\`) ON DELETE CASCADE,
              CONSTRAINT \`fk_${db_table}_customer_id\` FOREIGN KEY (\`customer_id\`) 
                  REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE,
              CONSTRAINT \`fk_${db_table}_cef_id\` FOREIGN KEY (\`cef_id\`) 
                  REFERENCES \`cef_applications\` (\`id\`) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `;

          connection.query(createTableSql, (createErr) => {
            if (createErr) {
              connectionRelease(connection);
              console.error("Error creating table:", createErr);
              return callback(false, {
                error: "Error creating table.",
                details: createErr,
              });
            }
            proceedToCheckColumns();
          });
        } else {
          proceedToCheckColumns();
        }

        function proceedToCheckColumns() {
          const currentColumnsSql = `SHOW COLUMNS FROM \`${db_table}\``;

          connection.query(currentColumnsSql, (err, results) => {
            if (err) {
              connectionRelease(connection);
              return callback(false, {
                error: "Error fetching current columns.",
                details: err,
              });
            }

            const existingColumns = results.map((row) => row.Field);
            const expectedColumns = [db_column];
            const missingColumns = expectedColumns.filter(
              (column) => !existingColumns.includes(column)
            );

            const addColumnPromises = missingColumns.map((column) => {
              return new Promise((resolve, reject) => {
                const alterTableSql = `ALTER TABLE \`${db_table}\` ADD COLUMN \`${column}\` LONGTEXT`;
                connection.query(alterTableSql, (alterErr) => {
                  if (alterErr) {
                    reject(alterErr);
                  } else {
                    resolve();
                  }
                });
              });
            });

            Promise.all(addColumnPromises)
              .then(() => {
                const insertSql = `UPDATE \`${db_table}\` SET \`${db_column}\` = ? WHERE \`candidate_application_id\` = ?`;
                const joinedPaths = savedImagePaths.join(", ");
                connection.query(
                  insertSql,
                  [joinedPaths, candidate_application_id],
                  (queryErr, results) => {
                    connectionRelease(connection);

                    if (queryErr) {
                      console.error("Error updating records:", queryErr);
                      return callback(false, {
                        error: "Error updating records.",
                        details: queryErr,
                      });
                    }
                    callback(true, results);
                  }
                );
              })
              .catch((columnErr) => {
                connectionRelease(connection);
                console.error("Error adding columns:", columnErr);
                callback(false, {
                  error: "Error adding columns.",
                  details: columnErr,
                });
              });
          });
        }
      });
    });
  },

  getAttachmentsByClientAppID: (candidate_application_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        console.error("Error starting connection:", err);
        return callback(err, null);
      }

      const sql =
        "SELECT `services` FROM `candidate_applications` WHERE `id` = ?";
      connection.query(sql, [candidate_application_id], (err, results) => {
        if (err) {
          console.error("Database query error: 26", err);
          connectionRelease(connection);
          return callback(err, null);
        }

        if (results.length > 0) {
          const cefSql =
            "SELECT `signature`, `resume_file`, `govt_id`, `pan_card_image`, `aadhar_card_image`, `passport_photo` FROM `cef_applications` WHERE `candidate_application_id` = ?";

          connection.query(
            cefSql,
            [candidate_application_id],
            (err, cefResults) => {
              if (err) {
                console.error("Database query error: 26", err);
                connectionRelease(connection);
                return callback(err, null);
              }

              // Merging cefResults with ongoing data (finalAttachments)
              let finalAttachments = [];

              // If cefResults contains any attachments, add them to finalAttachments
              if (cefResults.length > 0) {
                const cefData = cefResults[0];
                Object.keys(cefData).forEach((field) => {
                  if (cefData[field]) {
                    finalAttachments.push(cefData[field]); // Add non-falsy values to finalAttachments
                  }
                });
              }

              const services = results[0].services.split(","); // Split services by comma
              const dbTableFileInputs = {}; // Object to store db_table and its file inputs
              let completedQueries = 0;

              // Step 1: Loop through each service and perform actions
              services.forEach((service) => {
                const query =
                  "SELECT `json` FROM `cef_service_forms` WHERE `service_id` = ?";
                connection.query(query, [service], (err, result) => {
                  completedQueries++;

                  if (err) {
                    console.error(
                      "Error fetching JSON for service:",
                      service,
                      err
                    );
                  } else if (result.length > 0) {
                    try {
                      // Parse the JSON data
                      const rawJson = result[0].json;
                      const sanitizedJson = rawJson
                        .replace(/\\"/g, '"')
                        .replace(/\\'/g, "'");
                      const jsonData = JSON.parse(sanitizedJson);
                      const dbTable = jsonData.db_table;

                      // Initialize an array for the dbTable if not already present
                      if (!dbTableFileInputs[dbTable]) {
                        dbTableFileInputs[dbTable] = [];
                      }

                      // Extract inputs with type 'file' and add to the db_table array
                      jsonData.rows.forEach((row) => {
                        row.inputs.forEach((input) => {
                          if (input.type === "file") {
                            dbTableFileInputs[dbTable].push(input.name);
                          }
                        });
                      });
                    } catch (parseErr) {
                      console.error(
                        "Error parsing JSON for service:",
                        service,
                        parseErr
                      );
                    }
                  }

                  // When all services have been processed
                  if (completedQueries === services.length) {
                    // Fetch the host from the database and process file attachments
                    let tableQueries = 0;
                    const totalTables = Object.keys(dbTableFileInputs).length;

                    // Loop through each db_table and perform a query
                    for (const [dbTable, fileInputNames] of Object.entries(
                      dbTableFileInputs
                    )) {
                      const selectQuery = `SELECT ${fileInputNames.length > 0
                        ? fileInputNames.join(", ")
                        : "*"
                        } FROM cef_${dbTable} WHERE candidate_application_id = ?`;

                      connection.query(
                        selectQuery,
                        [candidate_application_id],
                        (err, rows) => {
                          tableQueries++;

                          if (err) {
                            console.error(
                              `Error querying table ${dbTable}:`,
                              err
                            );
                          } else {
                            // Combine values from each row into a single string
                            rows.forEach((row) => {
                              const attachments = Object.values(row)
                                .filter((value) => value) // Remove any falsy values
                                .join(","); // Join values by comma

                              // Split and concatenate the URL with each attachment
                              attachments.split(",").forEach((attachment) => {
                                finalAttachments.push(`${attachment}`);
                              });
                            });
                          }

                          // When all db_table queries are completed, return finalAttachments
                          if (tableQueries === totalTables) {
                            connectionRelease(connection); // Release connection before callback
                            callback(null, finalAttachments.join(", "));
                          }
                        }
                      );
                    }
                  }
                });
              });
            }
          );
        } else {
          connectionRelease(connection); // Release connection if no results found
          callback(null, []); // Return an empty array if no results found
        }
      });
    });
  },
};
module.exports = cef;
