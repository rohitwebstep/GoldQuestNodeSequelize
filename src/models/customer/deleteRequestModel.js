const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const DeleteRequest = {
    delete: async (id, callback) => {
        try {
            const sql = "SELECT * FROM `delete_requests` WHERE `id` = ?";

            const results = await sequelize.query(sql, {
                replacements: [id],
                type: QueryTypes.SELECT,
            });

            if (!results.length) {
                return callback(new Error("Request not found"), null);
            }

            const { customer_id: customerId, from, to } = results[0];
            const deleteRequestArray = JSON.parse(results[0].deleteRequestArray);

            const customerResults = await sequelize.query("SELECT * FROM `customers` WHERE `id` = ?;", {
                replacements: [customerId],
                type: QueryTypes.SELECT,
            });

            if (!customerResults.length) {
                return callback(new Error("No customer found with the provided ID."), null);
            }

            const customer = customerResults[0];
            const clientUniqueId = customer.client_unique_id;

            const branchResults = await sequelize.query("SELECT * FROM `branches` WHERE `customer_id` = ?;", {
                replacements: [customerId],
                type: QueryTypes.SELECT,
            });

            let combinedData = [];

            // ✅ Use `for...of` to handle async calls properly
            for (const branch of branchResults) {
                let branchData = {
                    branchId: branch.id,
                    branchName: branch.name,
                    clientApplications: [],
                    candidateApplications: []
                };

                let queries = [];

                if (deleteRequestArray?.clientApplications) {
                    queries.push({
                        sql: "SELECT `name`, `application_id`, `created_at` FROM `client_applications` WHERE `branch_id` = ? AND `created_at` BETWEEN ? AND ?;",
                        values: [branch.id, from, to],
                        key: "clientApplications",
                        deleteSQL: "DELETE FROM `client_applications` WHERE `branch_id` = ? AND `created_at` BETWEEN ? AND ?;",
                    });
                }

                if (deleteRequestArray?.candidateApplications) {
                    queries.push({
                        sql: "SELECT `id`, `name`, `created_at` FROM `candidate_applications` WHERE `branch_id` = ? AND `created_at` BETWEEN ? AND ?;",
                        values: [branch.id, from, to],
                        key: "candidateApplications",
                        deleteSQL: "DELETE FROM `candidate_applications` WHERE `branch_id` = ? AND `created_at` BETWEEN ? AND ?;",
                    });
                }

                for (const { sql, values, key, deleteSQL } of queries) {
                    const queryResults = await sequelize.query(sql, {
                        replacements: values,
                        type: QueryTypes.SELECT,
                    });

                    if (key === "candidateApplications") {
                        branchData[key] = queryResults.map((app) => ({
                            name: app.name,
                            application_id: `cd-${clientUniqueId}-${app.id}`,
                            created_at: app.created_at,
                        }));
                    } else {
                        branchData[key] = queryResults;
                    }

                    await sequelize.query(deleteSQL, {
                        replacements: values,
                        type: QueryTypes.DELETE,
                    });
                }

                combinedData.push(branchData);
            }

            return callback(null, {
                client_unique_id: clientUniqueId,
                data: {
                    name: customer.name,
                    email: customer.email,
                    mobile: customer.mobile,
                    branches: combinedData,
                },
            });

        } catch (error) {
            console.error("Error in delete function:", error);
            return callback(new Error("An error occurred while processing the request"), null);
        }
    },

    list: async (callback) => {
        try {
            const sql = `
                SELECT 
                    dr.*, 
                    a.name AS admin_name, a.email AS admin_email, a.mobile AS admin_mobile, 
                    c.name AS customer_name, c.mobile AS customer_mobile, 
                    c.director_email, c.emails 
                FROM \`delete_requests\` dr
                LEFT JOIN \`admins\` a ON a.id = dr.admin_id
                LEFT JOIN \`customers\` c ON c.id = dr.customer_id
                ORDER BY dr.created_at DESC;
            `;

            const results = await sequelize.query(sql, {
                type: QueryTypes.SELECT,
            });

            callback(null, results);
        } catch (error) {
            console.error("Error fetching delete requests:", error);
            callback(new Error("Failed to fetch delete requests"), null);
        }
    },

    updateStatus: async (id, status, callback) => {
        try {
            // Only update if the current status is 'pending'
            const sql = `
                UPDATE \`delete_requests\` 
                SET status = ?, 
                    accepted_at = CASE WHEN ? = 'accepted' THEN NOW() ELSE accepted_at END, 
                    updated_at = NOW() 
                WHERE id = ? AND status = 'pending';
            `;

            const results = await sequelize.query(sql, {
                replacements: [status, status, id],
                type: QueryTypes.UPDATE,
            });
            const affectedRows = results[1];
            console.log(`affectedRows - `, affectedRows);
            // Check if any rows were affected
            if (affectedRows > 0) {
                callback(null, { status: true, message: "Status updated successfully 1", results });
            } else {
                callback({ status: false, message: "No pending request found or status is already updated", results }, null);
            }
        } catch (error) {
            console.error("Error updating status:", error);
            callback(new Error("Failed to update status"), null);
        }
    },

    updateCertificate: async (id, certificatePath, callback) => {
        try {
            const sql = `
                UPDATE \`delete_requests\`
                SET certificate = ?
                WHERE id = ?;
            `;

            const [results] = await sequelize.query(sql, {
                replacements: [certificatePath, id],
                type: QueryTypes.UPDATE,
            });

            callback(null, { status: true, message: "Certificate updated successfully", results });
        } catch (error) {
            console.error("Error updating certificate:", error);
            callback(new Error("Failed to update certificate"), null);
        }
    },

    getDeleteRequestById: async (id, callback) => {
        try {
            const sql = `SELECT * FROM \`delete_requests\` WHERE \`id\` = ?`;

            const results = await sequelize.query(sql, {
                replacements: [id],
                type: QueryTypes.SELECT,
            });

            if (results.length === 0) {
                return callback(new Error("No delete request found with the given ID"), null);
            }

            callback(null, results[0]);
        } catch (error) {
            console.error("Error fetching delete request by ID:", error);
            callback(new Error("Failed to fetch delete request"), null);
        }
    },

};

module.exports = DeleteRequest;
