const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const dav = {
  getDAVApplicationById: async (candidate_application_id, callback) => {
    try {
      const sql = "SELECT * FROM `dav_applications` WHERE `candidate_application_id` = ?";

      const results = await sequelize.query(sql, {
        replacements: [candidate_application_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results.length > 0 ? results[0] : null);
    } catch (error) {
      console.error("Error fetching DAV application:", error);
      callback({ status: false, message: "Internal server error" }, null);
    }
  },

  create: async (
    personal_information,
    candidate_application_id,
    branch_id,
    customer_id,
    callback
  ) => {
    const fields = Object.keys(personal_information);

    // 1. Check for existing columns in dav_applications
    const checkColumnsSql = `SHOW COLUMNS FROM \`dav_applications\``;

    const results = await sequelize.query(checkColumnsSql, {
      type: QueryTypes.SELECT,
    });

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
        async (query) =>
          await sequelize.query(query, {
            type: QueryTypes.SELECT,
          })
      );

      // After altering the table, proceed to insert or update the data
      Promise.all(alterPromises)
        .then(() => {
          // Insert or update entry after table alteration
          dav.insertOrUpdateEntry(
            personal_information,
            candidate_application_id,
            branch_id,
            customer_id,
            callback
          );
        })
        .catch((alterErr) => {
          console.error("Error executing ALTER statements:", alterErr);
          callback(alterErr, null);
        });
    } else {
      // If no columns are missing, proceed to check and insert or update the entry
      dav.insertOrUpdateEntry(
        personal_information,
        candidate_application_id,
        branch_id,
        customer_id,
        callback
      );
    }


  },

  // Helper function for inserting or updating the entry
  insertOrUpdateEntry: async (
    personal_information,
    candidate_application_id,
    branch_id,
    customer_id,
    callback
  ) => {
    // Check if entry exists by candidate_application_id
    const checkEntrySql =
      "SELECT * FROM dav_applications WHERE candidate_application_id = ?";

    const entryResults = await sequelize.query(checkEntrySql, {
      replacements: [candidate_application_id],
      type: QueryTypes.SELECT,
    });

    if (entryResults.length > 0) {
      // Entry exists, so update it
      personal_information.branch_id = branch_id;
      personal_information.customer_id = customer_id;

      const updateSql =
        "UPDATE dav_applications SET ? WHERE candidate_application_id = ?";

      const updateResult = await sequelize.query(updateSql, {
        replacements: [personal_information, candidate_application_id],
        type: QueryTypes.SELECT,
      });

      callback(null, updateResult);
    } else {
      const replacements = {
        ...personal_information,
        candidate_application_id,
        branch_id,
        customer_id,
      };

      // console.log(`replacements - `, replacements);

      // Get keys (indexes) and values
      const indexes = Object.keys(replacements);
      const values = Object.values(replacements);

      // Build the SQL query dynamically
      const insertSql = `INSERT INTO dav_applications (${indexes.join(', ')}) VALUES (${indexes.map(() => '?').join(', ')})`;

      const insertResult = await sequelize.query(insertSql, {
        replacements: values,
        type: QueryTypes.INSERT,
      });
      // console.log(`insertResult - `, insertResult);
      const insertId = insertResult[0];

      callback(null, { insertId });
    }

  },

  updateImages: async (dav_id, candidate_application_id, imagesArr, dbColumn, callback) => {
    try {
      let images = Array.isArray(imagesArr) ? imagesArr.join(",") : imagesArr;

      if (!images) {
        console.error("Images array is empty.");
        return callback(new Error("Images array cannot be empty."), null);
      }

      // Define SQL query for updating images
      const sql = `
        UPDATE \`dav_applications\`
        SET \`${dbColumn}\` = ?
        WHERE \`id\` = ? AND \`candidate_application_id\` = ?
      `;

      // First, check if the column exists
      const checkColumnSql = `SHOW COLUMNS FROM \`dav_applications\` LIKE ?`;
      const checkResults = await sequelize.query(checkColumnSql, {
        replacements: [dbColumn],
        type: QueryTypes.SELECT,
      });

      // If column doesn't exist, add it
      if (checkResults.length === 0) {
        const alterTableSql = `ALTER TABLE \`dav_applications\` ADD COLUMN \`${dbColumn}\` LONGTEXT`;
        await sequelize.query(alterTableSql, { type: QueryTypes.RAW });
      }

      // Execute the update query
      const results = await sequelize.query(sql, {
        replacements: [images, dav_id, candidate_application_id],
        type: QueryTypes.UPDATE,
      });

      callback(null, { status: true, message: "Images updated successfully", affectedRows: results[1] });
    } catch (error) {
      console.error("Error updating images:", error);
      callback(error, null);
    }
  },

};

module.exports = dav;
