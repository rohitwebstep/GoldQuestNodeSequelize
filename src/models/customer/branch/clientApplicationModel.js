const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

async function getClientApplicationServiceStatus(clientAppId, serviceId) {
  let finalStatus = null;
  let dbTable = null;
  let heading = null;

  try {
    // Step 1: Fetch service by ID
    const serviceSQL = `
      SELECT * 
      FROM services
      WHERE id = ?
      LIMIT 1
    `;
    const [serviceResult] = await sequelize.query(serviceSQL, {
      type: QueryTypes.SELECT,
      replacements: [serviceId],
    });

    if (!serviceResult) {
      console.log(`❌ Service not found for ID: ${serviceId}`);
      return;
    }

    heading = serviceResult.title;

    // Step 2: Fetch report form by service_id
    const reportFormSQL = `
      SELECT * 
      FROM report_forms 
      WHERE service_id = ?
      LIMIT 1
    `;
    const [reportFormResult] = await sequelize.query(reportFormSQL, {
      type: QueryTypes.SELECT,
      replacements: [serviceId],
    });

    if (!reportFormResult) {
      console.log(`⚠️ No report form found for service ID: ${serviceId}`);
      return;
    }

    // Step 3: Log report_form JSON data
    try {
      const jsonData = JSON.parse(reportFormResult.json);

      // ✅ Check if db_table exists and is not null or empty
      if (jsonData.db_table && jsonData.db_table.trim() !== '') {
        dbTable = jsonData.db_table.trim();

        // Step 4: Build SQL to fetch single entry for this client_application_id
        const dbTableSQL = `
      SELECT id, status 
      FROM ${dbTable}
      WHERE client_application_id = ?
      LIMIT 1
    `;

        // Step 5: Execute the query safely using replacements
        const [dbEntry] = await sequelize.query(dbTableSQL, {
          type: QueryTypes.SELECT,
          replacements: [clientAppId],
        });

        // Step 6: Log fetched entry
        if (dbEntry) {
          console.log(`✅ Entry found in ${dbTable}:`);
          console.log(`➡️ Entry ID: ${dbEntry.id}`);
          finalStatus = dbEntry.status;
        }
      }
    } catch (jsonError) {
      console.error("❌ Error parsing report_form JSON:", jsonError.message);
      console.log("Raw JSON:", reportFormResult.json);
    }
  } catch (error) {
    console.error("🚨 Database query error:", error);
  }

  return { status: finalStatus, dbTable, heading };
}

const clientApplication = {
  weeklyReports: async (callback) => {
    try {
      // Fetch services + completed applications in parallel
      const [servicesResult, clientApplicationResult] = await Promise.all([
        sequelize.query(`SELECT title FROM services`, { type: QueryTypes.SELECT }),
        sequelize.query(`
        SELECT ca.*, cmt.overall_status, cmt.report_date, 
               cmt.first_insufficiency_marks, cmt.first_insuff_date, cmt.first_insuff_reopened_date, 
               cmt.second_insufficiency_marks, cmt.second_insuff_date, cmt.second_insuff_reopened_date, 
               cmt.third_insufficiency_marks, cmt.third_insuff_date, cmt.third_insuff_reopened_date, 
               cmt.delay_reason, customer.client_unique_id
        FROM client_applications AS ca
        INNER JOIN cmt_applications AS cmt ON cmt.client_application_id = ca.id
        INNER JOIN customers AS customer ON customer.id = ca.customer_id
        WHERE cmt.overall_status = 'completed'
          AND cmt.report_date IS NOT NULL
          AND cmt.report_date != ''
      `, { type: QueryTypes.SELECT })
      ]);

      if (!clientApplicationResult.length)
        return callback(new Error("No client applications found"), null);

      console.log(`🛠️ Total Services Found: ${servicesResult.length}`);

      let count = 1;
      const finalClientApps = await Promise.all(
        clientApplicationResult.map(async (app) => {
          const serviceIds = app.services ? app.services.split(",").map(s => s.trim()) : [];
          const appServices = (await Promise.all(
            serviceIds.map(id => getClientApplicationServiceStatus(app.id, id))
          )).filter(s => s && s.status);

          const createdAt = app.created_at
            ? (() => {
              const date = new Date(app.created_at);
              const day = String(date.getDate()).padStart(2, '0');
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const year = date.getFullYear();
              return `${day}-${month}-${year}`;
            })()
            : '';

          // Return both metadata and table-ready data in one object
          return {
            meta: app,
            createdAt,
            services: appServices,
            tableRow: [
              count++,
              app.application_id || '',
              app.client_unique_id || '',
              createdAt,
              app.overall_status || '',
              app.report_date || '',
              app.first_insufficiency_marks || '',
              app.first_insuff_date || '',
              app.first_insuff_reopened_date || '',
              app.second_insufficiency_marks || '',
              app.second_insuff_date || '',
              app.second_insuff_reopened_date || '',
              app.third_insufficiency_marks || '',
              app.third_insuff_date || '',
              app.third_insuff_reopened_date || '',
              app.delay_reason || ''
            ]
          };
        })
      );

      // Build dynamic service headings
      const serviceHeadings = [
        ...new Set(finalClientApps.flatMap(a => (a.services || []).map(s => s.heading).filter(Boolean)))
      ];

      // Inject service statuses into each table row dynamically
      const tableData = finalClientApps.map(({ tableRow, services }) => {
        const serviceStatus = serviceHeadings.map(h => {
          let status = services?.find(s => s.heading === h)?.status || '';

          // ✅ Replace special characters with a single space
          status = status.replace(/[^a-zA-Z0-9]/g, ' ');

          // ✅ Replace multiple spaces (including double spaces) with one
          status = status.replace(/\s+/g, ' ');

          // ✅ Convert to uppercase
          status = status.trim().toUpperCase();

          return status;
        });

        const [slNo, appId, clientCode, createdAt, ...rest] = tableRow;
        return [slNo, appId, clientCode, createdAt, ...serviceStatus, ...rest];
      });

      const tableHeadings = [
        'SL NO', 'APPLICATION ID', 'CLIENT CODE', 'DATE/TIME',
        ...serviceHeadings,
        'OVERALL STATUS', 'REPORT DATE',
        'FIRST LEVEL INSUFFICIENCY REMARKS', 'FIRST INSUFF DATE', 'FIRST INSUFF CLEARED',
        'SECOND LEVEL INSUFFICIENCY REMARKS', 'SECOND INSUFF DATE', 'SECOND INSUFF CLEARED',
        'THIRD LEVEL INSUFFICIENCY REMARKS', 'THIRD INSUFF DATE', 'THIRD INSUFF CLEARED',
        'REMARKS AND REASON FOR THE DELAY'
      ];

      callback(null, { tableHeadings, tableData });

    } catch (err) {
      console.error("Database query error:", err);
      callback(err, null);
    }
  },

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

      const applicationIdParam = `${client_unique_id}-%`;

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
        new_application_id ?? '',
        name ?? '',
        employee_id ?? '',
        spoc ?? '',
        batch_number ?? '',
        sub_client ?? '',
        location ?? '',
        branch_id ?? '',
        serviceIds ?? '',
        packageIds ?? '',
        customer_id ?? '',
        purpose_of_application ?? '',
        nationality ?? ''
      ];

      // Ensure attach_documents is included properly
      if (attach_documents !== undefined && attach_documents !== null) {
        sql += `, attach_documents`;
        values.push(attach_documents);
      }

      sql += `) VALUES (${values.map(() => "?").join(", ")})`;

      const results = await sequelize.query(sql, {
        replacements: values,
        type: QueryTypes.INSERT, // FIXED: Correct query type
      });

      const insertId = results?.[0] ?? null; // Ensure safe extraction

      callback(null, { results: { insertId }, new_application_id });
    } catch (error) {
      console.error("Database query error:", error);
      callback(error, null);
    }
  },

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
        finalResults.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
      const affectedRows = await sequelize.query(sqlUpdateCustomer, {
        replacements: queryParams, // Positional replacements using ?
        type: QueryTypes.UPDATE,
      });
      console.log("Affected rows:", affectedRows);

      return callback(true, { message: "Update successful", affectedRows });
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

  addToStopCheck: async (client_application_id, branch_id, customer_id, callback) => {
    try {
      // Check if the record already exists with all 3 identifiers
      const [rows] = await sequelize.query(
        `SELECT 1 FROM \`cmt_applications\` 
       WHERE \`client_application_id\` = ? 
       AND \`branch_id\` = ? 
       AND \`customer_id\` = ? 
       LIMIT 1`,
        {
          replacements: [client_application_id, branch_id, customer_id],
          type: QueryTypes.SELECT,
        }
      );

      let results;

      if (rows) {
        // Record exists — perform UPDATE
        const updateSql = `
        UPDATE \`cmt_applications\`
        SET \`overall_status\` = 'stopcheck'
        WHERE \`client_application_id\` = ? 
        AND \`branch_id\` = ? 
        AND \`customer_id\` = ?
      `;

        results = await sequelize.query(updateSql, {
          replacements: [client_application_id, branch_id, customer_id],
          type: QueryTypes.UPDATE,
        });
      } else {
        // Record does not exist — perform INSERT
        const insertSql = `
        INSERT INTO \`cmt_applications\` 
        (\`client_application_id\`, \`branch_id\`, \`customer_id\`, \`overall_status\`)
        VALUES (?, ?, ?, 'stopcheck')
      `;

        results = await sequelize.query(insertSql, {
          replacements: [client_application_id, branch_id, customer_id],
          type: QueryTypes.INSERT,
        });
      }

      callback(null, results);
    } catch (error) {
      console.error("Database check/update/insert error:", error);
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

  delete: async (id, callback) => {
    try {
      // Step 1: Retrieve services from client_applications
      const sqlGetServices = `
        SELECT services FROM client_applications WHERE id = ?
      `;
      const results = await sequelize.query(sqlGetServices, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback(
          { message: "No client application found with the given ID" },
          null
        );
      }

      // Step 2: Process services
      const services = results[0].services;
      const servicesArray = services
        ? services.split(",").map((service) => parseInt(service.trim()))
        : [];

      const jsonResults = [];

      for (const serviceId of servicesArray) {
        // Retrieve JSON from report_forms
        const sqlGetJson = `
          SELECT json FROM report_forms WHERE service_id = ?
        `;
        const jsonQueryResults = await sequelize.query(sqlGetJson, {
          replacements: [serviceId],
          type: QueryTypes.SELECT,
        });

        if (jsonQueryResults.length > 0) {
          try {
            const jsonData = JSON.parse(jsonQueryResults[0].json);
            const dbTable = jsonData.db_table;

            if (dbTable) {
              // Check if an entry exists in dbTable
              const sqlCheckEntry = `SELECT * FROM \`${dbTable}\` WHERE client_application_id = ?`;
              const entryResults = await sequelize.query(sqlCheckEntry, {
                replacements: [id],
                type: QueryTypes.SELECT,
              });

              if (entryResults.length > 0) {
                // Delete the entry from the dynamic table
                const sqlDeleteEntry = `DELETE FROM \`${dbTable}\` WHERE client_application_id = ?`;
                await sequelize.query(sqlDeleteEntry, {
                  replacements: [id],
                  type: QueryTypes.DELETE,
                });
              }
            }

            jsonResults.push(jsonQueryResults[0].json);
          } catch (parseError) {
            console.error("Error parsing JSON:", parseError);
          }
        }
      }

      // Step 3: Delete client_application entry
      const sqlDelete = `
        DELETE FROM client_applications WHERE id = ?
      `;
      await sequelize.query(sqlDelete, {
        replacements: [id],
        type: QueryTypes.DELETE,
      });

      // Return both the deleted services and JSON results
      callback(null, {
        deletedServices: servicesArray,
        jsonResults,
        message: "Client application deleted successfully.",
      });
    } catch (error) {
      callback(error, null);
    }
  },

};

module.exports = clientApplication;
