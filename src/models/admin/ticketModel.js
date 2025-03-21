const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

function generateTicketNumber() {
  const prefix = "TCK";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // Format: YYYYMMDD
  const uniqueId = String(Math.floor(Math.random() * 1000000)).padStart(6, "0"); // Random 6-digit number
  return `${prefix}-${date}-${uniqueId}`;
}

const Branch = {
  list: async (callback) => {
    try {
      const sql = `
        SELECT 
          T.id, 
          T.ticket_number, 
          T.title, 
          T.description, 
          T.created_at,
          T.branch_id,
          B.name AS branch_name,
          C.id AS customer_id,
          C.name AS customer_name,
          C.client_unique_id
        FROM \`tickets\` AS T
        INNER JOIN \`branches\` AS B ON B.id = T.branch_id
        INNER JOIN \`customers\` AS C ON C.id = T.customer_id
        ORDER BY T.\`created_at\` DESC
      `;

      const results = await sequelize.query(sql, { type: QueryTypes.SELECT });

      // Transform results into a hierarchical structure using a Map for efficiency
      const customersMap = new Map();

      results.forEach((row) => {
        if (!customersMap.has(row.customer_id)) {
          customersMap.set(row.customer_id, {
            customer_id: row.customer_id,
            customer_name: row.customer_name,
            client_unique_id: row.client_unique_id,
            branches: new Map(),
          });
        }

        const customer = customersMap.get(row.customer_id);

        if (!customer.branches.has(row.branch_id)) {
          customer.branches.set(row.branch_id, {
            branch_id: row.branch_id,
            branch_name: row.branch_name,
            tickets: [],
          });
        }

        const branch = customer.branches.get(row.branch_id);

        branch.tickets.push({
          ticket_id: row.id,
          ticket_number: row.ticket_number,
          title: row.title,
          description: row.description,
          created_at: row.created_at,
        });
      });

      // Convert Map values to arrays for final structure
      const formattedResults = Array.from(customersMap.values()).map((customer) => ({
        ...customer,
        branches: Array.from(customer.branches.values()),
      }));

      callback(null, formattedResults);
    } catch (error) {
      console.error("Error fetching ticket list:", error);
      callback({ message: "Failed to fetch ticket list", error }, null);
    }
  },

  getTicketDataByTicketNumber: async (ticketNumber, callback) => {
    try {
      // Query for ticket data
      const sql = `SELECT id, title, description, created_at FROM \`tickets\` WHERE \`ticket_number\` = ? LIMIT 1`;

      const ticketResults = await sequelize.query(sql, {
        replacements: [ticketNumber],
        type: QueryTypes.SELECT,
      });

      if (ticketResults.length === 0) {
        return callback({ message: "Ticket not found" }, null);
      }

      const ticketData = ticketResults[0];

      // Query for conversations related to the ticket
      const conversationsSql = `SELECT id, \`from\`, message, created_at FROM \`ticket_conversations\` WHERE \`ticket_id\` = ?`;

      const conversationResults = await sequelize.query(conversationsSql, {
        replacements: [ticketData.id],
        type: QueryTypes.SELECT,
      });

      // Return structured response
      callback(null, {
        ticket: ticketData,
        conversations: conversationResults,
      });
    } catch (error) {
      console.error("Error fetching ticket data:", error);
      callback({ message: "Failed to fetch ticket data", error }, null);
    }
  },

  chat: async (ticketData, callback) => {
    try {
      // Fetch Ticket Data
      const sqlTicket = `
        SELECT id, branch_id, customer_id, title, description, created_at
        FROM \`tickets\` WHERE \`ticket_number\` = ? LIMIT 1
      `;

      const ticketResults = await sequelize.query(sqlTicket, {
        replacements: [ticketData.ticket_number],
        type: QueryTypes.SELECT,
      });

      if (ticketResults.length === 0) {
        return callback({ message: "Ticket not found" }, null);
      }

      const ticket = ticketResults[0];

      // Fetch Branch Data
      const branchSql = `SELECT id, name, email FROM \`branches\` WHERE \`id\` = ? LIMIT 1`;

      const branchResults = await sequelize.query(branchSql, {
        replacements: [ticket.branch_id],
        type: QueryTypes.SELECT,
      });

      if (branchResults.length === 0) {
        return callback({ message: "Branch not found" }, null);
      }

      // Fetch Customer Data
      const customerSql = `SELECT id, name, emails FROM \`customers\` WHERE \`id\` = ? LIMIT 1`;

      const customerResults = await sequelize.query(customerSql, {
        replacements: [ticket.customer_id],
        type: QueryTypes.SELECT,
      });

      if (customerResults.length === 0) {
        return callback({ message: "Customer not found" }, null);
      }

      // Insert Conversation Data
      const sqlInsertConversation = `
        INSERT INTO \`ticket_conversations\` (branch_id, admin_id, customer_id, ticket_id, \`from\`, message)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const conversationValues = [
        ticket.branch_id,
        ticketData.admin_id,
        ticket.customer_id,
        ticket.id,
        "admin",
        ticketData.message,
      ];

      const conversationResults = await sequelize.query(sqlInsertConversation, {
        replacements: conversationValues,
        type: QueryTypes.INSERT,
      });

      const conversationId = conversationResults[0];

      // Fetch Created At Timestamp
      const sqlGetCreatedAt = `SELECT \`created_at\` FROM \`ticket_conversations\` WHERE \`id\` = ? LIMIT 1`;

      const createdAtResults = await sequelize.query(sqlGetCreatedAt, {
        replacements: [conversationId],
        type: QueryTypes.SELECT,
      });

      if (createdAtResults.length === 0) {
        return callback({ message: "Error fetching conversation timestamp" }, null);
      }

      // Return Response
      callback(null, {
        title: ticket.title,
        description: ticket.description,
        created_at: createdAtResults[0].created_at,
        branch_name: branchResults[0].name,
        branch_email: branchResults[0].email,
        customer_name: customerResults[0].name,
        customer_emails: customerResults[0].emails,
      });
    } catch (error) {
      console.error("Error in chat function:", error);
      callback({ message: "Failed to process chat request", error }, null);
    }
  },

  delete: async (ticket_number, callback) => {
    const transaction = await sequelize.transaction(); // Start transaction
    try {
      // Check if ticket exists
      const sql = `SELECT id FROM \`tickets\` WHERE \`ticket_number\` = ? LIMIT 1`;

      const ticketResults = await sequelize.query(sql, {
        replacements: [ticket_number],
        type: QueryTypes.SELECT,
        transaction,
      });

      if (ticketResults.length === 0) {
        await transaction.rollback();
        return callback({ message: "Ticket not found" }, null);
      }

      const ticketQryData = ticketResults[0];

      // Delete related ticket conversations first
      const deleteConversationsSql = `DELETE FROM \`ticket_conversations\` WHERE \`ticket_id\` = ?`;
      await sequelize.query(deleteConversationsSql, {
        replacements: [ticketQryData.id],
        type: QueryTypes.DELETE,
        transaction,
      });

      // Delete the ticket itself
      const deleteTicketSql = `DELETE FROM \`tickets\` WHERE \`id\` = ?`;
      await sequelize.query(deleteTicketSql, {
        replacements: [ticketQryData.id],
        type: QueryTypes.DELETE,
        transaction,
      });

      await transaction.commit(); // Commit transaction if all deletes are successful

      callback(null, { message: "Ticket and related conversations deleted successfully" });
    } catch (error) {
      await transaction.rollback(); // Rollback transaction on error
      console.error("Error in delete function:", error);
      callback({ message: "Failed to delete ticket", error }, null);
    }
  },

};

module.exports = Branch;
