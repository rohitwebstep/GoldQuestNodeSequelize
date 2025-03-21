const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const Permission = {
  rolesList: async (callback) => {
    try {
      const rolesSql = `
        SELECT role FROM \`permissions\`
      `;

      const groupsSql = `
        SELECT DISTINCT \`group\` FROM \`services\`
      `;

      const rolesResults = await sequelize.query(rolesSql, {
        type: QueryTypes.SELECT,
      });

      const groupsResults = await sequelize.query(groupsSql, {
        type: QueryTypes.SELECT,
      });

      // Extract just the role and group values into arrays
      const roles = rolesResults.map(role => role.role);
      const groups = groupsResults.map(group => group.group);

      // Return the response with roles and groups as arrays
      callback(null, { roles, groups });
    } catch (error) {
      callback(error, null);
    }
  },

  list: async (callback) => {
    try {
      const sql = `
        SELECT 
          id,
          role,
          json
        FROM \`permissions\`
      `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error fetching permissions:", error);
      callback({ message: "Failed to fetch permissions", error }, null);
    }
  },

  getPermissionById: async (id, callback) => {
    try {
      const sql = `SELECT * FROM \`permissions\` WHERE \`id\` = ?`;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback({ message: "Permission not found" }, null);
      }

      callback(null, results[0]);
    } catch (error) {
      console.error("Error fetching permission:", error);
      callback({ message: "Failed to fetch permission", error }, null);
    }
  },

  getPermissionByRole: async (role, callback) => {
    try {
      const sql = `SELECT * FROM \`permissions\` WHERE \`role\` = ?`;

      const results = await sequelize.query(sql, {
        replacements: [role],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback({ message: "Permission not found for this role" }, null);
      }

      callback(null, results[0]);
    } catch (error) {
      console.error("Error fetching permission by role:", error);
      callback({ message: "Failed to fetch permission", error }, null);
    }
  },


  update: async (id, permission_json, service_ids, callback) => {
    try {
      const sql = `
        UPDATE \`permissions\`
        SET \`json\` = ?
        WHERE \`id\` = ?
      `;

      const [affectedRows] = await sequelize.query(sql, {
        replacements: [permission_json, id],
        type: QueryTypes.RAW, // Use RAW or BULKUPDATE for updates
      });

      if (affectedRows === 0) {
        return callback({ message: "Permission not found or not updated" }, null);
      }

      callback(null, { message: "Permission updated successfully" });
    } catch (error) {
      console.error("Error updating permission:", error);
      callback({ message: "Failed to update permission", error }, null);
    }
  },

};

module.exports = Permission;
