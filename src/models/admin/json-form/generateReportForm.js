const { pool, startConnection, connectionRelease } = require("../../../config/db");

const generateReportForm = {
    list: (callback) => {
        const sql = `
            SELECT 
                s.id,
                s.group, 
                s.title, 
                s.short_code,
                rp.json
            FROM \`services\` s
            JOIN \`report_forms\` rp ON rp.service_id = s.id
        `;

        startConnection((err, connection) => {
            if (err) {
                console.error("Database connection error:", err);
                return callback(err, null);
            }

            connection.query(sql, (queryErr, results) => {
                // Ensure connection is released in all cases
                connectionRelease(connection);

                if (queryErr) {
                    console.error("Database query error:", queryErr);
                    return callback(queryErr, null);
                }

                callback(null, results);
            });
        });
    },

    formByServiceId: (service_id, callback) => {
        const sql = `
            SELECT 
                s.id,
                s.group, 
                s.title, 
                s.short_code,
                rp.json
            FROM \`services\` s
            JOIN \`report_forms\` rp ON rp.service_id = s.id
            WHERE s.id = ? 
            LIMIT 1
        `;

        startConnection((err, connection) => {
            if (err) {
                console.error("Database connection error:", err);
                return callback(err, null);
            }

            connection.query(sql, [service_id], (queryErr, results) => {
                // Ensure connection is released in all cases
                connectionRelease(connection);

                if (queryErr) {
                    console.error("Database query error:", queryErr);
                    return callback(queryErr, null);
                }

                // Return the first result or null if no rows are found
                callback(null, results.length > 0 ? results[0] : null);
            });
        });
    },

    updateOrInsert: (serviceId, json, admin_id, callback) => {
        const checkExistenceQuery = `
          SELECT 1 FROM \`report_forms\` WHERE \`service_id\` = ? LIMIT 1;
        `;
        const updateQuery = `
          UPDATE \`report_forms\` 
          SET \`json\` = ? 
          WHERE \`service_id\` = ?;
        `;
        const insertQuery = `
          INSERT INTO \`report_forms\` (\`service_id\`, \`json\`, \`admin_id\`) 
          VALUES (?, ?, ?);
        `;

        startConnection((err, connection) => {
            if (err) {
                console.error("Error establishing database connection:", err);
                return callback(err, null);
            }

            // Step 1: Check if the record exists
            connection.query(checkExistenceQuery, [serviceId], (existErr, results) => {
                if (existErr) {
                    connectionRelease(connection);
                    console.error("Error checking record existence:", existErr);
                    return callback(existErr, null);
                }

                if (results.length > 0) {
                    // Record exists, perform update
                    connection.query(updateQuery, [json, serviceId, admin_id], (updateErr, updateResults) => {
                        connectionRelease(connection);
                        if (updateErr) {
                            console.error("Error updating record:", updateErr);
                            return callback(updateErr, null);
                        }
                        callback(null, { action: "updated", ...updateResults });
                    });
                } else {
                    // Record does not exist, perform insert
                    connection.query(insertQuery, [serviceId, json], (insertErr, insertResults) => {
                        connectionRelease(connection);
                        if (insertErr) {
                            console.error("Error inserting record:", insertErr);
                            return callback(insertErr, null);
                        }
                        callback(null, { action: "inserted", ...insertResults });
                    });
                }
            });
        });
    },
};

module.exports = generateReportForm;
