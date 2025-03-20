const crypto = require("crypto");
const {
  pool,
  startConnection,
  connectionRelease,
} = require("../../../config/db");

const dav = {
  getDAVApplicationById: (candidate_application_id, callback) => {
    startConnection((err, connection) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      const sql =
        "SELECT * FROM `dav_applications` WHERE `candidate_application_id` = ?";
      connection.query(sql, [candidate_application_id], (queryErr, results) => {
        connectionRelease(connection); // Ensure the connection is released

        if (queryErr) {
          console.error("Database query error: 122", queryErr);
          return callback(queryErr, null);
        }
        callback(null, results[0]);
      });
    });
  },

  create: (
    personal_information,
    candidate_application_id,
    branch_id,
    customer_id,
    callback
  ) => {
    const fields = Object.keys(personal_information);

    startConnection((err, connection) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return callback(
          { message: "Failed to connect to the database", error: err },
          null
        );
      }

      // 1. Check for existing columns in dav_applications
      const checkColumnsSql = `SHOW COLUMNS FROM \`dav_applications\``;

      connection.query(checkColumnsSql, (err, results) => {
        if (err) {
          console.error("Error checking columns:", err);
          connectionRelease(connection);
          return callback(err, null);
        }

        const existingColumns = results.map((row) => row.Field);
        const missingColumns = fields.filter(
          (field) => !existingColumns.includes(field)
        );

        // 2. If there are missing columns, alter the table to add them
        if (missingColumns.length > 0) {
          const alterQueries = missingColumns.map((column) => {
            return `ALTER TABLE dav_applications ADD COLUMN \`${column}\` LONGTEXT`; // Adjust data type as necessary
          });

          // Run all ALTER statements
          const alterPromises = alterQueries.map(
            (query) =>
              new Promise((resolve, reject) => {
                connection.query(query, (alterErr) => {
                  if (alterErr) {
                    console.error("Error adding column:", alterErr);
                    return reject(alterErr);
                  }
                  resolve();
                });
              })
          );

          // After altering the table, proceed to insert or update the data
          Promise.all(alterPromises)
            .then(() => {
              // Insert or update entry after table alteration
              dav.insertOrUpdateEntry(
                connection,
                personal_information,
                candidate_application_id,
                branch_id,
                customer_id,
                callback
              );
            })
            .catch((alterErr) => {
              console.error("Error executing ALTER statements:", alterErr);
              connectionRelease(connection);
              callback(alterErr, null);
            });
        } else {
          // If no columns are missing, proceed to check and insert or update the entry
          dav.insertOrUpdateEntry(
            connection,
            personal_information,
            candidate_application_id,
            branch_id,
            customer_id,
            callback
          );
        }
      });
    });
  },

  // Helper function for inserting or updating the entry
  insertOrUpdateEntry: (
    connection,
    personal_information,
    candidate_application_id,
    branch_id,
    customer_id,
    callback
  ) => {
    // Check if entry exists by candidate_application_id
    const checkEntrySql =
      "SELECT * FROM dav_applications WHERE candidate_application_id = ?";
    connection.query(
      checkEntrySql,
      [candidate_application_id],
      (entryErr, entryResults) => {
        if (entryErr) {
          console.error("Error checking entry existence:", entryErr);
          return callback(entryErr, null);
        }

        if (entryResults.length > 0) {
          // Entry exists, so update it
          personal_information.branch_id = branch_id;
          personal_information.customer_id = customer_id;

          const updateSql =
            "UPDATE dav_applications SET ? WHERE candidate_application_id = ?";
          connection.query(
            updateSql,
            [personal_information, candidate_application_id],
            (updateErr, updateResult) => {
              connectionRelease(connection); // Ensure the connection is released
              if (updateErr) {
                console.error("Error updating application:", updateErr);
                return callback(updateErr, null);
              }
              callback(null, updateResult);
            }
          );
        } else {
          // Entry does not exist, so insert it
          const insertSql = "INSERT INTO dav_applications SET ?";
          connection.query(
            insertSql,
            {
              ...personal_information,
              candidate_application_id,
              branch_id,
              customer_id,
            },
            (insertErr, insertResult) => {
              connectionRelease(connection); // Ensure the connection is released
              if (insertErr) {
                console.error("Error inserting application:", insertErr);
                return callback(insertErr, null);
              }
              callback(null, insertResult);
            }
          );
        }
      }
    );
  },

  updateImages: (
    dav_id,
    candidate_application_id,
    imagesArr,
    dbColumn,
    callback
  ) => {
    // Check if `imagesArr` is an array
    let images;
    if (Array.isArray(imagesArr)) {
      if (imagesArr.length === 0) {
        console.error("Images array is empty.");
        return callback(new Error("Images array cannot be empty."), null);
      }
      // Convert images array into a comma-separated string
      images = imagesArr.join(",");
    } else {
      // If `imagesArr` is not an array, use it as-is
      images = imagesArr;
    }

    // Define the SQL query with placeholders
    const sql = `
      UPDATE \`dav_applications\`
      SET \`${dbColumn}\` = ?
      WHERE \`id\` = ? AND \`candidate_application_id\` = ?
    `;

    // Start a database connection
    startConnection((err, connection) => {
      if (err) {
        console.error("Error establishing database connection:", err.message);
        return callback(err, null);
      }

      // First, check if the column exists
      const checkColumnSql = `SHOW COLUMNS FROM \`dav_applications\``;

      connection.query(checkColumnSql, (checkErr, checkResults) => {
        if (checkErr) {
          console.error("Error checking column existence:", checkErr.message);
          connectionRelease(connection);
          return callback(checkErr, null);
        }

        const existingColumns = checkResults.map((row) => row.Field);
        // If column doesn't exist, alter the table
        if (!existingColumns.includes(dbColumn)) {
          const alterTableSql = `
            ALTER TABLE \`dav_applications\`
            ADD COLUMN \`${dbColumn}\` LONGTEXT
          `;

          connection.query(alterTableSql, (alterErr) => {
            if (alterErr) {
              console.error("Error altering table:", alterErr.message);
              connectionRelease(connection);
              return callback(alterErr, null);
            }

            // Now execute the update query
            connection.query(
              sql,
              [images, dav_id, candidate_application_id],
              (queryErr, results) => {
                // Release the connection back to the pool
                connectionRelease(connection);

                if (queryErr) {
                  console.error("Error executing query:", queryErr.message);
                  console.debug("Query error details:", queryErr);
                  return callback(queryErr, null);
                }

                callback(null, results);
              }
            );
          });
        } else {
          // If the column exists, execute the update query directly
          connection.query(
            sql,
            [images, dav_id, candidate_application_id],
            (queryErr, results) => {
              // Release the connection back to the pool
              connectionRelease(connection);

              if (queryErr) {
                console.error("Error executing query:", queryErr.message);
                console.debug("Query error details:", queryErr);
                return callback(queryErr, null);
              }

              callback(null, results);
            }
          );
        }
      });
    });
  },
};

module.exports = dav;
