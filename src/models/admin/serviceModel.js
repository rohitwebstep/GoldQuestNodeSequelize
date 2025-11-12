const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const Service = {
  create: async (title, description, email_description, short_code, group, sac_code, excel_sorting, admin_id, callback) => {
    try {
      // Step 1: Check for existing service
      const checkServiceSql = `
        SELECT * FROM services WHERE title = ? OR short_code = ?
      `;

      const [serviceResults] = await sequelize.query(checkServiceSql, {
        replacements: [title, short_code],
        type: QueryTypes.SELECT,
      });

      if (serviceResults && serviceResults.length > 0) {
        let errorMessage = "Service with the following values already exists: ";

        const titleExists = serviceResults.some(
          (result) => result.title.toLowerCase() === title.toLowerCase()
        );
        if (titleExists) errorMessage += "`title` ";

        const shortCodeExists = serviceResults.some(
          (result) => result.short_code.toLowerCase() === short_code.toLowerCase()
        );
        if (shortCodeExists) errorMessage += "`short_code` ";

        return callback({ message: errorMessage.trim() }, null);
      }

      // Step 2: Insert new service
      const insertServiceSql = `
          INSERT INTO services (title, description, email_description, short_code, \`group\`, sac_code, excel_sorting, admin_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

      const [results] = await sequelize.query(insertServiceSql, {
        replacements: [title, description, email_description, short_code, group, sac_code, excel_sorting, admin_id],
        type: QueryTypes.INSERT,
      });

      callback(null, { id: results, message: "Service created successfully" });

    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  list: async (callback) => {
    try {
      const sql = "SELECT * FROM `services`";

      // Execute query using Sequelize raw query
      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  customerAllocatedServices: async (customer_id, callback) => {
    try {
      const sql = "SELECT * FROM `customers` WHERE `id` = ? LIMIT 1";

      // Execute query using Sequelize raw query
      const results = await sequelize.query(sql, {
        replacements: [customer_id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback(null, {
          status: false,
          message: "Customer not found.",
        });
      }

      const customer = results[0];

      // Parse services if stored as JSON string
      let servicesArray = [];
      if (customer.services) {
        try {
          if (typeof customer.services === "string") {
            servicesArray = JSON.parse(customer.services);
          } else if (Array.isArray(customer.services)) {
            servicesArray = customer.services;
          }
        } catch (err) {
          console.error("Error parsing customer.services:", err);
        }
      }

      // Extract only serviceId's
      const serviceIds = servicesArray.map((s) => s.serviceId);

      console.log(`Customer ${customer_id} serviceIds:`, serviceIds);

      // ✅ Fetch full service details from `services` table
      let servicesDetails = [];
      if (serviceIds.length > 0) {
        const serviceSql = `SELECT \`id\`, \`title\`, \`group\` FROM services WHERE id IN (:ids)`;
        servicesDetails = await sequelize.query(serviceSql, {
          replacements: { ids: serviceIds },
          type: QueryTypes.SELECT,
        });
      }

      return callback(null, {
        status: true,
        message: "Customer and allocated services fetched successfully.",
        data: {
          customer,
          services: servicesDetails,
        },
      });
    } catch (err) {
      console.error("Database query error:", err);
      return callback(
        { status: false, message: "Database query failed.", error: err },
        null
      );
    }
  },

  serviceByTitle: async (searchWords, callback) => {
    try {
      if (!Array.isArray(searchWords) || searchWords.length === 0) {
        return callback(new Error("Invalid search words"), null);
      }

      // Convert search words into a SQL "LIKE" clause
      const likeClauses = searchWords.map(() => `LOWER(title) LIKE LOWER(?)`).join(" AND ");
      const sql = `SELECT * FROM services WHERE ${likeClauses} LIMIT 1`;

      const values = searchWords.map(word => `%${word.toLowerCase()}%`);

      const [results] = await sequelize.query(sql, {
        replacements: values,
        type: QueryTypes.SELECT,
      });

      callback(null, results || null);

    } catch (err) {
      console.error("Database query error:", err);
      callback({ message: "Database query error", error: err }, null);
    }
  },

  digitalAddressService: async (callback) => {
    try {
      const sql = `
        SELECT * FROM services
        WHERE LOWER(title) LIKE '%digital%'
        AND (LOWER(title) LIKE '%verification%' OR LOWER(title) LIKE '%address%')
        LIMIT 1
      `;

      const [results] = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      callback(null, results || null);

    } catch (err) {
      console.error("Database query error:", err);
      callback({ message: "Database query error", error: err }, null);
    }
  },

  digitlAddressService: async (callback) => {
    const sql = `
      SELECT * FROM \`services\`
      WHERE LOWER(\`title\`) LIKE '%digital%'
      AND (LOWER(\`title\`) LIKE '%verification%' OR LOWER(\`title\`) LIKE '%address%')
      LIMIT 1
    `;
    const results = await sequelize.query(sql, {
      type: QueryTypes.SELECT,
    });
    const singleEntry = results.length > 0 ? results[0] : null;
    callback(null, singleEntry); // Return single entry or null if not found
  },

  getServiceById: async (id, callback) => {
    try {
      const sql = "SELECT * FROM `services` WHERE `id` = ?";
      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT, // Ensures we only retrieve data
      });

      if (results.length === 0) {
        return callback({ message: "Service not found" }, null);
      }

      callback(null, results[0]); // Return the first result
    } catch (err) {
      console.error("Database query error: 49", err);
      callback({ message: "Database query error", error: err }, null);
    }
  },

  getServiceRequiredDocumentsByServiceId: async (service_id, callback) => {
    try {
      const sql = "SELECT `email_description`, `title` FROM `services` WHERE `id` = ?";
      const results = await sequelize.query(sql, {
        replacements: [service_id],
        type: QueryTypes.SELECT, // Ensures data retrieval
      });

      if (results.length === 0) {
        return callback({ message: "Service not found" }, null);
      }

      callback(null, results[0]); // Return the first result
    } catch (err) {
      console.error("Database query error: 50", err);
      callback({ message: "Database query error", error: err }, null);
    }
  },

  update: async (id, title, description, email_description, short_code, sac_code, excel_sorting, callback) => {
    try {
      // Step 1: Check if a service with the same title or short_code already exists (excluding current id)
      const checkServiceSql = `
        SELECT * FROM \`services\` WHERE (\`title\` = ? OR \`short_code\` = ?) AND \`id\` != ?
      `;
      const serviceResults = await sequelize.query(checkServiceSql, {
        replacements: [title, short_code, id],
        type: QueryTypes.SELECT,
      });

      if (serviceResults.length > 0) {
        let errorMessage = "Service with the following values already exists: ";

        const titleExists = serviceResults.some(
          (result) => result.title.toLowerCase() === title.toLowerCase()
        );
        if (titleExists) {
          errorMessage += "`title` ";
        }

        const shortCodeExists = serviceResults.some(
          (result) => result.short_code.toLowerCase() === short_code.toLowerCase()
        );
        if (shortCodeExists) {
          errorMessage += "`short_code` ";
        }

        return callback({ message: errorMessage.trim() }, null);
      }

      // Step 2: Perform the update
      const updateSql = `
        UPDATE \`services\`
        SET \`title\` = ?, \`description\` = ?, \`email_description\` = ?, \`short_code\` = ?, \`sac_code\` = ?, \`excel_sorting\` = ?
        WHERE \`id\` = ?
      `;

      const [results] = await sequelize.query(updateSql, {
        replacements: [title, description, email_description, short_code, sac_code, excel_sorting, id],
        type: QueryTypes.UPDATE,
      });

      callback(null, results);
    } catch (err) {
      console.error("Database query error: 51", err);
      callback({ message: "Database query error", error: err }, null);
    }
  },

  /*
  delete: async (serviceId, callback) => {
    try {
      // 1️⃣ Fetch customers having the serviceId in their JSON services
      const customers = await sequelize.query(
        'SELECT id, services FROM customers WHERE JSON_CONTAINS(services, ?, "$")',
        {
          replacements: [JSON.stringify({ serviceId })],
          type: QueryTypes.SELECT,
        }
      );

      if (!customers.length) {
        return callback(null, { status: false, message: 'No customer found with the given serviceId' });
      }

      for (let customer of customers) {
        // Remove service from customers JSON
        let services = JSON.parse(customer.services);
        const newServices = services.filter(s => s.serviceId !== serviceId);

        if (newServices.length !== services.length) {
          await sequelize.query(
            'UPDATE customers SET services = ? WHERE id = ?',
            {
              replacements: [JSON.stringify(newServices), customer.id],
              type: QueryTypes.UPDATE,
            }
          );
        }

        // 2️⃣ Fetch client_applications where services CSV contains serviceId
        const client_applications = await sequelize.query(
          'SELECT id, services FROM client_applications WHERE FIND_IN_SET(?, services) AND customer_id = ?',
          {
            replacements: [serviceId.toString(), customer.id],
            type: QueryTypes.SELECT,
          }
        );

        // Remove the serviceId from each application
        for (let clientApp of client_applications) {
          let servicesArray = clientApp.services.split(',');
          const newServicesArray = servicesArray.filter(s => s !== serviceId.toString());

          if (newServicesArray.length !== servicesArray.length) {
            await sequelize.query(
              'UPDATE client_applications SET services = ? WHERE id = ?',
              {
                replacements: [newServicesArray.join(','), clientApp.id],
                type: QueryTypes.UPDATE,
              }
            );
          }
        }

        // 2️⃣ Fetch candidate_applications where services CSV contains serviceId
        const candidate_applications = await sequelize.query(
          'SELECT id, services FROM candidate_applications WHERE FIND_IN_SET(?, services) AND customer_id = ?',
          {
            replacements: [serviceId.toString(), customer.id],
            type: QueryTypes.SELECT,
          }
        );

        // Remove the serviceId from each application
        for (let candidateApp of candidate_applications) {
          let servicesArray = candidateApp.services.split(',');
          const newServicesArray = servicesArray.filter(s => s !== serviceId.toString());

          if (newServicesArray.length !== servicesArray.length) {
            await sequelize.query(
              'UPDATE candidate_applications SET services = ? WHERE id = ?',
              {
                replacements: [newServicesArray.join(','), candidateApp.id],
                type: QueryTypes.UPDATE,
              }
            );
          }
        }
      }

      return callback(null, { status: true, message: 'Service deleted successfully' });

    } catch (err) {
      console.error('Database query error:', err);
      return callback({ message: 'Database query error', error: err }, null);
    }
  },
*/

  delete: async (serviceId, callback) => {
    try {
      // 1️⃣ Delete the service from the services table
      const deleteSql = 'DELETE FROM `services` WHERE `id` = ?';
      const result = await sequelize.query(deleteSql, {
        replacements: [serviceId],
        type: QueryTypes.DELETE,
      });

      // Check if any service was actually deleted
      if (!result || result.affectedRows === 0) {
        return callback(null, { status: false, message: 'No service found with the given ID' });
      }

      // 2️⃣ Fetch customers having this serviceId in their JSON services
      const customers = await sequelize.query(
        `SELECT id, services FROM customers WHERE JSON_CONTAINS(services, '{"serviceId": ${serviceId}}', '$')`,
        {
          type: QueryTypes.SELECT,
        }
      );

      if (customers.length) {
        for (let customer of customers) {
          try {
            // Remove the service from the customer's JSON services
            const services = JSON.parse(customer.services);
            const newServices = services.filter(
              s => String(s.serviceId) !== String(serviceId)
            );

            if (newServices.length !== services.length) {
              await sequelize.query(
                'UPDATE customers SET services = ? WHERE id = ?',
                {
                  replacements: [JSON.stringify(newServices), customer.id],
                  type: QueryTypes.UPDATE,
                }
              );
            }

            /*
            // 2️⃣ Fetch client_applications where services CSV contains serviceId
            const client_applications = await sequelize.query(
              'SELECT id, services FROM client_applications WHERE FIND_IN_SET(?, services) AND customer_id = ?',
              {
                replacements: [serviceId.toString(), customer.id],
                type: QueryTypes.SELECT,
              }
            );
  
            // Remove the serviceId from each application
            for (let clientApp of client_applications) {
              let servicesArray = clientApp.services.split(',');
              const newServicesArray = servicesArray.filter(s => s !== serviceId.toString());
  
              if (newServicesArray.length !== servicesArray.length) {
                await sequelize.query(
                  'UPDATE client_applications SET services = ? WHERE id = ?',
                  {
                    replacements: [newServicesArray.join(','), clientApp.id],
                    type: QueryTypes.UPDATE,
                  }
                );
              }
            }
  
            // 2️⃣ Fetch candidate_applications where services CSV contains serviceId
            const candidate_applications = await sequelize.query(
              'SELECT id, services FROM candidate_applications WHERE FIND_IN_SET(?, services) AND customer_id = ?',
              {
                replacements: [serviceId.toString(), customer.id],
                type: QueryTypes.SELECT,
              }
            );
  
            // Remove the serviceId from each application
            for (let candidateApp of candidate_applications) {
              let servicesArray = candidateApp.services.split(',');
              const newServicesArray = servicesArray.filter(s => s !== serviceId.toString());
  
              if (newServicesArray.length !== servicesArray.length) {
                await sequelize.query(
                  'UPDATE candidate_applications SET services = ? WHERE id = ?',
                  {
                    replacements: [newServicesArray.join(','), candidateApp.id],
                    type: QueryTypes.UPDATE,
                  }
                );
              }
            }
            */
          } catch (innerErr) {
            console.error(`❌ Error processing customer ID: ${customer.id}`, innerErr);
          }
        }
      }

      return callback(null, { status: true, message: 'Service deleted successfully' });

    } catch (err) {
      console.error('Database query error:', err);
      return callback({ message: 'Database query error', error: err }, null);
    }
  }
};

module.exports = Service;
