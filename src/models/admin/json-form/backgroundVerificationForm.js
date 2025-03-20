const { pool, startConnection, connectionRelease } = require("../../../config/db");

const backgroundVerificationForm = {
    list: (callback) => {
        const sql = `
            SELECT 
                s.id,
                s.group, 
                s.title, 
                s.short_code,
                rp.json
            FROM \`services\` s
            JOIN \`cef_service_forms\` rp ON rp.service_id = s.id
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
            JOIN \`cef_service_forms\` rp ON rp.service_id = s.id
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

    update: (
        service_id,
        json,
        callback
    ) => {
        const sql = `
          UPDATE \`cef_service_forms\`
          SET \`json\` = ?
          WHERE \`service_id\` = ?
        `;

        startConnection((err, connection) => {
            if (err) {
                return callback(err, null);
            }

            connection.query(
                sql,
                [json, service_id],
                (queryErr, results) => {
                    connectionRelease(connection); // Release the connection

                    if (queryErr) {
                        console.error(" 51", queryErr);
                        return callback(queryErr, null);
                    }
                    callback(null, results);
                }
            );
        });
    },
};

module.exports = backgroundVerificationForm;
