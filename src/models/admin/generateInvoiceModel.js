const crypto = require("crypto");
const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

// Function to hash passwords using MD5
const hashPassword = (password) =>
  crypto.createHash("md5").update(password).digest("hex");

const generateInvoiceModel = {
  generateInvoice: async (customerId, month, year, callback) => {
    try {
      // Fetch customer details
      const customerQuery = `
        SELECT 
          c.id, 
          c.client_unique_id, 
          c.name, 
          c.emails, 
          c.mobile, 
          c.services, 
          cm.address, 
          cm.contact_person_name, 
          cm.escalation_admin_id, 
          cm.single_point_of_contact, 
          cm.gst_number,
          cm.payment_contact_person,
          cm.state,
          cm.state_code,
          escalation_admin.name AS escalation_admin_name
        FROM customers c
        LEFT JOIN customer_metas cm ON cm.customer_id = c.id
        LEFT JOIN admins escalation_admin ON escalation_admin.id = cm.escalation_admin_id
        WHERE c.id = ?;
      `;

      const customerResults = await sequelize.query(customerQuery, {
        replacements: [customerId],
        type: QueryTypes.SELECT,
      });

      if (!customerResults.length) {
        return callback(new Error("Customer not found."), null);
      }

      const customerData = customerResults[0];
      let servicesData;

      try {
        servicesData = JSON.parse(customerData.services);
      } catch (parseError) {
        return callback(parseError, null);
      }

      // Fetch service titles
      for (const group of servicesData) {
        const serviceSql = `SELECT title FROM services WHERE id = ?`;
        const [serviceResult] = await sequelize.query(serviceSql, {
          replacements: [group.serviceId],
          type: QueryTypes.SELECT,
        });

        if (serviceResult) {
          group.serviceTitle = serviceResult.title;
        }
      }
      customerData.services = JSON.stringify(servicesData);

      // Fetch completed applications for the customer
      const applicationQuery = `
        SELECT
          ca.id,
          ca.branch_id,
          ca.application_id,
          ca.employee_id,
          ca.name,
          ca.services,
          ca.status,
          ca.created_at,
          cmt.report_date
        FROM client_applications ca
        LEFT JOIN cmt_applications cmt ON cmt.client_application_id = ca.id
        WHERE (ca.status = 'completed' OR ca.status = 'closed') 
          AND ca.customer_id = ?
          AND MONTH(cmt.report_date) = ?
          AND YEAR(cmt.report_date) = ?
        ORDER BY ca.branch_id;
      `;

      const applicationResults = await sequelize.query(applicationQuery, {
        replacements: [customerId, month, year],
        type: QueryTypes.SELECT,
      });

      // Group applications by branch
      const branchApplicationsMap = {};
      applicationResults.forEach((application) => {
        const branchId = application.branch_id;
        if (!branchApplicationsMap[branchId]) {
          branchApplicationsMap[branchId] = { id: branchId, applications: [] };
        }
        application.statusDetails = [];
        branchApplicationsMap[branchId].applications.push(application);
      });

      // Fetch branch details
      const branchIds = Object.keys(branchApplicationsMap);
      const branchesWithApplications = [];

      for (const branchId of branchIds) {
        const branchQuery = `SELECT id, name FROM branches WHERE id = ?;`;
        const branchResults = await sequelize.query(branchQuery, {
          replacements: [branchId],
          type: QueryTypes.SELECT,
        });

        if (branchResults.length > 0) {
          const branch = branchResults[0];
          branchesWithApplications.push({
            id: branch.id,
            name: branch.name,
            applications: branchApplicationsMap[branchId].applications,
          });
        }
      }

      // Process each application's services
      for (const application of applicationResults) {
        const services = application.services.split(",");
        for (const serviceId of services) {
          const reportFormQuery = `SELECT json FROM report_forms WHERE service_id = ?;`;
          const reportFormResults = await sequelize.query(reportFormQuery, {
            replacements: [serviceId],
            type: QueryTypes.SELECT,
          });

          if (reportFormResults.length > 0) {
            const reportFormJson = JSON.parse(reportFormResults[0].json);
            const dbTable = reportFormJson.db_table;

            // Find the additional_fee column
            const additionalFeeColumnQuery = `SHOW COLUMNS FROM \`${dbTable}\` WHERE \`Field\` LIKE 'additional_fee%'`;
            const columnResults = await sequelize.query(additionalFeeColumnQuery, {
              type: QueryTypes.SELECT,
            });

            const additionalFeeColumn = columnResults.length
              ? columnResults[0].Field
              : null;

            const completeStatusGroups = [
              "completed",
              "completed_green",
              "completed_red",
              "completed_yellow",
              "completed_pink",
              "completed_orange",
            ];

            /*
            const statusQuery = `
              SELECT status${additionalFeeColumn ? `, ${additionalFeeColumn}` : ""}
              FROM ${dbTable}
              WHERE client_application_id = ? 
              AND is_billed != 1 
              AND status IN (${completeStatusGroups.map(() => "?").join(", ")});
            `;
            */

            const statusQuery = `
  SELECT billed_date, status${additionalFeeColumn ? `, ${additionalFeeColumn}` : ""}
  FROM ${dbTable}
  WHERE client_application_id = ?
    AND status IN (${completeStatusGroups.map(() => "?").join(", ")});
`;

            const statusResults = await sequelize.query(statusQuery, {
              replacements: [application.id, ...completeStatusGroups],
              type: QueryTypes.SELECT,
            });

            if (statusResults.length > 0 && !statusResults[0].billed_date) {
              // Update billed status
              const updateQuery = `
                                    UPDATE ${dbTable}
                                    SET is_billed = 1, billed_date = NOW()
                                    WHERE client_application_id = ?
                                      AND billed_date IS NULL
                                      AND (is_billed IS NULL OR is_billed = '');
                                  `;

              await sequelize.query(updateQuery, {
                replacements: [application.id],
                type: QueryTypes.UPDATE,
              });
            }

            if (completeStatusGroups.includes(status)) {
              application.statusDetails.push({
                serviceId,
                status: statusResults[0]?.status || null,
                additionalFee: additionalFeeColumn ? statusResults[0]?.[additionalFeeColumn] : null,
              });
            }
          }
        }
      }

      // Remove applications with no status details
      branchesWithApplications.forEach((branch) => {
        branch.applications = branch.applications.filter((app) => app.statusDetails.length > 0);
      });

      // Final response
      const finalResults = {
        customerInfo: customerData,
        applicationsByBranch: branchesWithApplications,
      };

      callback(null, finalResults);
    } catch (err) {
      console.error("Error generating invoice:", err);
      callback(err, null);
    }
  },
};

module.exports = generateInvoiceModel;
