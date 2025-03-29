const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config(); // Ensure you load environment variables

// Import routes
const adminRoutes = require("./routes/admin/indexRoutes");
const ticketRoutes = require("./routes/admin/ticketRoutes");
const userHistoryRoutes = require("./routes/admin/userHistory");
const clientMasterTrackerRoutes = require("./routes/admin/clientMasterTrackerRoutes");
const candidateMasterTrackerRoutes = require("./routes/admin/candidateMasterTrackerRoutes");
const generateInvoiceRoutes = require("./routes/admin/generateInvoiceRoutes");
const acknowledgementRoutes = require("./routes/admin/acknowledgementRoutes");
const externalLoginCredentials = require("./routes/admin/externalLoginCredentialsRoutes");
const jsonFormRoutes = require("./routes/admin/jsonFormRoutes");

const reportSummaryRoutes = require("./routes/admin/reportSummaryRoutes");
const customerRoutes = require("./routes/customer/indexRoutes");
const branchRoutes = require("./routes/customer/branch/indexRoutes");
const databaseRoutes = require("./routes/admin/databaseRoutes");
const packageRoutes = require("./routes/admin/packageRoutes");
const serviceRoutes = require("./routes/admin/serviceRoutes");
const holidayRoutes = require("./routes/admin/holidayRoutes");
const testRoutes = require("./routes/testRoutes");
const deleteRequestRoutes = require("./routes/admin/deleteRequestRoutes");
const tatDelayRoutes = require("./routes/admin/tatDelayRoutes");
const weeklyReportRoutes = require("./routes/admin/weeklyReportRoutes");

const app = express();

// Increase the limit for incoming requests
app.use(bodyParser.json({ limit: '100mb' }));  // Adjust the limit as needed (50mb here)
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

const port = process.env.PORT || 5000;

// Configure CORS
const allowedOrigins = [
  "http://bgvadmin.goldquestglobal.in",
  "https://bgvadmin.goldquestglobal.in",
  "http://bgvadmin.goldquestglobal.in:3000",
  "https://bgvadmin.goldquestglobal.in:3000",
  "http://147.93.29.154",
  "https://147.93.29.154",
  "http://147.93.29.154:3000",
  "https://147.93.29.154:3000",
  "http://localhost:3000",
  "https://localhost:3000"
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true); // Allow the origin
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

// app.use(cors(corsOptions));
app.use(cors());

// Middleware
app.use(bodyParser.json());
app.use("/uploads", express.static("uploads"));

// Define routes
app.use("/admin", adminRoutes);
app.use("/json-form", jsonFormRoutes);

app.use("/ticket", ticketRoutes);
app.use("/user-history", userHistoryRoutes);
app.use("/client-master-tracker", clientMasterTrackerRoutes);
app.use("/candidate-master-tracker", candidateMasterTrackerRoutes);
app.use("/generate-invoice", generateInvoiceRoutes);
app.use("/delete-request", deleteRequestRoutes);
app.use("/weekly-reports", weeklyReportRoutes);
app.use("/acknowledgement", acknowledgementRoutes);
app.use("/external-login-credentials", externalLoginCredentials);
app.use("/report-summary", reportSummaryRoutes);
app.use("/customer", customerRoutes);
app.use("/branch", branchRoutes);
app.use("/database", databaseRoutes);
app.use("/package", packageRoutes);
app.use("/service", serviceRoutes);
app.use("/holiday", holidayRoutes);
app.use("/tat-delay", tatDelayRoutes);
app.use("/test", testRoutes);

// Error handling middleware (optional)
app.use((err, req, res, next) => {
  console.error(err.stack); // Log error stack for debugging
  res.status(500).send("Something broke!"); // Send a generic error message
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
