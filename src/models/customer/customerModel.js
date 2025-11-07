const crypto = require("crypto");
const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

// Function to hash the password using MD5
const hashPassword = (password) =>
  crypto.createHash("md5").update(password).digest("hex");

// Utility function to format dates to 'YYYY-MM-DD' format
const formatDate = (date) => {
  if (!date) return null; // Return null if the date is undefined or null
  const dateObj = new Date(date);
  if (isNaN(dateObj)) return null; // Check if the date is invalid
  return dateObj.toISOString().split("T")[0]; // Format to 'YYYY-MM-DD'
};

const Customer = {
  checkUniqueId: async (clientUniqueId, callback) => {
    try {
      console.log(`clientUniqueId - `, clientUniqueId);
      if (!clientUniqueId) {
        return callback(null, false);
      }
      const sql = `SELECT COUNT(*) AS count FROM \`customers\` WHERE \`client_unique_id\` = ?`;
      const results = await sequelize.query(sql, {
        replacements: [clientUniqueId],
        type: QueryTypes.SELECT,
      });

      callback(null, results[0].count > 0);
    } catch (err) {
      console.error("Database query error: checkUniqueId", err);
      callback(err, null);
    }
  },

  checkUniqueIdForUpdate: async (customer_id, clientUniqueId, callback) => {
    try {
      if (!clientUniqueId) {
        return callback(null, false);
      }
      const sql = `
        SELECT COUNT(*) AS count
        FROM \`customers\`
        WHERE \`client_unique_id\` = ? AND \`id\` != ?
      `;
      const results = await sequelize.query(sql, {
        replacements: [clientUniqueId, customer_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results[0].count > 0);
    } catch (err) {
      console.error("Database query error: checkUniqueIdForUpdate", err);
      callback(err, null);
    }
  },

  checkUsername: async (username, callback) => {
    try {
      const sql = `
        SELECT COUNT(*) AS count
        FROM \`customers\`
        WHERE \`username\` = ?
      `;
      const results = await sequelize.query(sql, {
        replacements: [username],
        type: QueryTypes.SELECT,
      });

      callback(null, results[0].count > 0);
    } catch (err) {
      console.error("Database query error: checkUsername", err);
      callback(err, null);
    }
  },

  checkUsernameForUpdate: async (customer_id, username, callback) => {
    try {
      const sql = `
        SELECT COUNT(*) AS count
        FROM \`customers\`
        WHERE \`username\` = ? AND \`id\` != ?
      `;
      const results = await sequelize.query(sql, {
        replacements: [username, customer_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results[0].count > 0);
    } catch (err) {
      console.error("Database query error: checkUsernameForUpdate", err);
      callback(err, null);
    }
  },

  create: async (customerData, callback) => {
    try {
      const sanitizeValue = (value) =>
        value === undefined || value === "" ? null : value; // Helper to handle empty values

      const sqlCustomers = `
      INSERT INTO \`customers\` (
        \`client_unique_id\`, 
        \`director_email\`, 
        \`name\`, 
        \`additional_login\`, 
        \`username\`, 
        \`password\`,
        \`raw_password\`,
        \`profile_picture\`, 
        \`emails\`, 
        \`mobile\`, 
        \`services\`, 
        \`admin_id\`, 
        \`is_custom_bgv\`
      ) VALUES (?, ?, ?, ?, ?, MD5(?), ?, ?, ?, ?, ?, ?, ?)
    `;

      const valuesCustomers = [
        sanitizeValue(customerData.client_unique_id),
        sanitizeValue(customerData.director_email),
        sanitizeValue(customerData.name),
        sanitizeValue(customerData.additional_login),
        sanitizeValue(customerData.username),
        sanitizeValue(customerData.password),
        sanitizeValue(customerData.password), // raw password
        sanitizeValue(customerData.profile_picture),
        sanitizeValue(customerData.emails_json),
        sanitizeValue(customerData.mobile_number),
        sanitizeValue(customerData.services),
        sanitizeValue(customerData.admin_id),
        sanitizeValue(customerData.custom_bgv),
      ];

      const [result] = await sequelize.query(sqlCustomers, {
        replacements: valuesCustomers,
        type: QueryTypes.INSERT,
      });

      callback(null, { status: true, insertId: result });
    } catch (err) {
      console.error("Database insertion error (customers):", err);
      callback(
        {
          status: false,
          message: err.message || "Failed to create customer",
        },
        null
      );
    }
  },

  documentUpload: async (customer_id, db_column, savedImagePaths, callback) => {
    try {
      const sqlUpdateCustomer = `
        UPDATE \`customer_metas\`
        SET \`${db_column}\` = ?
        WHERE \`customer_id\` = ?
      `;

      const results = await sequelize.query(sqlUpdateCustomer, {
        replacements: [savedImagePaths, customer_id],
        type: QueryTypes.UPDATE,
      });

      callback(null, results);
    } catch (err) {
      console.error("Error updating customer meta:", err);
      callback({ message: "Database update failed.", error: err }, null);
    }
  },

  update: async (customerId, customerData, callback) => {
    try {
      const sqlUpdateCustomer = `
        UPDATE \`customers\`
        SET 
          \`name\` = ?,
          \`director_email\` = ?,
          \`additional_login\` = ?, 
          \`username\` = ?,
          \`password\` = MD5(?), 
          \`raw_password\` = ?, 
          \`profile_picture\` = ?, 
          \`emails\` = ?, 
          \`mobile\` = ?, 
          \`services\` = ?, 
          \`admin_id\` = ?,
          \`is_custom_bgv\` = ?
        WHERE \`id\` = ?
      `;

      const valuesUpdateCustomer = [
        customerData.name,
        customerData.director_email,
        customerData.additional_login,
        customerData.username,
        customerData.password,
        customerData.password,
        customerData.profile_picture,
        customerData.emails_json,
        customerData.mobile,
        JSON.stringify(customerData.services),
        customerData.admin_id,
        customerData.custom_bgv,
        customerId,
      ];

      const results = await sequelize.query(sqlUpdateCustomer, {
        replacements: valuesUpdateCustomer,
        type: QueryTypes.UPDATE,
      });

      callback(null, results);
    } catch (err) {
      console.error("Database update error for customers:", err);
      callback({ message: err.message || "Database update failed." }, null);
    }
  },

  createCustomerMeta: async (metaData, callback) => {
    try {
      const sqlCustomerMetas = `
        INSERT INTO \`customer_metas\` (
          \`customer_id\`, \`address\`,
          \`single_point_of_contact\`,
          \`escalation_admin_id\`,
          \`contact_person_name\`,
          \`gst_number\`, \`tat_days\`, 
          \`agreement_date\`, \`agreement_duration\`, \`custom_template\`,
          \`custom_address\`, \`state\`, \`state_code\`, 
          \`client_standard\`, \`industry_classification\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const valuesCustomerMetas = [
        metaData.customer_id,
        metaData.address || null,
        metaData.client_spoc || null,
        metaData.escalation_admin_id || null,
        metaData.contact_person || null,
        metaData.gst_number || null,
        metaData.tat_days || null,
        metaData.agreement_date || null,
        metaData.agreement_duration || null,
        metaData.custom_template || "no",
        metaData.custom_address || null,
        metaData.state || null,
        metaData.state_code || null,
        metaData.client_standard || null,
        metaData.industry_classification || null,
      ];

      const results = await sequelize.query(sqlCustomerMetas, {
        replacements: valuesCustomerMetas,
        type: QueryTypes.INSERT,
      });

      callback(null, results);
    } catch (err) {
      console.error("Database insertion error for customer_metas:", err);
      callback({ message: "Database insertion error for customer_metas", error: err }, null);
    }
  },

  updateCustomerMetaByCustomerId: async (customerId, metaData, callback) => {
    try {
      const sqlUpdateCustomerMetas = `
        UPDATE \`customer_metas\` 
        SET 
          \`address\` = ?, 
          \`single_point_of_contact\` = ?,
          \`escalation_admin_id\` = ?,
          \`contact_person_name\` = ?,
          \`gst_number\` = ?, 
          \`tat_days\` = ?, 
          \`agreement_date\` = ?, 
          \`agreement_duration\` = ?, 
          \`custom_template\` = ?, 
          \`custom_address\` = ?, 
          \`state\` = ?, 
          \`state_code\` = ?, 
          \`client_standard\` = ?,
          \`industry_classification\` = ?
        WHERE \`customer_id\` = ?
      `;

      const valuesUpdateCustomerMetas = [
        metaData.address || null,
        metaData.client_spoc || null,
        metaData.escalation_admin_id || null,
        metaData.contact_person || null,
        metaData.gst_number || null,
        metaData.tat_days || null,
        metaData.agreement_date || null,
        metaData.agreement_duration || null,
        metaData.custom_template || "no",
        metaData.custom_address || null,
        metaData.state || null,
        metaData.state_code || null,
        metaData.client_standard || null,
        metaData.industry_classification || null,
        customerId,
      ];

      const results = await sequelize.query(sqlUpdateCustomerMetas, {
        replacements: valuesUpdateCustomerMetas,
        type: QueryTypes.UPDATE,
      });

      callback(null, results);
    } catch (err) {
      console.error("Database update error for customer_metas:", err);
      callback(
        { message: "Database update error for customer_metas", error: err },
        null
      );
    }
  },

  list: async (callback) => {
    try {
      const sql = `
        SELECT 
          customers.*, 
          customers.id AS main_id, 
          customer_metas.*, 
          customer_metas.id AS meta_id,
          COALESCE(branch_counts.branch_count, 0) AS branch_count
        FROM 
          customers
        LEFT JOIN 
          customer_metas 
        ON 
          customers.id = customer_metas.customer_id
        LEFT JOIN 
          (
            SELECT 
              customer_id, 
              COUNT(*) AS branch_count
            FROM 
              branches
            GROUP BY 
              customer_id
          ) AS branch_counts
        ON 
          customers.id = branch_counts.customer_id
        WHERE 
          customers.status != '0'
      `;

      const results = await sequelize.query(sql, { type: QueryTypes.SELECT });

      // Process service titles asynchronously
      const updateServiceTitles = async (customerData) => {
        try {
          const servicesData = JSON.parse(customerData.services || "[]");

          for (const group of servicesData) {
            const serviceSql = `SELECT title FROM services WHERE id = ?`;
            const [row] = await sequelize.query(serviceSql, {
              replacements: [group.serviceId],
              type: QueryTypes.SELECT,
            });

            if (row && row.title) {
              group.serviceTitle = row.title;
            }
          }

          customerData.services = JSON.stringify(servicesData);
        } catch (err) {
          console.error(
            "Error processing services for customer ID:",
            customerData.main_id,
            err
          );
        }
      };

      // Execute service title updates for all customers in parallel
      await Promise.all(results.map(updateServiceTitles));

      callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      callback(err, null);
    }
  },

  inactiveList: async (callback) => {
    try {
      const sql = `
        SELECT 
          customers.*, 
          customers.id AS main_id, 
          customer_metas.*, 
          customer_metas.id AS meta_id,
          COALESCE(branch_counts.branch_count, 0) AS branch_count
        FROM 
          customers
        LEFT JOIN 
          customer_metas 
        ON 
          customers.id = customer_metas.customer_id
        LEFT JOIN 
          (
            SELECT 
              customer_id, 
              COUNT(*) AS branch_count
            FROM 
              branches
            GROUP BY 
              customer_id
          ) AS branch_counts
        ON 
          customers.id = branch_counts.customer_id
        WHERE 
          customers.status != '1'
      `;

      const results = await sequelize.query(sql, { type: QueryTypes.SELECT });
      callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      callback(err, null);
    }
  },

  basicInfoByID: async (customer_id, callback) => {
    try {
      // Fetch basic customer info and metadata
      const sql = `
        SELECT 
          customers.client_unique_id,
          customers.name, 
          customers.profile_picture, 
          customers.emails, 
          customers.mobile, 
          customers.services, 
          customers.id, 
          customer_metas.address,
          customer_metas.gst_number,
          customer_metas.contact_person_name,
          customer_metas.tat_days,
          customers.status,
          customer_metas.id AS meta_id
        FROM 
          customers
        LEFT JOIN 
          customer_metas 
        ON 
          customers.id = customer_metas.customer_id
        WHERE 
          customers.id = ?
      `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [customer_id],
      });

      if (!results.length) {
        return callback(null, { message: "No customer data found" });
      }

      const customerData = results[0];

      // Parse services JSON if present
      let servicesData = [];
      if (customerData.services) {
        try {
          servicesData = JSON.parse(customerData.services);
        } catch (parseError) {
          console.error("Error parsing services JSON:", parseError);
          return callback(parseError, null);
        }
      }

      // Fetch all service titles in parallel (if there are any services)
      if (Array.isArray(servicesData) && servicesData.length > 0) {
        const updatedServices = [];

        for (const group of servicesData) {
          if (group.serviceId) {
            const serviceSql = `SELECT title FROM services WHERE id = ? LIMIT 1`;
            const [serviceResult] = await sequelize.query(serviceSql, {
              type: QueryTypes.SELECT,
              replacements: [group.serviceId],
            });

            // ✅ If service exists, add it to the new array
            if (serviceResult && serviceResult.title) {
              group.serviceTitle = serviceResult.title;
              updatedServices.push(group);
            } else {
              console.log(
                `⚠️ Service ID ${group.serviceId} not found — removing from list.`
              );
            }
          }
        }

        // ✅ Replace original array with filtered one
        servicesData = updatedServices;
      }

      // Attach updated service titles to customer data
      customerData.services = JSON.stringify(servicesData);

      return callback(null, customerData);

    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  infoByID: async (customer_id, callback) => {
    try {
      const sql = `
        SELECT 
          customers.*, 
          customers.id AS main_id, 
          customer_metas.*, 
          customer_metas.id AS meta_id
        FROM 
          customers
        LEFT JOIN 
          customer_metas 
        ON 
          customers.id = customer_metas.customer_id
        WHERE 
          customers.id = ?
      `;

      // Fetch customer data
      const results = await sequelize.query(sql, {
        replacements: [customer_id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback(null, { message: "No customer data found" });
      }

      const customerData = results[0];
      customerData.client_spoc_details = null;

      // Parse services JSON safely
      let servicesData;
      try {
        servicesData = JSON.parse(customerData.services);
      } catch (parseError) {
        console.error("Error parsing services JSON:", parseError);
        return callback({ message: "Invalid services data format." }, null);
      }

      // Fetch service titles efficiently
      const updateServiceTitles = async () => {
        try {

          await Promise.all(
            servicesData.map(async (service) => {
              const serviceSql = `SELECT title FROM services WHERE id = ?`;

              const [row] = await sequelize.query(serviceSql, {
                replacements: [service.serviceId],
                type: QueryTypes.SELECT,
              });

              if (row && row.length > 0) {
                service.serviceTitle = row[0].title;  // Note: you should access the title with `row[0].title`
              }
            })
          );

          // Log the customer data after all services are updated
          customerData.services = JSON.stringify(servicesData);

          callback(null, customerData);
        } catch (err) {
          // Log error if something goes wrong
          console.error("Error updating service titles:", err);
          callback(err, null);
        }
      };


      await updateServiceTitles();
    } catch (err) {
      console.error("Error fetching customer data:", err);
      callback(err, null);
    }
  },

  getCustomerById: async (id, callback) => {
    try {
      // Fetch basic customer details
      const sql = "SELECT * FROM `customers` WHERE `id` = ?";

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [id],
      });

      if (!results.length) {
        return callback(null, { message: "No customer data found" });
      }

      let customerData = results[0];

      // Parse services JSON safely
      let servicesData;
      try {
        servicesData = JSON.parse(customerData.services);
      } catch (parseError) {
        return callback(parseError, null);
      }

      // Update service titles
      for (const group of servicesData) {
        const serviceSql = `SELECT title FROM services WHERE id = ?`;

        const serviceResult = await sequelize.query(serviceSql, {
          type: QueryTypes.SELECT,
          replacements: [group.serviceId],
        });

        if (serviceResult.length && serviceResult[0].title) {
          group.serviceTitle = serviceResult[0].title;
        }
      }

      // Attach updated service titles
      customerData.services = JSON.stringify(servicesData);
      callback(null, customerData);
    } catch (err) {
      console.error("Database query error:", err);
      callback(err, null);
    }
  },

  getActiveCustomerById: async (id, callback) => {
    try {
      const sql = "SELECT * FROM `customers` WHERE `id` = ? AND `status` = ?";

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [id, "1"],
      });

      callback(null, results[0] || null);
    } catch (err) {
      console.error("Database query error:", err);
      callback(err, null);
    }
  },

  getAllBranchesByCustomerId: async (customerId, callback) => {
    try {
      const sql = "SELECT * FROM `branches` WHERE `customer_id` = ?";

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [customerId],
      });

      callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      callback(err, null);
    }
  },

  getClientUniqueIDByCustomerId: async (id, callback) => {
    try {
      const sql = "SELECT `client_unique_id` FROM `customers` WHERE `id` = ?";

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [id],
      });

      // Check if a valid result exists
      if (results.length > 0 && results[0].client_unique_id) {
        return callback(null, results[0].client_unique_id);
      } else {
        return callback(null, false); // Return false if no valid ID found
      }
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  getCustomerMetaById: async (id, callback) => {
    try {
      const sql = "SELECT * FROM `customer_metas` WHERE `customer_id` = ?";

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [id],
      });

      return callback(null, results.length > 0 ? results[0] : null);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  active: async (id, callback) => {
    try {
      const sql = "UPDATE `customers` SET `status` = ? WHERE `id` = ?";
      const result = await sequelize.query(sql, {
        type: QueryTypes.UPDATE,
        replacements: ["1", id],
      });

      return callback(null, result[1] > 0 ? { message: "Customer activated" } : { message: "No changes made" });
    } catch (err) {
      console.error("Database update error:", err);
      return callback(err, null);
    }
  },

  inactive: async (id, callback) => {
    try {
      const sql = "UPDATE `customers` SET `status` = ? WHERE `id` = ?";
      const result = await sequelize.query(sql, {
        type: QueryTypes.UPDATE,
        replacements: ["0", id],
      });

      return callback(null, result[1] > 0 ? { message: "Customer deactivated" } : { message: "No changes made" });
    } catch (err) {
      console.error("Database update error:", err);
      return callback(err, null);
    }
  },

  /*
  delete: (id, callback) => {
    const sql = `
        DELETE FROM \`customers\`
        WHERE \`id\` = ?
      `;
    startConnection((err, connection) => {
      if (err) {
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }
      connection.query(sql, [id], (err, results) => {
        connectionRelease(connection);
        if (err) {
          console.error("Database query error: 67", err);
          return callback(err, null);
        }
        callback(null, results);
      });
    });
  },
  */

  delete: async (customerId, callback) => {
    try {
      const sql = "DELETE FROM `customers` WHERE `id` = ?";

      // Perform the query
      const result = await sequelize.query(sql, {
        type: QueryTypes.DELETE,
        replacements: [customerId],
      });

      // Check if the result has affected rows
      if (result && result.affectedRows > 0) {
        return callback(null, { message: "Customer deleted successfully" });
      } else {
        return callback(null, { message: "No customer found" });
      }
    } catch (err) {
      console.error("Database deletion error:", err);
      return callback(err, null);
    }
  },

  findByEmailOrMobile: async (username, callback) => {
    try {
      const sql = `
        SELECT \`id\`, \`email\`, \`mobile\`, \`password\`
        FROM \`customers\`
        WHERE \`email\` = ? OR \`mobile\` = ?
      `;
      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [username, username],
      });

      if (results.length === 0) {
        return callback({ message: "No customer found with the provided email or mobile" }, null);
      }

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  validatePassword: async (username, password, callback) => {
    try {
      const sql = `
          SELECT \`id\`, \`password\` FROM \`customers\`
          WHERE \`email\` = ? OR \`mobile\` = ?
        `;
      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [username, username],
      });

      if (results.length === 0) {
        return callback(
          { message: "No customer found with the provided email or mobile" },
          null
        );
      }

      const customer = results[0];

      // Compare password using bcrypt
      if (hashPassword(password) !== customer.password) {
        return callback({ message: "Incorrect password" }, null);
      }

      callback(null, customer);
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  updateToken: async (id, token, tokenExpiry, callback) => {
    try {
      const sql = `
          UPDATE \`customers\`
          SET \`login_token\` = ?, \`token_expiry\` = ?
          WHERE \`id\` = ?
        `;

      const [results] = await sequelize.query(sql, {
        type: QueryTypes.UPDATE,
        replacements: [token, tokenExpiry, id],
      });

      if (results.affectedRows === 0) {
        return callback(
          { message: "Token update failed. Customer not found or no changes made." },
          null
        );
      }

      callback(null, { message: "Token updated successfully" });
    } catch (err) {
      console.error("Database update error:", err);
      return callback({ message: "Database update error", error: err }, null);
    }
  },

  validateLogin: async (id, callback) => {
    try {
      const sql = `
        SELECT \`login_token\`
        FROM \`customers\`
        WHERE \`id\` = ?
      `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [id],
      });

      if (results.length === 0) {
        return callback({ message: "Customer not found" }, null);
      }

      callback(null, results); // Return the login_token object
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  fetchBranchPasswordByEmail: async (email, callback) => {
    try {
      const sql = `
        SELECT \`password\`
        FROM \`branches\`
        WHERE \`email\` = ?
      `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [email],
      });

      if (results.length > 0 && results[0].password) {
        return callback(null, results[0].password); // Return the password
      } else {
        return callback(null, false); // Return false if no result found
      }
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  logout: async (id, callback) => {
    try {
      const sql = `
        UPDATE \`customers\`
        SET \`login_token\` = NULL, \`token_expiry\` = NULL
        WHERE \`id\` = ?
      `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.UPDATE,
        replacements: [id],
      });

      if (results[1] === 0) {
        return callback(
          { message: "Token clear failed. Customer not found or no changes made." },
          null
        );
      }

      callback(null, { message: "Logout successful", affectedRows: results[1] });
    } catch (err) {
      console.error("Database update error:", err);
      return callback({ message: "Database update error", error: err }, null);
    }
  },
};

module.exports = Customer;
