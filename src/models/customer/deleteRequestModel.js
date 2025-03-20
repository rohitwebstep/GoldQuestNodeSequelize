const { pool, startConnection, connectionRelease } = require("../../config/db");

const DeleteRequest = {
    delete: (id, callback) => {
        startConnection((err, connection) => {
            if (err) return callback({ message: "Failed to connect to the database", error: err }, null);

            const sql = "SELECT * FROM `delete_requests` WHERE `id` = ?";
            connection.query(sql, [id], (queryErr, results) => {
                if (queryErr) {
                    connectionRelease(connection);
                    console.error("Database query error: 49", queryErr);
                    return callback(queryErr, null);
                }

                if (!results.length) {
                    connectionRelease(connection);
                    return callback(new Error("Request not found"), null);
                }

                const { customer_id: customerId, from, to } = results[0];
                const deleteRequestArray = JSON.parse(results[0].deleteRequestArray);

                // Fetch customer details
                connection.query("SELECT * FROM `customers` WHERE `id` = ?;", [customerId], (err, customerResults) => {
                    if (err || !customerResults.length) {
                        connectionRelease(connection);
                        return callback(err || { message: "No customer found with the provided ID." }, null);
                    }

                    const customer = customerResults[0];
                    const clientUniqueId = customer.client_unique_id;

                    // Fetch associated branches
                    connection.query("SELECT * FROM `branches` WHERE `customer_id` = ?;", [customerId], (err, branchResults) => {
                        if (err) {
                            connectionRelease(connection);
                            return callback(err, null);
                        }

                        let combinedData = [];
                        let pendingQueries = branchResults.length;

                        branchResults.forEach((branch) => {
                            let queries = [];

                            // console.log(`deleteRequestArray - `, deleteRequestArray);

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

                            let branchData = { branchId: branch.id, branchName: branch.name, clientApplications: [], candidateApplications: [] };
                            let remainingQueries = queries.length;

                            if (!remainingQueries) {
                                combinedData.push(branchData);
                                if (--pendingQueries === 0) finalizeResponse();
                                return;
                            }

                            queries.forEach(({ sql, values, key, deleteSQL }) => {
                                connection.query(sql, values, (err, results) => {
                                    if (!err && key === "candidateApplications") {
                                        results = results.map((app) => ({
                                            name: app.name,
                                            application_id: `cd-${clientUniqueId}-${app.id}`,
                                            created_at: app.created_at,
                                        }));
                                    }
                                    if (!err) branchData[key] = results;

                                    // Delete records after fetching
                                    connection.query(deleteSQL, values, (delErr) => {
                                        if (delErr) console.error(`Error deleting ${key}:`, delErr);

                                        if (--remainingQueries === 0) {
                                            combinedData.push(branchData);
                                            if (--pendingQueries === 0) finalizeResponse();
                                        }
                                    });
                                });
                            });
                        });

                        function finalizeResponse() {
                            connectionRelease(connection);
                            return callback(null, {
                                client_unique_id: clientUniqueId,
                                data: {
                                    name: customer.name,
                                    email: customer.email,
                                    mobile: customer.mobile,
                                    branches: combinedData,
                                },
                            });
                        }
                    });
                });
            });
        });
    },

    list: (callback) => {
        const sql = `
            SELECT 
                dr.*, 
                a.name AS admin_name, a.email AS admin_email, a.mobile AS admin_mobile, 
                c.name AS customer_name, c.mobile AS customer_mobile, 
                c.director_email, c.emails 
            FROM \`delete_requests\` dr
            LEFT JOIN \`admins\` a ON a.id = dr.admin_id
            LEFT JOIN \`customers\` c ON c.id = dr.customer_id
        `;

        startConnection((err, connection) => {
            if (err) {
                return callback(err, null);
            }

            connection.query(sql, (queryErr, results) => {
                connectionRelease(connection); // Release the connection

                if (queryErr) {
                    console.error("Database query error: 47", queryErr);
                    return callback(queryErr, null);
                }
                callback(null, results);
            });
        });
    },

    updateStatus: (id, status, callback) => {
        const sql = `
            UPDATE \`delete_requests\` 
            SET status = ?, 
                accepted_at = CASE WHEN ? = 'accepted' THEN NOW() ELSE accepted_at END, 
                updated_at = NOW() 
            WHERE id = ?;
        `;

        startConnection((err, connection) => {
            if (err) {
                return callback(err, null);
            }

            connection.query(sql, [status, status, id], (queryErr, results) => {
                connectionRelease(connection); // Release the connection

                if (queryErr) {
                    console.error("Database query error: 47", queryErr);
                    return callback(queryErr, null);
                }
                callback(null, results);
            });
        });
    },

    updateCertificate: (id, certificatePath, callback) => {
        const sql = `
            UPDATE \`delete_requests\`
            SET certificate = ?
            WHERE id = ?;
        `;

        startConnection((err, connection) => {
            if (err) return callback(err, null);

            connection.query(sql, [certificatePath, id], (queryErr, results) => {
                connectionRelease(connection); // Release the connection

                if (queryErr) {
                    console.error("Database query error in updateCertificate:", queryErr);
                    return callback(queryErr, null);
                }

                callback(null, results);
            });
        });
    },

    getDeleteRequestById: (id, callback) => {
        const sql = `SELECT * FROM \`delete_requests\` WHERE \`id\` = ?`;

        startConnection((err, connection) => {
            if (err) {
                return callback(err, null);
            }

            connection.query(sql, [id], (queryErr, results) => {
                connectionRelease(connection); // Release the connection

                if (queryErr) {
                    console.error("Database query error: 49", queryErr);
                    return callback(queryErr, null);
                }
                callback(null, results[0]);
            });
        });
    },
};

module.exports = DeleteRequest;
