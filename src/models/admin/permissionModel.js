const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const Permission = {
  rolesList: async (callback) => {
    try {
      const rolesSql = "SELECT role FROM `permissions`";
      const groupsSql = "SELECT DISTINCT `group` FROM `services`";

      // Execute queries using Sequelize raw query
      const rolesResults = await sequelize.query(rolesSql, {
        type: sequelize.QueryTypes.SELECT,
      });

      const groupsResults = await sequelize.query(groupsSql, {
        type: sequelize.QueryTypes.SELECT,
      });

      // Extract values into arrays
      const roles = rolesResults.map(role => role.role);
      const groups = groupsResults.map(group => group.group);

      // Return the response with roles and groups as arrays
      const response = {
        roles: roles,
        groups: groups,
      };

      return callback(null, response);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  list: async (callback) => {
    try {
      const sql = "SELECT id, role, json FROM `permissions`";
      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  getPermissionById: async (id, callback) => {
    try {
      const sql = "SELECT * FROM `permissions` WHERE `id` = ?";
      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      return callback(null, results[0] || null);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  getPermissionByRole: async (role, callback) => {
    try {
      const sql = "SELECT * FROM `permissions` WHERE `role` = ?";
      const results = await sequelize.query(sql, {
        replacements: [role],
        type: QueryTypes.SELECT,
      });

      return callback(null, results[0] || null);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  update: async (id, permission_json, service_ids, callback) => {
    try {
      const sql = `
          UPDATE \`permissions\`
          SET \`json\` = ?
          WHERE \`id\` = ?
        `;

      const results = await sequelize.query(sql, {
        replacements: [permission_json, id],
        type: QueryTypes.UPDATE,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },
};

module.exports = Permission;
