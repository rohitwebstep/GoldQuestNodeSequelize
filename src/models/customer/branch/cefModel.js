const crypto = require("crypto");
const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const cef = {
  formJson: async (service_id, callback) => {
    try {
      const sql = "SELECT * FROM `cef_service_forms` WHERE `service_id` = ?";

      const [results] = await sequelize.query(sql, {
        replacements: [service_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

  updateSubmitStatus: async (data, callback) => {
    try {
      const { candidateAppId, status } = data;

      const sql = `
            UPDATE \`cef_applications\` 
            SET 
              \`is_submitted\` = ?
            WHERE \`candidate_application_id\` = ?
        `;

      const [results] = await sequelize.query(sql, {
        replacements: [status, candidateAppId],
        type: QueryTypes.UPDATE, // Correct type for UPDATE queries
      });

      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

  bgvFormOpened: async (candidate_application_id, callback) => {
    try {
      const sql = `
            UPDATE \`candidate_applications\` 
            SET 
              \`is_bgv_form_opened\` = ?
            WHERE \`id\` = ?
        `;

      const [results] = await sequelize.query(sql, {
        replacements: ['1', candidate_application_id],
        type: QueryTypes.UPDATE, // Correct query type
      });

      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

  updateReminderDetails: async (data, callback) => {
    try {
      const { candidateAppId } = data;

      const updateSQL = `
            UPDATE \`candidate_applications\` 
            SET 
                \`cef_last_reminder_sent_at\` = CURDATE(),
                \`dav_last_reminder_sent_at\` = CURDATE(),
                \`reminder_sent\` = \`reminder_sent\` + 1
            WHERE \`id\` = ?
        `;

      const [results] = await sequelize.query(updateSQL, {
        replacements: [candidateAppId],
        type: QueryTypes.UPDATE, // ✅ Correct query type for UPDATE
      });

      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

  unsubmittedApplications: async (callback) => {
    try {
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

      const results = await sequelize.query(sql, {
        replacements: [dayInterval, dayInterval],
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

  filledOrUnfilledServices: async (servicesIds, candidate_application_id, callback) => {
    try {
      if (!servicesIds) {
        return callback(null, {});
      }

      let services = Array.isArray(servicesIds) ? servicesIds : servicesIds.split(',').map(s => s.trim());
      if (services.length === 0) {
        return callback(null, {});
      }

      const serviceData = {};

      for (const service of services) {
        // Get JSON structure from cef_service_forms
        const query = "SELECT `json` FROM `cef_service_forms` WHERE `service_id` = ?";
        const result = await sequelize.query(query, {
          replacements: [service],
          type: QueryTypes.SELECT,
        });

        if (!result.length) {
          console.warn(`No JSON found for service: ${service}`);
          serviceData[service] = { heading: `Service ${service}`, is_submitted: false };
          continue;
        }

        let jsonData;
        try {
          const rawJson = result[0].json;
          const sanitizedJson = rawJson
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'");
          const jsonData = JSON.parse(sanitizedJson);
        } catch (jsonErr) {
          console.error(`Invalid JSON for service: ${service}`, jsonErr);
          serviceData[service] = { heading: `Service ${service}`, is_submitted: false };
          continue;
        }

        const dbTable = jsonData.db_table || null;
        const heading = jsonData.heading || `Service ${service}`;

        if (!dbTable) {
          console.warn(`Missing db_table for service: ${service}`);
          serviceData[service] = { heading, is_submitted: false };
          continue;
        }

        // Check submission status in cef_{dbTable}
        const sql = `SELECT is_submitted FROM \`cef_${dbTable}\` WHERE \`candidate_application_id\` = ?`;

        try {
          const dbTableResults = await sequelize.query(sql, {
            replacements: [candidate_application_id],
            type: QueryTypes.SELECT,
          });

          const isSubmitted = dbTableResults.length > 0 && dbTableResults[0].is_submitted === 1;
          serviceData[service] = { heading, is_submitted: isSubmitted };
        } catch (queryErr) {
          if (queryErr.code === "ER_NO_SUCH_TABLE") {
            console.warn(`Table "cef_${dbTable}" does not exist. Skipping service: ${service}`);
          } else {
            console.error(`Error executing query for service ${service}:`, queryErr);
          }
          serviceData[service] = { heading, is_submitted: false };
        }
      }

      callback(null, serviceData);
    } catch (error) {
      console.error("Error in filledOrUnfilledServices:", error);
      callback(error, null);
    }
  },

  formJsonWithData: async (services, candidate_application_id, callback) => {
    try {
      const serviceData = {}; // Object to store data for each service.

      // Step 1: Loop through each service and perform actions
      for (const service of services) {
        try {
          const query = "SELECT `json` FROM `cef_service_forms` WHERE `service_id` = ?";
          const serviceQuery = "SELECT `group` FROM `services` WHERE `id` = ?";

          // Fetch JSON structure for the service
          const result = await sequelize.query(query, {
            replacements: [service],
            type: QueryTypes.SELECT,
          });

          if (result.length === 0) {
            console.warn(`No JSON found for service: ${service}`);
            continue;
          }

          // Parse JSON safely
          const rawJson = result[0].json;
          const sanitizedJson = rawJson.replace(/\\"/g, '"').replace(/\\'/g, "'");
          const jsonData = JSON.parse(sanitizedJson);
          const dbTable = jsonData.db_table;

          // Fetch data from corresponding table
          const sql = `SELECT * FROM \`cef_${dbTable}\` WHERE \`candidate_application_id\` = ?`;
          const dbTableResults = await sequelize.query(sql, {
            replacements: [candidate_application_id],
            type: QueryTypes.SELECT,
          });

          const dbTableResult = dbTableResults.length > 0 ? dbTableResults[0] : null;

          // Fetch service group details
          const serviceResult = await sequelize.query(serviceQuery, {
            replacements: [service],
            type: QueryTypes.SELECT,
          });

          const serviceGroup = serviceResult.length > 0 ? serviceResult[0].group : null;

          // Store results
          serviceData[service] = { jsonData, data: dbTableResult, group: serviceGroup };

        } catch (error) {
          console.error(`Error processing service ${service}:`, error);
        }
      }

      // Return the final result
      return callback(null, serviceData);
    } catch (err) {
      console.error("Database connection error:", err);
      return callback({ message: "Failed to retrieve service data", error: err }, null);
    }
  },

  getCMEFormDataByApplicationId: async (candidate_application_id, db_table, callback) => {
    try {
      const checkTableSql = `
            SELECT COUNT(*) AS count 
            FROM information_schema.tables 
            WHERE table_schema = ? AND table_name = ?`;

      const tableResults = await sequelize.query(checkTableSql, {
        replacements: [process.env.DB_NAME || "goldquest", db_table],
        type: QueryTypes.SELECT,
      });

      if (tableResults[0].count === 0) {
        console.warn(`Table ${db_table} does not exist. Creating it now.`);

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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

        await sequelize.query(createTableSql, {
          type: QueryTypes.RAW, // Use RAW for DDL operations
        });
      }

      // Fetch data after ensuring table exists
      const fetchSql = `SELECT * FROM \`${db_table}\` WHERE \`candidate_application_id\` = ?`;

      const results = await sequelize.query(fetchSql, {
        replacements: [candidate_application_id],
        type: QueryTypes.SELECT,
      });

      const response = results.length > 0 ? results[0] : null;
      callback(null, response);
    } catch (error) {
      console.error("Error in getCMEFormDataByApplicationId:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

  getCEFApplicationById: async (candidate_application_id, branch_id, customer_id, callback) => {
    try {
      const sql = `
            SELECT * FROM \`cef_applications\` 
            WHERE \`candidate_application_id\` = ? 
            AND \`branch_id\` = ? 
            AND \`customer_id\` = ?`;

      const results = await sequelize.query(sql, {
        replacements: [candidate_application_id, branch_id, customer_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results.length > 0 ? results[0] : null);
    } catch (error) {
      console.error("Error in getCEFApplicationById:", error);
      callback({ message: "Database query failed", error }, null);
    }
  },

  create: async (
    personal_information,
    is_employment_gap,
    is_education_gap,
    candidate_application_id,
    branch_id,
    customer_id,
    callback
  ) => {
    const fields = Object.keys(personal_information);

    const checkColumnsSql = `SHOW COLUMNS FROM \`cef_applications\``;

    const results = await sequelize.query(checkColumnsSql, {
      type: QueryTypes.SELECT,
    });
    const existingColumns = results.map((row) => row.Field);
    const missingColumns = fields.filter(
      (field) => !existingColumns.includes(field)
    );
    if (missingColumns.length > 0) {
      const alterQueries = missingColumns.map((column) => {
        return `ALTER TABLE cef_applications ADD COLUMN ${column} LONGTEXT`;
      });

      const alterPromises = alterQueries.map(
        async (query) =>
          await sequelize.query(query, {
            type: QueryTypes.ALTER,
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

  },

  // Helper function for inserting or updating the entry
  insertOrUpdateEntry: async (
    personal_information,
    is_employment_gap,
    is_education_gap,
    candidate_application_id,
    branch_id,
    customer_id,
    callback
  ) => {
    try {
      const checkEntrySql = "SELECT * FROM cef_applications WHERE candidate_application_id = ?";
      const entryResults = await sequelize.query(checkEntrySql, {
        replacements: [candidate_application_id],
        type: QueryTypes.SELECT,
      });

      personal_information.is_employment_gap = is_employment_gap;
      personal_information.is_education_gap = is_education_gap;

      if (entryResults.length > 0) {
        // Entry exists, so update it
        personal_information.branch_id = branch_id;
        personal_information.customer_id = customer_id;

        // Filter out undefined, null, or empty values and avoid updating primary keys
        const filteredInformation = Object.fromEntries(
          Object.entries(personal_information).filter(
            ([key, value]) =>
              key !== "candidate_application_id" &&
              value !== undefined &&
              value !== null &&
              value !== ""
          )
        );

        // Generate SET clause with named bindings
        const setClause = Object.keys(filteredInformation)
          .map((key) => `\`${key}\` = :${key}`)
          .join(", ");

        const updateSql = `UPDATE cef_applications SET ${setClause} WHERE candidate_application_id = :candidate_application_id`;

        const updateResult = await sequelize.query(updateSql, {
          replacements: {
            ...filteredInformation,
            candidate_application_id,
          },
          type: QueryTypes.UPDATE,
        });

        const updatedId = entryResults[0].id;
        callback(null, { insertId: updatedId, result: updateResult });
      } else {
        // Combine insert data
        const replacements = {
          ...personal_information,
          candidate_application_id,
          branch_id,
          customer_id,
        };

        // Filter out undefined, null, or empty values
        const filteredInformation = Object.fromEntries(
          Object.entries(replacements).filter(
            ([_, value]) => value !== undefined && value !== null && value !== ""
          )
        );

        const keys = Object.keys(filteredInformation);
        const values = Object.values(filteredInformation);

        const insertSql = `INSERT INTO cef_applications (${keys.join(", ")}) VALUES (${keys
          .map(() => "?")
          .join(", ")})`;

        const insertResult = await sequelize.query(insertSql, {
          replacements: values,
          type: QueryTypes.INSERT,
        });

        const insertId = insertResult[0];
        callback(null, { insertId });
      }
    } catch (error) {
      callback(error);
    }
  },

  createOrUpdateAnnexure: async (
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

    // 1. Check if the table exists
    const checkTableSql = `
            SELECT COUNT(*) AS count 
            FROM information_schema.tables 
            WHERE table_schema = ? AND table_name = ?`;

    const tableResults = await sequelize.query(checkTableSql, {
      replacements: [process.env.DB_NAME || "goldquest", db_table],
      type: QueryTypes.SELECT,
    });

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

      await sequelize.query(createTableSql, {
        type: QueryTypes.SELECT,
      });
      proceedToCheckColumns();
    } else {
      proceedToCheckColumns();
    }

    async function proceedToCheckColumns() {
      const checkColumnsSql = `SHOW COLUMNS FROM \`${db_table}\``;
      const results = await sequelize.query(checkColumnsSql, {
        type: QueryTypes.SELECT,
      });

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
          async (query) =>
            await sequelize.query(query, {
              type: QueryTypes.SELECT,
            })
        );

        Promise.all(alterPromises)
          .then(() => checkAndUpdateEntry())
          .catch((alterErr) => {
            console.error(
              "Error executing ALTER statements:",
              alterErr
            );
            callback(alterErr, null);
          });
      } else {
        checkAndUpdateEntry();
      }

    }

    async function checkAndUpdateEntry() {
      // 5. Check if entry exists by candidate_application_id
      const checkEntrySql = `SELECT * FROM \`${db_table}\` WHERE candidate_application_id = ?`;
      const entryResults = await sequelize.query(checkEntrySql, {
        replacements: [candidate_application_id],
        type: QueryTypes.SELECT,
      });

      if (entryResults.length > 0) {
        // Use named replacements
        const setKeys = Object.keys(mainJson);
        const setClause = setKeys.map((key) => `\`${key}\` = :${key}`).join(', ');

        const updateSql = `UPDATE \`${db_table}\` SET ${setClause} WHERE candidate_application_id = :candidate_application_id`;

        const updateResult = await sequelize.query(updateSql, {
          replacements: {
            ...mainJson,
            candidate_application_id,
          },
          type: QueryTypes.UPDATE,
        });

        callback(null, updateResult);
      } else {
        const replacements = {
          ...mainJson,
          candidate_application_id,
          branch_id,
          customer_id,
          cef_id,
        };

        const keys = Object.keys(replacements);
        const values = Object.values(replacements);

        const insertSql = `INSERT INTO \`${db_table}\` (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;

        const insertResult = await sequelize.query(insertSql, {
          replacements: values,
          type: QueryTypes.INSERT,
        });

        const insertId = insertResult[0];
        callback(null, { insertId });
      }
    }
  },

  upload: async (
    cef_id,
    candidate_application_id,
    db_table,
    db_column,
    savedImagePaths,
    callback
  ) => {
    const checkTableSql = `
        SELECT COUNT(*) AS count 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = ?`;

    const tableResults = await sequelize.query(checkTableSql, {
      replacements: [db_table],
      type: QueryTypes.SELECT,
    });

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


      await sequelize.query(createTableSql, {
        replacements: [interfaceType],
        type: QueryTypes.SELECT,
      });
      proceedToCheckColumns();
    } else {
      proceedToCheckColumns();
    }

    async function proceedToCheckColumns() {

      const currentColumnsSql = `SHOW COLUMNS FROM \`${db_table}\``;
      const results = await sequelize.query(currentColumnsSql, {
        type: QueryTypes.SELECT,
      });

      const existingColumns = results.map((row) => row.Field);
      const expectedColumns = [db_column];
      const missingColumns = expectedColumns.filter(
        (column) => !existingColumns.includes(column)
      );

      const addColumnPromises = missingColumns.map(async (column) => {
        const alterTableSql = `ALTER TABLE \`${db_table}\` ADD COLUMN \`${column}\` LONGTEXT`;

        await sequelize.query(alterTableSql, {
          type: QueryTypes.ALTER,
        });
      });

      Promise.all(addColumnPromises)
        .then(async () => {
          const insertSql = `UPDATE \`${db_table}\` SET \`${db_column}\` = ? WHERE \`candidate_application_id\` = ?`;
          const joinedPaths = savedImagePaths.join(", ");
          const results = await sequelize.query(insertSql, {
            replacements: [joinedPaths, candidate_application_id],
            type: QueryTypes.UPDATE,
          });
          callback(true, results);
        })
        .catch((columnErr) => {
          console.error("Error adding columns:", columnErr);
          callback(false, {
            error: "Error adding columns.",
            details: columnErr,
          });
        });

    }


  },

  getAttachmentsByClientAppID: async (candidate_application_id, callback) => {
    try {
      const sql = "SELECT `services` FROM `candidate_applications` WHERE `id` = ?";
      const results = await sequelize.query(sql, {
        replacements: [candidate_application_id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback(null, []);
      }

      // Fetch attachments from cef_applications
      const cefSql =
        "SELECT `signature`, `resume_file`, `govt_id`, `pan_card_image`, `aadhar_card_image`, `passport_photo` FROM `cef_applications` WHERE `candidate_application_id` = ?";
      const cefResults = await sequelize.query(cefSql, {
        replacements: [candidate_application_id],
        type: QueryTypes.SELECT,
      });

      let finalAttachments = [];

      // If attachments exist in cef_applications, add them
      if (cefResults.length > 0) {
        for (const field in cefResults[0]) {
          if (cefResults[0][field]) {
            finalAttachments.push(cefResults[0][field]); // Push only non-null values
          }
        }
      }

      // Process services
      const services = results[0].services.split(",");
      const dbTableFileInputs = {};

      for (const service of services) {
        const query = "SELECT `json` FROM `cef_service_forms` WHERE `service_id` = ?";
        const result = await sequelize.query(query, {
          replacements: [service],
          type: QueryTypes.SELECT,
        });

        if (result.length > 0) {
          try {
            const rawJson = result[0].json.replace(/\\"/g, '"').replace(/\\'/g, "'");
            const jsonData = JSON.parse(rawJson);
            const dbTable = jsonData.db_table;

            if (!dbTableFileInputs[dbTable]) {
              dbTableFileInputs[dbTable] = [];
            }

            for (const row of jsonData.rows) {
              for (const input of row.inputs) {
                if (input.type === "file") {
                  dbTableFileInputs[dbTable].push(input.name);
                }
              }
            }
          } catch (parseErr) {
            console.error("Error parsing JSON for service:", service, parseErr);
          }
        }
      }

      // Fetch attachments from related tables
      for (const [dbTable, fileInputNames] of Object.entries(dbTableFileInputs)) {
        if (fileInputNames.length === 0) continue;

        const selectQuery = `SELECT ${fileInputNames.join(", ")} FROM cef_${dbTable} WHERE candidate_application_id = ?`;
        const rows = await sequelize.query(selectQuery, {
          replacements: [candidate_application_id],
          type: QueryTypes.SELECT,
        });

        for (const row of rows) {
          for (const value of Object.values(row)) {
            if (value) {
              finalAttachments.push(value);
            }
          }
        }
      }

      callback(null, finalAttachments.join(", "));
    } catch (error) {
      console.error("Error fetching attachments:", error);
      callback(error, null);
    }
  },

};
module.exports = cef;
