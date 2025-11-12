const ClientApplication = require("../../../../models/customer/branch/clientApplicationModel");
const CandidateMasterTrackerModel = require("../../../../models/admin/candidateMasterTrackerModel");
const ClientMasterTrackerModel = require("../../../../models/admin/clientMasterTrackerModel");
const BranchCommon = require("../../../../models/customer/branch/commonModel");
const Branch = require("../../../../models/customer/branch/branchModel");
const Service = require("../../../../models/admin/serviceModel");
const Customer = require("../../../../models/customer/customerModel");
const AppModel = require("../../../../models/appModel");
const Admin = require("../../../../models/admin/adminModel");
const Candidate = require("../../../../models/customer/branch/candidateApplicationModel");

const {
    addToStopcheck,
} = require("../../../../mailer/customer/branch/client/addToStopcheck");

const {
    createMail,
} = require("../../../../mailer/customer/branch/client/createMail");

const {
    createMailForSpoc,
} = require("../../../../mailer/customer/branch/client/createMailForSpoc");

const {
    bulkCreateMail,
} = require("../../../../mailer/customer/branch/client/bulkCreateMail");

const fs = require("fs");
const path = require("path");
const {
    upload,
    saveImage,
    saveImages,
    saveBase64Image,
} = require("../../../../utils/cloudImageSave");
const candidateApplication = require("../../../../models/customer/branch/candidateApplicationModel");

exports.list = (req, res) => {
    const {
        access_token
    } = req.query;

    // Define required fields
    const requiredFields = {
        access_token,
    };

    // Check for missing fields
    const missingFields = Object.keys(requiredFields)
        .filter((field) => !requiredFields[field] || requiredFields[field] === "")
        .map((field) => field.replace(/_/g, " "));

    if (missingFields.length > 0) {
        return res.status(400).json({
            status: false,
            message: `Missing required fields: ${missingFields.join(", ")}`,
        });
    }

    Branch.getBranchAndCustomerByAccessToken(access_token, (err, result) => {
        if (err) {
            console.error("Error:", err);
            return res.status(500).json({
                status: false,
                message: "Internal server error. Please try again later.",
                error: err.message,
            });
        }

        if (!result.status) {
            // This means token was invalid or not found
            return res.status(401).json({
                status: false,
                message: result.message || "Invalid or expired access token.",
            });
        }

        const branch = result.data.branch;
        const customer = result.data.customer;

        const branch_id = branch.id;
        const customer_id = customer.id;

        const customerCode = customer.client_unique_id;

        Service.customerAllocatedServices(customer_id, (err, result) => {
            if (err) {
                console.error("Error:", err);
                return res.status(500).json({
                    status: false,
                    message: "Internal server error. Please try again later.",
                    error: err.message,
                });
            }

            if (!result.status) {
                // This means token was invalid or not found
                return res.status(401).json({
                    status: false,
                    message: result.message || "Invalid or expired access token.",
                });
            }

            return res.status(401).json({
                status: false,
                result
            });
        });
    });
};
