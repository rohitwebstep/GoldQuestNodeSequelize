const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

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
  isEmailUsedBefore: async (email, branch_id, callback) => {
    try {
      const emailCheckSql = `
        SELECT COUNT(*) as count
        FROM \`candidate_applications\`
        WHERE \`email\` = ? AND \`branch_id\` = ?
      `;

      const [emailCheckResults] = await sequelize.query(emailCheckSql, {
        replacements: [email, branch_id],
        type: QueryTypes.SELECT,
      });

      const emailExists = emailCheckResults?.count > 0;
      return callback(null, emailExists);
    } catch (error) {
      console.error("Error checking email existence:", error);
      return callback({ message: "Database error", error }, null);
    }
  },

  // Method to create a new candidate application
  create: async (data, callback) => {
    try {
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

      // Execute query
      const [results] = await sequelize.query(sql, {
        replacements: values,
        type: QueryTypes.INSERT, // Correct query type for INSERT
      });

      return callback(null, { message: "Candidate created successfully.", insertId: results });
    } catch (error) {
      console.error("Error creating candidate:", error);
      return callback({ message: "Database error", error }, null);
    }
  },

  list: async (branch_id, callback) => {
    try {
      const sql = `
        SELECT * FROM \`candidate_applications\`
        WHERE \`branch_id\` = ?
        ORDER BY created_at DESC
      `;

      // Fetch applications
      const applications = await sequelize.query(sql, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      if (!applications.length) {
        return callback(null, []);
      }

      // Extract unique service IDs
      let serviceIds = new Set();
      applications.forEach((app) => {
        if (app.services) {
          app.services.split(",").forEach((id) => serviceIds.add(id.trim()));
        }
      });

      // Fetch all service names in a single query
      const servicesQuery = `
        SELECT id, title FROM \`services\`
        WHERE id IN (${Array.from(serviceIds).map(() => "?").join(",")})
      `;

      const serviceResults = serviceIds.size
        ? await sequelize.query(servicesQuery, {
          replacements: Array.from(serviceIds),
          type: QueryTypes.SELECT,
        })
        : [];

      // Convert service results into a lookup object
      const serviceMap = {};
      serviceResults.forEach((service) => {
        serviceMap[service.id] = service.title;
      });

      // Attach service names to applications
      const finalResults = applications.map((app) => ({
        ...app,
        serviceNames: app.services
          ? app.services.split(",").map((id) => serviceMap[id.trim()] || "").join(", ")
          : "",
      }));

      return callback(null, finalResults);
    } catch (error) {
      console.error("Error fetching candidate applications:", error);
      return callback({ message: "Database error", error }, null);
    }
  },

  checkUniqueEmpId: async (branch_id, candidateUniqueEmpId, callback) => {
    try {
      if (!candidateUniqueEmpId) {
        return callback(null, false);
      }

      const sql = `
        SELECT COUNT(*) AS count
        FROM \`candidate_applications\`
        WHERE \`employee_id\` = ? AND \`branch_id\` = ?
      `;

      const results = await sequelize.query(sql, {
        replacements: [candidateUniqueEmpId, branch_id],
        type: QueryTypes.SELECT,
      });

      const count = results[0]?.count || 0;
      return callback(null, count > 0);
    } catch (error) {
      console.error("Error checking unique employee ID:", error);
      return callback({ message: "Database error", error }, null);
    }
  },
  checkUniqueEmpIdByCandidateApplicationID: async (
    branch_id,
    candidateUniqueEmpId,
    application_id,
    callback
  ) => {
    try {
      if (!candidateUniqueEmpId) {
        return callback(null, false);
      }

      const sql = `
        SELECT COUNT(*) AS count
        FROM \`candidate_applications\`
        WHERE \`employee_id\` = ? AND \`id\` = ? AND \`branch_id\` = ?
      `;

      const results = await sequelize.query(sql, {
        replacements: [candidateUniqueEmpId, application_id, branch_id],
        type: QueryTypes.SELECT,
      });

      const count = results[0]?.count || 0;
      return callback(null, count > 0);
    } catch (error) {
      console.error("Error checking unique Employee ID by Application ID:", error);
      return callback({ message: "Database error", error }, null);
    }
  },

  getCandidateApplicationById: async (id, callback) => {
    try {
      const sql = "SELECT * FROM `candidate_applications` WHERE id = ?";

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      return callback(null, results[0] || null);
    } catch (error) {
      console.error("Error fetching candidate application by ID:", error);
      return callback({ message: "Database error", error }, null);
    }
  },

  getAttachmentsOfCandidateApplicationByID: async (candidate_application_id, branch_id, callback) => {
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
                  CASE WHEN cef.id IS NOT NULL THEN 1 ELSE 0 END AS cef_submitted,
                  CASE WHEN dav.id IS NOT NULL THEN 1 ELSE 0 END AS dav_submitted
              FROM 
                  \`candidate_applications\` ca
              LEFT JOIN 
                  \`cef_applications\` cef ON ca.id = cef.candidate_application_id
              LEFT JOIN 
                  \`dav_applications\` dav ON ca.id = dav.candidate_application_id
              WHERE 
                  ca.\`branch_id\` = ? AND ca.\`id\` = ?
              ORDER BY ca.\`created_at\` DESC;`;

      const results = await sequelize.query(sql, {
        replacements: [branch_id, candidate_application_id],
        type: QueryTypes.SELECT,
      });

      if (!results.length) {
        return callback(null, null);
      }

      // Fetch service ID for digital verification
      const davResults = await sequelize.query(`
              SELECT id FROM \`services\`
              WHERE LOWER(\`title\`) LIKE '%digital%' 
                AND (LOWER(\`title\`) LIKE '%verification%' OR LOWER(\`title\`) LIKE '%address%')
              LIMIT 1`,
        { type: QueryTypes.SELECT }
      );

      const digitalAddressID = davResults.length ? parseInt(davResults[0].id, 10) : null;

      // Process each candidate application
      for (let candidateApp of results) {
        const servicesResult = { cef: {}, dav: {} };
        const serviceIds = candidateApp.services ? candidateApp.services.split(",") : [];

        // Fetch Service Names
        if (serviceIds.length) {
          const serviceTitles = await sequelize.query(
            `SELECT title FROM \`services\` WHERE id IN (?)`,
            { replacements: [serviceIds], type: QueryTypes.SELECT }
          );
          candidateApp.serviceNames = serviceTitles.map(service => service.title);
        } else {
          candidateApp.serviceNames = "";
        }

        candidateApp.dav_exist = serviceIds.includes(digitalAddressID) ? 1 : 0;

        // Fetch DAV attachments if submitted
        if (candidateApp.dav_submitted) {
          const davData = await sequelize.query(
            `SELECT identity_proof, home_photo, locality FROM \`dav_applications\`
                       WHERE \`candidate_application_id\` = ?`,
            { replacements: [candidateApp.main_id], type: QueryTypes.SELECT }
          );

          if (davData.length) {
            servicesResult.dav = {
              "Identity Proof": davData[0].identity_proof,
              "Home Photo": davData[0].home_photo,
              "Locality": davData[0].locality,
            };
          }
        }

        // Fetch CEF attachments if submitted
        if (candidateApp.cef_submitted) {
          const cefData = await sequelize.query(
            `SELECT signature, resume_file, govt_id, pan_card_image, 
                              aadhar_card_image, passport_photo
                       FROM \`cef_applications\`
                       WHERE \`candidate_application_id\` = ?`,
            { replacements: [candidateApp.main_id], type: QueryTypes.SELECT }
          );

          if (cefData.length) {
            servicesResult.cef["Candidate Basic Attachments"] = cefData.map(cef => ({
              "Signature": cef.signature,
              "Resume File": cef.resume_file,
              "Govt ID": cef.govt_id,
              "Pan Card Image": cef.pan_card_image,
              "Aadhar Card Image": cef.aadhar_card_image,
              "Passport Photo": cef.passport_photo,
            }));
          }

          // Fetch additional service attachments from `cef_service_forms`
          const dbTableFileInputs = {};
          const dbTableColumnLabel = {};
          const dbTableWithHeadings = {};

          for (let serviceId of serviceIds) {
            const serviceJson = await sequelize.query(
              `SELECT json FROM \`cef_service_forms\` WHERE \`service_id\` = ?`,
              { replacements: [serviceId], type: QueryTypes.SELECT }
            );

            if (serviceJson.length) {
              try {
                const jsonData = JSON.parse(serviceJson[0].json);
                const dbTable = jsonData.db_table;
                const heading = jsonData.heading;

                if (dbTable && heading) {
                  dbTableWithHeadings[dbTable] = heading;
                }

                dbTableFileInputs[dbTable] = [];
                jsonData.rows.forEach(row => {
                  row.inputs.forEach(input => {
                    if (input.type === "file") {
                      dbTableFileInputs[dbTable].push(input.name);
                      dbTableColumnLabel[input.name] = input.label;
                    }
                  });
                });
              } catch (parseErr) {
                console.error("Error parsing service JSON:", parseErr);
              }
            }
          }

          // Process DB tables
          for (const [dbTable, fileInputNames] of Object.entries(dbTableFileInputs)) {
            if (!fileInputNames.length) continue;

            const existingColumns = await sequelize.query(
              `DESCRIBE cef_${dbTable}`, { type: QueryTypes.SELECT }
            );

            const validColumns = fileInputNames.filter(col =>
              existingColumns.some(ec => ec.Field === col)
            );

            if (validColumns.length) {
              const fileData = await sequelize.query(
                `SELECT ${validColumns.join(", ")} FROM cef_${dbTable} WHERE candidate_application_id = ?`,
                { replacements: [candidateApp.main_id], type: QueryTypes.SELECT }
              );

              const updatedRows = fileData.map(row => {
                const updatedRow = {};
                for (const [key, value] of Object.entries(row)) {
                  if (value) {
                    updatedRow[dbTableColumnLabel[key] || key] = value;
                  }
                }
                return updatedRow;
              });

              if (updatedRows.length) {
                servicesResult.cef[dbTableWithHeadings[dbTable]] = updatedRows;
              }
            }
          }
        }

        candidateApp.service_data = servicesResult;
      }

      return callback(null, results[0]);

    } catch (error) {
      console.error("Error in getAttachmentsOfCandidateApplicationByID:", error);
      return callback(error, null);
    }
  },

  update: async (data, candidate_application_id, callback) => {
    try {
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

      const [results] = await sequelize.query(sql, {
        replacements: values,
        type: QueryTypes.UPDATE,
      });

      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

  updateConvertClientStatus: async (candidateAppId, callback) => {
    try {
      const sql = `
            UPDATE \`candidate_applications\` 
            SET \`is_converted_to_client\` = ?
            WHERE \`id\` = ?
        `;

      const [results] = await sequelize.query(sql, {
        replacements: ["1", candidateAppId],
        type: QueryTypes.UPDATE,
      });

      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

  delete: async (id, callback) => {
    try {
      const sql = "DELETE FROM `candidate_applications` WHERE `id` = ?";

      const [results] = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.DELETE,
      });

      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

  isApplicationExist: async (app_id, branch_id, customer_id, callback) => {
    try {
      const sql = `SELECT CA.*, C.is_custom_bgv AS is_custom_bgv, C.name AS customer_name, B.name AS branch_name
          FROM candidate_applications AS CA 
          INNER JOIN customers AS C ON C.id = CA.customer_id
          INNER JOIN branches AS B ON B.id = CA.branch_id
          WHERE CA.id = ? 
            AND CA.branch_id = ? 
            AND CA.customer_id = ?`;

      const [results] = await sequelize.query(sql, {
        replacements: [app_id, branch_id, customer_id],
        type: QueryTypes.SELECT,
      });

      // Return the entry if it exists, or false otherwise
      const entry = results.length > 0 ? results[0] : false;
      callback(null, entry);
    } catch (error) {
      callback(error, null);
    }
  },

};

module.exports = candidateApplication;
