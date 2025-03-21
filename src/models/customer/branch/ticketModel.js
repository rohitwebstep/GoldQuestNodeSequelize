const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

function generateTicketNumber() {
  const prefix = "TCK";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // Format: YYYYMMDD
  const uniqueId = String(Math.floor(Math.random() * 1000000)).padStart(6, "0"); // Random 6-digit number
  return `${prefix}-${date}-${uniqueId}`;
}

const Branch = {
  create: async (ticketData, callback) => {
    try {
      const ticketNumber = generateTicketNumber(); // Ensure this function generates a unique ticket number

      const sqlInsertTicket = `
            INSERT INTO \`tickets\` (
                \`branch_id\`, \`customer_id\`, \`ticket_number\`, \`title\`, \`description\`
            ) VALUES (?, ?, ?, ?, ?)
        `;

      const ticketValues = [
        ticketData.branch_id,
        ticketData.customer_id,
        ticketNumber,
        ticketData.title,
        ticketData.description,
      ];

      const [result] = await sequelize.query(sqlInsertTicket, {
        replacements: ticketValues,
        type: QueryTypes.INSERT,
      });

      const ticketId = result.insertId; // Correct way to get the inserted ID

      callback(null, { ticketNumber, ticketId });
    } catch (error) {
      console.error("Error creating ticket:", error);
      callback(error, null);
    }
  },

  list: async (branch_id, callback) => {
    try {
      const sql = `
            SELECT id, ticket_number, title, description, created_at 
            FROM \`tickets\` 
            WHERE \`branch_id\` = ? 
            ORDER BY \`created_at\` DESC
        `;

      const results = await sequelize.query(sql, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error fetching tickets list:", error);
      callback(error, null);
    }
  },

  getTicketDataByTicketNumber: async (ticketNumber, branchId, callback) => {
    try {
      const sql = `
            SELECT id, title, description, created_at 
            FROM \`tickets\` 
            WHERE \`ticket_number\` = ? AND \`branch_id\` = ? 
            LIMIT 1
        `;

      const ticketResults = await sequelize.query(sql, {
        replacements: [ticketNumber, branchId],
        type: QueryTypes.SELECT,
      });

      if (ticketResults.length === 0) {
        return callback({ message: "Ticket not found" }, null);
      }

      const ticketData = ticketResults[0];

      // Get the conversations associated with the ticket
      const conversationsSql = `
            SELECT id, \`from\`, message, created_at 
            FROM \`ticket_conversations\` 
            WHERE ticket_id = ? AND branch_id = ?
        `;

      const conversationResults = await sequelize.query(conversationsSql, {
        replacements: [ticketData.id, branchId],
        type: QueryTypes.SELECT,
      });

      // Return both ticket data and conversations
      callback(null, {
        ticket: ticketData,
        conversations: conversationResults,
      });

    } catch (error) {
      console.error("Error fetching ticket data:", error);
      callback(error, null);
    }
  },

  chat: async (ticketData, callback) => {
    try {
      // Fetch ticket details
      const sql = `
            SELECT id, title, description, created_at 
            FROM \`tickets\` 
            WHERE \`ticket_number\` = ? AND \`branch_id\` = ? 
            LIMIT 1
        `;

      const ticketResults = await sequelize.query(sql, {
        replacements: [ticketData.ticket_number, ticketData.branch_id],
        type: QueryTypes.SELECT,
      });

      if (ticketResults.length === 0) {
        return callback({ message: "Ticket not found" }, null);
      }

      const ticketQryData = ticketResults[0];

      // Insert new conversation
      const sqlInsertTicketConversation = `
            INSERT INTO \`ticket_conversations\` (
                \`branch_id\`, \`customer_id\`, \`ticket_id\`, \`from\`, \`message\`, \`created_at\`
            ) VALUES (?, ?, ?, ?, ?, NOW())
        `;

      await sequelize.query(sqlInsertTicketConversation, {
        replacements: [
          ticketData.branch_id,
          ticketData.customer_id,
          ticketQryData.id,
          "branch",
          ticketData.message,
        ],
        type: QueryTypes.INSERT, // Correct Query Type for INSERT
      });

      // Return ticket details with current timestamp
      callback(null, {
        title: ticketQryData.title,
        description: ticketQryData.description,
        created_at: new Date().toISOString(), // Return server time instead of querying again
      });

    } catch (error) {
      console.error("Error in chat function:", error);
      callback(error, null);
    }
  },

  delete: async (ticket_number, branch_id, callback) => {
    try {
      // Fetch ticket ID
      const sql = `
        SELECT id FROM \`tickets\` WHERE \`ticket_number\` = ? AND \`branch_id\` = ? LIMIT 1
      `;

      const ticketResults = await sequelize.query(sql, {
        replacements: [ticket_number, branch_id],
        type: QueryTypes.SELECT,
      });

      if (ticketResults.length === 0) {
        return callback({ message: "Ticket not found" }, null);
      }

      const ticketId = ticketResults[0].id;

      // Delete ticket conversations first
      const deleteConversationsSql = `DELETE FROM \`ticket_conversations\` WHERE \`ticket_id\` = ?`;
      await sequelize.query(deleteConversationsSql, {
        replacements: [ticketId],
        type: QueryTypes.DELETE, // Correct QueryType for DELETE
      });

      // Delete the ticket
      const deleteTicketSql = `DELETE FROM \`tickets\` WHERE \`id\` = ?`;
      const deleteTicketResults = await sequelize.query(deleteTicketSql, {
        replacements: [ticketId],
        type: QueryTypes.DELETE, // Correct QueryType for DELETE
      });

      callback(null, { message: "Ticket deleted successfully" });

    } catch (error) {
      console.error("Error in delete function:", error);
      callback(error, null);
    }
  }

};

module.exports = Branch;
