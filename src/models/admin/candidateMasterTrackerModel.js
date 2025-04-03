const crypto = require("crypto");
const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

// Function to hash the password using MD5
const hashPassword = (password) =>
  crypto.createHash("md5").update(password).digest("hex");

const Customer = {

  list: async (filter_status, callback) => {
    try {
      let customersIDConditionString = "";

      if (filter_status && filter_status !== null && filter_status.trim() !== "") {
        // Query when `filter_status` exists
        const sql = `
          SELECT b.customer_id, 
                 b.id AS branch_id, 
                 b.name AS branch_name, 
                 COUNT(ca.id) AS application_count,
                 MAX(ca.created_at) AS latest_application_date
          FROM candiate_applications ca
          INNER JOIN branches b ON ca.branch_id = b.id
          WHERE ca.status = ?
          GROUP BY b.customer_id, b.id, b.name
          ORDER BY latest_application_date DESC;
        `;

        const results = await sequelize.query(sql, {
          replacements: [filter_status],
          type: QueryTypes.SELECT,
        });

        const customers_id = results.map(row => row.customer_id);
        if (customers_id.length > 0) {
          customersIDConditionString = ` AND customers.id IN (${customers_id.join(",")})`;
        }
      }

      // If no filter_status is provided, proceed with the final SQL query without filters
      const finalSql = `
                          WITH BranchesCTE AS (
                    SELECT 
                        b.id AS branch_id,
                        b.customer_id
                    FROM 
                        branches b
                    WHERE 
                        EXISTS (
                            SELECT 1 
                            FROM candidate_applications ca 
                            WHERE ca.branch_id = b.id
                        )
                ),
                ApplicationCounts AS (
                    SELECT 
                        b.customer_id, 
                        COUNT(ca.id) AS application_count,
                        MAX(ca.created_at) AS latest_application_date
                    FROM 
                        BranchesCTE b
                    INNER JOIN 
                        candidate_applications ca ON b.branch_id = ca.branch_id
                    GROUP BY 
                        b.customer_id
                )
                SELECT 
                    customers.client_unique_id,
                    customers.name,
                    customer_metas.tat_days,
                    customer_metas.single_point_of_contact,
                    customers.id AS main_id,
                    COALESCE(branch_counts.branch_count, 0) AS branch_count,
                    COALESCE(application_counts.application_count, 0) AS application_count
                FROM 
                    customers
                LEFT JOIN 
                    customer_metas ON customers.id = customer_metas.customer_id
                LEFT JOIN (
                    SELECT 
                        b.customer_id, 
                        COUNT(*) AS branch_count
                    FROM 
                        branches b
                    WHERE 
                        EXISTS (
                            SELECT 1 
                            FROM candidate_applications ca 
                            WHERE ca.branch_id = b.id
                        )
                    GROUP BY 
                        b.customer_id
                ) AS branch_counts ON customers.id = branch_counts.customer_id
                LEFT JOIN 
                    ApplicationCounts application_counts ON customers.id = application_counts.customer_id
                WHERE 
                    COALESCE(application_counts.application_count, 0) > 0
                    ${customersIDConditionString}
                ORDER BY 
                    application_counts.latest_application_date DESC;
        `;

      const finalResults = await sequelize.query(finalSql, {
        type: QueryTypes.SELECT,
      });

      callback(null, finalResults);
    } catch (error) {
      callback(error, null);
    }
  },

  listByCustomerID: async (customer_id, filter_status, callback) => {
    try {
      let sql = `
        SELECT b.id AS branch_id, 
               b.name AS branch_name, 
               COUNT(ca.id) AS application_count,
               MAX(ca.created_at) AS latest_application_date
        FROM candidate_applications ca
        INNER JOIN branches b ON ca.branch_id = b.id
        WHERE b.customer_id = ?`;

      const queryParams = [customer_id];

      if (filter_status && filter_status.trim() !== "") {
        sql += ` AND ca.status = ?`;
        queryParams.push(filter_status);
      }

      sql += ` GROUP BY b.id, b.name 
               ORDER BY latest_application_date DESC;`;

      const results = await sequelize.query(sql, {
        replacements: queryParams,
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error in listByCustomerID:", error);
      callback(error, null);
    }
  },

  applicationListByBranch: async (filter_status, branch_id, status, callback) => {
    try {
      let sql = `
              SELECT 
                  ca.*, 
                  ca.id AS main_id, 
                  CASE 
                      WHEN cef.is_submitted = '1' OR cef.is_submitted = 1 THEN cef.created_at
                      ELSE NULL
                  END AS cef_filled_date,
                  cef.is_employment_gap,
                  cef.is_education_gap,
                  cef.created_at,
                  CASE 
                      WHEN cef.is_submitted = '1' OR cef.is_submitted = 1 THEN cef.id
                      ELSE NULL
                  END AS cef_id,
                  CASE 
                      WHEN dav.is_submitted = '1' OR dav.is_submitted = 1 THEN dav.created_at
                      ELSE NULL
                  END AS dav_filled_date,
                  CASE 
                      WHEN dav.is_submitted = '1' OR dav.is_submitted = 1 THEN dav.id
                      ELSE NULL
                  END AS dav_id,
                  c.client_unique_id,
                  CASE 
                      WHEN cef.is_submitted = '1' OR cef.is_submitted = 1 THEN 1
                      WHEN cef.is_submitted = '0' OR cef.is_submitted = 0 THEN 0
                      ELSE 0
                  END AS cef_submitted,
                  CASE 
                      WHEN dav.is_submitted = '1' OR dav.is_submitted = 1 THEN 1
                      WHEN dav.is_submitted = '0' OR dav.is_submitted = 0 THEN 0
                      ELSE 0
                  END AS dav_submitted,
                  CASE 
                    WHEN cef.is_submitted = 0 
                      AND ca.reminder_sent = 5 
                      AND GREATEST(COALESCE(cef_last_reminder_sent_at, '0000-00-00'), COALESCE(dav_last_reminder_sent_at, '0000-00-00')) < DATE_SUB(CURDATE(), INTERVAL 1 DAY) 
                    THEN 1 
                    ELSE 0 
                  END AS is_expired
              FROM 
                  \`candidate_applications\` ca
              INNER JOIN 
                  \`customers\` c
              ON 
                  c.id = ca.customer_id
              LEFT JOIN 
                  \`cef_applications\` cef 
              ON 
                  ca.id = cef.candidate_application_id
              LEFT JOIN 
                  \`dav_applications\` dav 
              ON 
                  ca.id = dav.candidate_application_id
              WHERE 
                  ca.\`branch_id\` = ?`;

      const params = [branch_id];

      if (filter_status && filter_status.trim() !== "") {
        sql += ` AND ca.\`status\` = ?`;
        params.push(filter_status);
      } else if (typeof status === "string" && status.trim() !== "") {
        sql += ` AND ca.\`status\` = ?`;
        params.push(status);
      }

      sql += ` ORDER BY ca.\`created_at\` DESC;`;

      const results = await sequelize.query(sql, {
        replacements: params,
        type: QueryTypes.SELECT,
      });

      // Fetch Digital Address Verification service
      const davSql = `
              SELECT id FROM \`services\`
              WHERE LOWER(\`title\`) LIKE '%digital%' 
              AND (LOWER(\`title\`) LIKE '%verification%' OR LOWER(\`title\`) LIKE '%address%')
              LIMIT 1`;

      const davResults = await sequelize.query(davSql, { type: QueryTypes.SELECT });
      const digitalAddressID = davResults.length > 0 ? parseInt(davResults[0].id, 10) : null;

      // Process each candidate application
      await Promise.all(
        results.map(async (candidateApp) => {
          candidateApp.applications_id = `CD-${candidateApp.client_unique_id}-${candidateApp.main_id}`;
          const servicesResult = { cef: {}, dav: {} };
          const servicesIds = candidateApp.services ? candidateApp.services.split(",") : [];

          if (servicesIds.length > 0) {
            // Fetch service titles
            const servicesQuery = "SELECT title FROM `services` WHERE id IN (?)";
            try {
              const servicesResults = await sequelize.query(servicesQuery, {
                replacements: [servicesIds],
                type: QueryTypes.SELECT,
              });
              candidateApp.serviceNames = servicesResults.map((service) => service.title);
            } catch (error) {
              console.error("Error fetching service titles:", error);
            }
          }

          // Check if DAV service exists
          candidateApp.dav_exist = servicesIds.includes(String(digitalAddressID)) ? 1 : 0;

          // Fetch DAV details
          if (candidateApp.dav_submitted === 1) {
            const checkDavSql = `
                          SELECT identity_proof, home_photo, locality
                          FROM \`dav_applications\`
                          WHERE \`candidate_application_id\` = ?`;

            try {
              const davResults = await sequelize.query(checkDavSql, {
                replacements: [candidateApp.main_id],
                type: QueryTypes.SELECT,
              });

              if (davResults.length > 0) {
                davResults.forEach((davResult) => {
                  Object.entries({
                    identity_proof: "Identity Proof",
                    home_photo: "Home Photo",
                    locality: "Locality",
                  }).forEach(([key, label]) => {
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

          // Fetch CEF details
          if (candidateApp.cef_submitted === 1) {
            const checkCefSql = `
                          SELECT signature, resume_file, govt_id, pan_card_image, aadhar_card_image, passport_photo
                          FROM \`cef_applications\`
                          WHERE \`candidate_application_id\` = ?`;

            try {
              const cefResults = await sequelize.query(checkCefSql, {
                replacements: [candidateApp.main_id],
                type: QueryTypes.SELECT,
              });

              if (cefResults.length > 0) {
                const candidateBasicAttachments = [];

                cefResults.forEach((cefResult) => {
                  Object.entries({
                    signature: "Signature",
                    resume_file: "Resume File",
                    govt_id: "Govt ID",
                    pan_card_image: "Pan Card Image",
                    aadhar_card_image: "Aadhar Card Image",
                    passport_photo: "Passport Photo",
                  }).forEach(([key, label]) => {
                    if (cefResult[key]) {
                      candidateBasicAttachments.push({ [label]: cefResult[key] });
                    }
                  });
                });

                servicesResult.cef["Candidate Basic Attachments"] = candidateBasicAttachments;
                candidateApp.service_data = servicesResult;
              }

              const dbTableFileInputs = {};
              const dbTableColumnLabel = {};
              const dbTableWithHeadings = {};

              try {
                // Fetch JSON data for all services
                await Promise.all(
                  servicesIds.map(async (service) => {
                    const query = "SELECT `json` FROM `cef_service_forms` WHERE `service_id` = ?";
                    const result = await sequelize.query(query, {
                      replacements: [service],
                      type: QueryTypes.SELECT,
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

                const tableQueries = await Promise.all(
                  Object.entries(dbTableFileInputs).map(async ([dbTable, fileInputNames]) => {
                    if (fileInputNames.length === 0) {
                      console.log(`Skipping table ${dbTable} as fileInputNames is empty 1.`);
                      return;
                    }

                    try {
                      // Fetch existing columns in the table
                      const describeQuery = `DESCRIBE cef_${dbTable}`;
                      const existingColumns = await sequelize.query(describeQuery, {
                        type: QueryTypes.SELECT,
                      });

                      const columnNames = existingColumns.map((col) => col.Field);
                      const validColumns = fileInputNames.filter((col) => columnNames.includes(col));

                      if (validColumns.length === 0) {
                        console.log(`Skipping table ${dbTable} as no valid columns exist.`);
                        return;
                      }

                      // Fetch relevant data
                      const selectQuery = `SELECT ${validColumns.join(", ")} FROM cef_${dbTable} WHERE candidate_application_id = ?`;
                      const rows = await sequelize.query(selectQuery, {
                        replacements: [candidateApp.main_id],
                        type: QueryTypes.SELECT,
                      });

                      // Map column names to labels
                      const updatedRows = rows.map((row) => {
                        const updatedRow = {};
                        Object.entries(row).forEach(([key, value]) => {
                          if (value != null && value.trim() !== "") {
                            updatedRow[dbTableColumnLabel[key] || key] = value;
                          }
                        });
                        return updatedRow;
                      });

                      if (
                        updatedRows.length > 0 &&
                        updatedRows.some((row, index) => {
                          const isValid = Object.keys(row).length > 0 && Object.values(row).some(value => value !== undefined && value !== null && value !== '');
                          return isValid;
                        })
                      ) {

                        // Filter the rows based on the condition that both the index and value are not empty
                        const validRows = updatedRows.filter((row, index) => {
                          const isValid = Object.keys(row).length > 0 &&
                            Object.values(row).some(value => value !== undefined && value !== null && value !== '');
                          return isValid;
                        });


                        servicesResult.cef[dbTableWithHeadings[dbTable]] = validRows;
                      }

                    } catch (error) {
                      console.error(`Error processing table ${dbTable}:`, error);
                    }
                  })
                );

                if (tableQueries.length > 0) {
                  candidateApp.service_data = servicesResult;
                }
              } catch (error) {
                return Promise.reject(error);
              }

            } catch (error) {
              console.error("Error processing CEF services:", error);
            }
          }
        })
      );

      callback(null, results);
    } catch (error) {
      console.error("Error processing candidate applications:", error);
      callback(error, null);
    }
  },

  applicationListByBranchByCandidateID: async (candidate_application_id, branch_id, callback) => {
    try {
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
                  c.client_unique_id,
                  CASE WHEN cef.id IS NOT NULL THEN 1 ELSE 0 END AS cef_submitted,
                  CASE WHEN dav.id IS NOT NULL THEN 1 ELSE 0 END AS dav_submitted
              FROM 
                  \`candidate_applications\` ca
              INNER JOIN 
                  \`customers\` c
              ON 
                  c.id = ca.customer_id
              LEFT JOIN 
                  \`cef_applications\` cef 
              ON 
                  ca.id = cef.candidate_application_id
              LEFT JOIN 
                  \`dav_applications\` dav 
              ON 
                  ca.id = dav.candidate_application_id
              WHERE 
                  ca.\`id\` = ?`;

      const params = [branch_id, candidate_application_id];

      sql += ` ORDER BY ca.\`created_at\` DESC;`;

      const results = await sequelize.query(sql, {
        replacements: params,
        type: QueryTypes.SELECT,
      });

      // Fetch Digital Address Verification service
      const davSql = `
              SELECT id FROM \`services\`
              WHERE LOWER(\`title\`) LIKE '%digital%' 
              AND (LOWER(\`title\`) LIKE '%verification%' OR LOWER(\`title\`) LIKE '%address%')
              LIMIT 1`;

      const davResults = await sequelize.query(davSql, { type: QueryTypes.SELECT });
      const digitalAddressID = davResults.length > 0 ? parseInt(davResults[0].id, 10) : null;

      // Process each candidate application
      await Promise.all(
        results.map(async (candidateApp) => {
          candidateApp.applications_id = `CD-${candidateApp.client_unique_id}-${candidateApp.main_id}`;
          const servicesResult = { cef: {}, dav: {} };
          const servicesIds = candidateApp.services ? candidateApp.services.split(",") : [];

          if (servicesIds.length > 0) {
            // Fetch service titles
            const servicesQuery = "SELECT title FROM `services` WHERE id IN (?)";
            try {
              const servicesResults = await sequelize.query(servicesQuery, {
                replacements: [servicesIds],
                type: QueryTypes.SELECT,
              });
              candidateApp.serviceNames = servicesResults.map((service) => service.title);
            } catch (error) {
              console.error("Error fetching service titles:", error);
            }
          }

          // Check if DAV service exists
          candidateApp.dav_exist = servicesIds.includes(String(digitalAddressID)) ? 1 : 0;

          // Fetch DAV details
          if (candidateApp.dav_submitted === 1) {
            const checkDavSql = `
                          SELECT identity_proof, home_photo, locality
                          FROM \`dav_applications\`
                          WHERE \`candidate_application_id\` = ?`;

            try {
              const davResults = await sequelize.query(checkDavSql, {
                replacements: [candidateApp.main_id],
                type: QueryTypes.SELECT,
              });

              if (davResults.length > 0) {
                davResults.forEach((davResult) => {
                  Object.entries({
                    identity_proof: "Identity Proof",
                    home_photo: "Home Photo",
                    locality: "Locality",
                  }).forEach(([key, label]) => {
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

          // Fetch CEF details
          if (candidateApp.cef_submitted === 1) {
            const checkCefSql = `
                          SELECT signature, resume_file, govt_id, pan_card_image, aadhar_card_image, passport_photo
                          FROM \`cef_applications\`
                          WHERE \`candidate_application_id\` = ?`;

            try {
              const cefResults = await sequelize.query(checkCefSql, {
                replacements: [candidateApp.main_id],
                type: QueryTypes.SELECT,
              });

              if (cefResults.length > 0) {
                const candidateBasicAttachments = [];

                cefResults.forEach((cefResult) => {
                  Object.entries({
                    signature: "Signature",
                    resume_file: "Resume File",
                    govt_id: "Govt ID",
                    pan_card_image: "Pan Card Image",
                    aadhar_card_image: "Aadhar Card Image",
                    passport_photo: "Passport Photo",
                  }).forEach(([key, label]) => {
                    if (cefResult[key]) {
                      candidateBasicAttachments.push({ [label]: cefResult[key] });
                    }
                  });
                });

                servicesResult.cef["Candidate Basic Attachments"] = candidateBasicAttachments;
                candidateApp.service_data = servicesResult;
              }

              const dbTableFileInputs = {};
              const dbTableColumnLabel = {};
              const dbTableWithHeadings = {};

              try {
                // Fetch JSON data for all services
                await Promise.all(
                  servicesIds.map(async (service) => {
                    const query = "SELECT `json` FROM `cef_service_forms` WHERE `service_id` = ?";
                    const result = await sequelize.query(query, {
                      replacements: [service],
                      type: QueryTypes.SELECT,
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

                const tableQueries = await Promise.all(
                  Object.entries(dbTableFileInputs).map(async ([dbTable, fileInputNames]) => {
                    if (fileInputNames.length === 0) {
                      console.log(`Skipping table ${dbTable} as fileInputNames is empty 2.`);
                      return;
                    }

                    try {
                      // Fetch existing columns in the table
                      const describeQuery = `DESCRIBE cef_${dbTable}`;
                      const existingColumns = await sequelize.query(describeQuery, {
                        type: QueryTypes.SELECT,
                      });

                      const columnNames = existingColumns.map((col) => col.Field);
                      const validColumns = fileInputNames.filter((col) => columnNames.includes(col));

                      if (validColumns.length === 0) {
                        console.log(`Skipping table ${dbTable} as no valid columns exist.`);
                        return;
                      }

                      // Fetch relevant data
                      const selectQuery = `SELECT ${validColumns.join(", ")} FROM cef_${dbTable} WHERE candidate_application_id = ?`;
                      const rows = await sequelize.query(selectQuery, {
                        replacements: [candidateApp.main_id],
                        type: QueryTypes.SELECT,
                      });

                      // Map column names to labels
                      const updatedRows = rows.map((row) => {
                        const updatedRow = {};
                        Object.entries(row).forEach(([key, value]) => {
                          if (value != null && value.trim() !== "") {
                            updatedRow[dbTableColumnLabel[key] || key] = value;
                          }
                        });
                        return updatedRow;
                      });

                      if (
                        updatedRows.length > 0 &&
                        updatedRows.some((row, index) => {
                          const isValid = Object.keys(row).length > 0 && Object.values(row).some(value => value !== undefined && value !== null && value !== '');
                          return isValid;
                        })
                      ) {

                        // Filter the rows based on the condition that both the index and value are not empty
                        const validRows = updatedRows.filter((row, index) => {
                          const isValid = Object.keys(row).length > 0 &&
                            Object.values(row).some(value => value !== undefined && value !== null && value !== '');
                          return isValid;
                        });


                        servicesResult.cef[dbTableWithHeadings[dbTable]] = validRows;
                      }
                    } catch (error) {
                      console.error(`Error processing table ${dbTable}:`, error);
                    }
                  })
                );

                if (tableQueries.length > 0) {
                  candidateApp.service_data = servicesResult;
                }
              } catch (error) {
                return Promise.reject(error);
              }

            } catch (error) {
              console.error("Error processing CEF services:", error);
            }
          }
        })
      );

      callback(null, results);
    } catch (error) {
      console.error("Error processing candidate applications:", error);
      callback(error, null);
    }
  },

  cefApplicationByID: async (application_id, branch_id, callback) => {
    try {
      // First, check if an entry exists in cef_applications
      const checkCefSql = `
        SELECT * 
        FROM \`cef_applications\` 
        WHERE 
          \`candidate_application_id\` = ? 
          AND \`branch_id\` = ?
      `;

      const cefResults = await sequelize.query(checkCefSql, {
        replacements: [application_id, branch_id],
        type: QueryTypes.SELECT,
      });

      // If no entry in cef_applications, return error
      if (cefResults.length === 0) {
        return callback(
          { message: "Candidate BGV form is not submitted yet" },
          null
        );
      }

      return callback(null, cefResults[0]);
    } catch (error) {
      console.error("Error fetching CEF application:", error);
      return callback({ message: "Internal Server Error" }, null);
    }
  },

  davApplicationByID: async (application_id, branch_id, callback) => {
    try {

      const checkCefSql = `
            SELECT * 
            FROM \`dav_applications\` 
            WHERE 
                \`candidate_application_id\` = ? 
                AND \`branch_id\` = ?
        `;

      const cefResults = await sequelize.query(checkCefSql, {
        replacements: [application_id, branch_id],
        type: QueryTypes.SELECT,
      });

      if (!cefResults.length) {
        return callback({ message: "Candidate DAV form is not submitted yet" }, null);
      }

      callback(null, cefResults[0]);
    } catch (error) {
      console.error("Model Step 4: Error occurred while fetching DAV application.", error);
      callback(error, null);
    }
  },

  applicationByID: async (application_id, branch_id, callback) => {
    try {
      const sql = `
        SELECT 
          ca.*, 
          ca.id AS main_id, 
          cef.created_at AS cef_filled_date,
          cef.id AS cef_id,
          dav.created_at AS dav_filled_date,
          dav.id AS dav_id,
          CASE WHEN cef.id IS NOT NULL THEN 1 ELSE 0 END AS cef_submitted,
          CASE WHEN dav.id IS NOT NULL THEN 1 ELSE 0 END AS dav_submitted,
          c.name AS customer_name
        FROM 
          \`candidate_applications\` ca
        LEFT JOIN 
          \`cef_applications\` cef ON ca.id = cef.candidate_application_id
        LEFT JOIN 
          \`dav_applications\` dav ON ca.id = dav.candidate_application_id
        LEFT JOIN 
          \`customers\` c ON ca.customer_id = c.id
        WHERE 
          ca.\`id\` = ? AND ca.\`branch_id\` = ?
        ORDER BY 
          ca.\`created_at\` DESC
        LIMIT 1;
      `;
      const params = [application_id, branch_id];

      const results = await sequelize.query(sql, {
        replacements: params,
        type: QueryTypes.SELECT,
      });

      const candidateApp = results[0];

      if (!candidateApp) {
        return callback({ message: 'Candidate application not found' }, null);
      }

      // Fetch service related to Digital Address Verification
      const davSql = `
        SELECT id FROM \`services\`
        WHERE 
          LOWER(\`title\`) LIKE '%digital%' AND 
          (LOWER(\`title\`) LIKE '%verification%' OR LOWER(\`title\`) LIKE '%address%')
        LIMIT 1;
      `;

      const davResults = await sequelize.query(davSql, {
        type: QueryTypes.SELECT,
      });

      let digitalAddressID = davResults.length > 0 ? parseInt(davResults[0].id, 10) : null;

      // Ensure services field is valid before splitting
      const services = typeof candidateApp.services === 'string' ? candidateApp.services.split(",") : [];
      candidateApp.dav_exist = services.includes(String(digitalAddressID)) ? 1 : 0;

      return callback(null, candidateApp);
    } catch (error) {
      console.error("Error fetching application details:", error);
      return callback({ message: "Internal Server Error" }, null);
    }
  },

  annexureData: async (client_application_id, db_table, callback) => {
    try {
      // Check if the table exists
      const checkTableSql = `
            SELECT COUNT(*) AS count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = ?
        `;

      const tableCheckResults = await sequelize.query(checkTableSql, {
        replacements: [db_table],
        type: QueryTypes.SELECT,
      });

      if (tableCheckResults[0].count === 0) {

        const createTableSql = `
                CREATE TABLE \`${db_table}\` (
                    \`id\` bigint(20) NOT NULL AUTO_INCREMENT,
                    \`cmt_id\` bigint(20) NOT NULL,
                    \`client_application_id\` bigint(20) NOT NULL,
                    \`branch_id\` int(11) NOT NULL,
                    \`customer_id\` int(11) NOT NULL,
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
                    KEY \`client_application_id\` (\`client_application_id\`),
                    KEY \`cmt_application_customer_id\` (\`customer_id\`),
                    KEY \`cmt_application_cmt_id\` (\`cmt_id\`),
                    CONSTRAINT \`fk_${db_table}_client_application_id\` FOREIGN KEY (\`client_application_id\`) REFERENCES \`client_applications\` (\`id\`) ON DELETE CASCADE,
                    CONSTRAINT \`fk_${db_table}_customer_id\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE,
                    CONSTRAINT \`fk_${db_table}_cmt_id\` FOREIGN KEY (\`cmt_id\`) REFERENCES \`cmt_applications\` (\`id\`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `;

        await sequelize.query(createTableSql, { type: QueryTypes.RAW });
      }

      const sql = `SELECT * FROM \`${db_table}\` WHERE \`client_application_id\` = ?`;
      const results = await sequelize.query(sql, {
        replacements: [client_application_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results[0] || null);
    } catch (error) {
      console.error(`Error in annexureData: ${error.message}`, error);
      callback(error, null);
    }
  },

  filterOptions: async (callback) => {
    try {
      const sql = `
            SELECT \`status\`, COUNT(*) AS \`count\` 
            FROM \`client_applications\` 
            GROUP BY \`status\`
        `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error fetching filter options:", error);
      callback(error, null);
    }
  },

  filterOptionsForBranch: async (branch_id, callback) => {
    try {
      const sql = `
            SELECT \`status\`, COUNT(*) AS \`count\` 
            FROM \`client_applications\` 
            WHERE \`branch_id\` = ?
            GROUP BY \`status\`
        `;

      const results = await sequelize.query(sql, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error fetching filter options for branch:", error);
      callback(error, null);
    }
  },

};

module.exports = Customer;
